import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Upload, ShieldCheck, KeyRound, Save } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, SectionHeader } from "@/components/app/ui-bits";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/use-permissions";
import { useDialog } from "@/components/app/dialog-provider";
import { cifrarIBAN, descifrarIBAN } from "@/lib/iban-crypto";

export const Route = createFileRoute("/configuracion/perfil")({
  component: PerfilPage,
  head: () => ({ meta: [{ title: "Mi perfil · Correduría OS" }] }),
});

function PerfilPage() {
  const { perfil, loading } = usePermissions();
  const router = useRouter();
  const { toast } = useDialog();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    nombre: perfil?.nombre || "",
    telefono: perfil?.telefono || "",
    iban: descifrarIBAN(perfil?.iban_cifrado),
  });
  const [pwd, setPwd] = useState({ nueva: "", confirma: "" });
  const [mfaStatus, setMfaStatus] = useState<"idle"|"enrolling"|"enrolled">("idle");
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");

  // Sincronizar el form cuando el perfil llega (sin setState en render)
  useEffect(() => {
    if (perfil) {
      setForm({
        nombre: perfil.nombre || "",
        telefono: perfil.telefono || "",
        iban: descifrarIBAN(perfil.iban_cifrado),
      });
    }
  }, [perfil]);

  if (loading || !perfil) {
    return <PageShell title="Mi perfil"><Card className="p-8 text-[13px] text-ink-subtle text-center">Cargando…</Card></PageShell>;
  }

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("usuarios").update({
      nombre: form.nombre,
      telefono: form.telefono || null,
      iban_cifrado: cifrarIBAN(form.iban),
    }).eq("id", perfil.id);
    setBusy(false);
    if (error) toast("Error: " + error.message, "error");
    else { toast("Perfil guardado", "success"); router.invalidate(); }
  };

  const subirFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    const path = `${perfil.id}/${Date.now()}_${f.name}`;
    const { error: errUp } = await supabase.storage.from("fotos-perfil").upload(path, f, { upsert: true });
    if (errUp) { toast("Error: " + errUp.message, "error"); setBusy(false); return; }
    const { data: pub } = supabase.storage.from("fotos-perfil").getPublicUrl(path);
    await supabase.from("usuarios").update({ foto_url: pub.publicUrl }).eq("id", perfil.id);
    setBusy(false);
    router.invalidate();
  };

  const cambiarPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.nueva !== pwd.confirma) { toast("Las contraseñas no coinciden", "warning"); return; }
    if (pwd.nueva.length < 6) { toast("Mínimo 6 caracteres", "warning"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pwd.nueva });
    setBusy(false);
    if (error) toast("Error: " + error.message, "error");
    else { toast("Contraseña actualizada", "success"); setPwd({ nueva: "", confirma: "" }); }
  };

  const iniciar2FA = async () => {
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    setBusy(false);
    if (error) { toast("Error 2FA: " + error.message, "error"); return; }
    setFactorId(data.id);
    setQrUrl(data.totp.qr_code);
    setMfaStatus("enrolling");
  };

  const confirmar2FA = async () => {
    if (!factorId || !otpCode) return;
    setBusy(true);
    const { data: challenge } = await supabase.auth.mfa.challenge({ factorId });
    if (!challenge) { setBusy(false); toast("No se pudo generar challenge", "error"); return; }
    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: otpCode,
    });
    setBusy(false);
    if (error) toast("Código incorrecto: " + error.message, "error");
    else { setMfaStatus("enrolled"); toast("2FA activado", "success"); }
  };

  return (
    <PageShell
      title="Mi perfil"
      subtitle="Tu información personal, datos bancarios y seguridad de cuenta."
      action={
        <Link to="/configuracion" className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
          <ArrowLeft className="size-3.5" /> Volver
        </Link>
      }
    >
      <div className="grid grid-cols-12 gap-6">
        <Card className="col-span-12 lg:col-span-7 p-5">
          <SectionHeader title="Información personal" />
          <div className="flex items-center gap-4 mb-5">
            <div className="size-16 rounded-full bg-brand-soft text-brand grid place-items-center overflow-hidden">
              {perfil.foto_url ? (
                <img src={perfil.foto_url} alt="Foto" className="size-full object-cover" />
              ) : (
                <span className="text-[18px] font-bold">{perfil.nombre?.split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase()}</span>
              )}
            </div>
            <div>
              <input ref={fileRef} type="file" accept="image/*" onChange={subirFoto} className="hidden" title="Foto de perfil" />
              <button type="button" onClick={() => fileRef.current?.click()} className="text-[11px] py-1 px-2.5 rounded ring-1 ring-border hover:bg-secondary cursor-pointer flex items-center gap-1.5">
                <Upload className="size-3" /> Subir foto
              </button>
            </div>
          </div>

          <form onSubmit={guardar} className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Nombre</label>
              <input required value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-ink-subtle mb-1">Email</label>
                <input disabled value={perfil.email} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border opacity-60" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-ink-subtle mb-1">Teléfono</label>
                <input type="tel" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">IBAN (para domiciliación de comisiones)</label>
              <input type="text" placeholder="ES00 0000 0000 0000 0000 0000" value={form.iban} onChange={e => setForm({ ...form, iban: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none font-mono" />
              <p className="text-[10px] text-ink-subtle mt-1">Solo visible para ti y para root.</p>
            </div>
            <button type="submit" disabled={busy} className="text-[12px] py-1.5 px-3 rounded bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
              <Save className="size-3.5" /> Guardar perfil
            </button>
          </form>
        </Card>

        <aside className="col-span-12 lg:col-span-5 space-y-6">
          <Card className="p-5">
            <SectionHeader title="Cambiar contraseña" />
            <form onSubmit={cambiarPassword} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-ink-subtle mb-1">Nueva contraseña</label>
                <input type="password" value={pwd.nueva} onChange={e => setPwd({ ...pwd, nueva: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-ink-subtle mb-1">Confirmar</label>
                <input type="password" value={pwd.confirma} onChange={e => setPwd({ ...pwd, confirma: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
              </div>
              <button type="submit" disabled={busy || !pwd.nueva} className="text-[12px] py-1.5 px-3 rounded bg-foreground text-background cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
                <KeyRound className="size-3.5" /> Cambiar
              </button>
            </form>
          </Card>

          <Card className="p-5">
            <SectionHeader title="2FA · Doble factor" hint="App Google Authenticator / Authy" />
            {mfaStatus === "idle" && (
              <button type="button" onClick={iniciar2FA} disabled={busy} className="text-[12px] py-1.5 px-3 rounded ring-1 ring-brand bg-brand-soft text-brand hover:brightness-105 cursor-pointer flex items-center gap-1.5">
                <ShieldCheck className="size-3.5" /> Activar 2FA
              </button>
            )}
            {mfaStatus === "enrolling" && qrUrl && (
              <div className="space-y-3">
                <div className="text-[11px] text-ink-subtle">Escanea con Google Authenticator e introduce el código:</div>
                <img src={qrUrl} alt="QR 2FA" className="w-40 h-40 mx-auto bg-white rounded" />
                <input type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={otpCode} onChange={e => setOtpCode(e.target.value)} className="w-full text-center font-mono text-[18px] bg-secondary border-0 rounded px-3 py-2 ring-1 ring-border focus:ring-brand/30 outline-none" />
                <button type="button" onClick={confirmar2FA} disabled={busy || otpCode.length !== 6} className="w-full text-[12px] py-2 rounded bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50">
                  Confirmar y activar
                </button>
              </div>
            )}
            {mfaStatus === "enrolled" && (
              <div className="text-[12px] text-success flex items-center gap-2">
                <ShieldCheck className="size-4" /> 2FA activado. Pedirá código en cada login.
              </div>
            )}
          </Card>
        </aside>
      </div>
    </PageShell>
  );
}
