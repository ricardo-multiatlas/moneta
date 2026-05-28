import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, AlertTriangle, PenLine } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, KpiCard, StatusBadge, Modal } from "@/components/app/ui-bits";
import { RowActions } from "@/components/app/row-actions";
import { DetailModal } from "@/components/app/detail-modal";
import { supabase } from "@/lib/supabase";
import { useDialog } from "@/components/app/dialog-provider";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/firmas")({
  component: FirmasPage,
  head: () => ({ meta: [{ title: "Firmas electrónicas · Correduría OS" }] }),
  loader: async () => {
    const { data: firmas } = await supabase
      .from("firmas")
      .select(`
        id, firmante_email, firmante_nombre, proveedor, estado, firmado_at, created_at,
        documento_url, poliza_id, presupuesto_id,
        polizas(numero_poliza),
        presupuestos(numero)
      `)
      .order("created_at", { ascending: false });
    return { firmas: firmas || [] };
  },
});

function FirmasPage() {
  const { firmas } = Route.useLoaderData();
  const router = useRouter();
  const { toast } = useDialog();
  const { esRoot, esComercial, esJefeZona, loading } = usePermissions();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);
  const [polizas, setPolizas] = useState<any[]>([]);
  const [presupuestos, setPresupuestos] = useState<any[]>([]);
  const [form, setForm] = useState({
    tipo: "poliza" as "poliza" | "presupuesto",
    poliza_id: "",
    presupuesto_id: "",
    documento_url: "",
    firmante_email: "",
    firmante_nombre: "",
  });

  useEffect(() => {
    (async () => {
      const [{ data: pol }, { data: pre }] = await Promise.all([
        supabase.from("polizas").select("id, numero_poliza").order("numero_poliza"),
        supabase.from("presupuestos").select("id, numero").order("numero"),
      ]);
      setPolizas(pol || []);
      setPresupuestos(pre || []);
    })();
  }, []);

  if (!loading && !esRoot && !esComercial && !esJefeZona) {
    return <PageShell title="Sin acceso"><Card className="p-8 text-center text-[13px] text-ink-subtle">Sin permisos.</Card></PageShell>;
  }

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const payload: any = {
      documento_url: form.documento_url || "pendiente://sin-documento",
      firmante_email: form.firmante_email,
      firmante_nombre: form.firmante_nombre || null,
      proveedor: "pendiente",
      estado: "enviado",
    };
    if (form.tipo === "poliza" && form.poliza_id) payload.poliza_id = form.poliza_id;
    if (form.tipo === "presupuesto" && form.presupuesto_id) payload.presupuesto_id = form.presupuesto_id;

    const { error } = await supabase.from("firmas").insert(payload);
    setBusy(false);
    if (error) { toast("Error: " + error.message, "error"); return; }
    setOpen(false);
    setForm({ tipo: "poliza", poliza_id: "", presupuesto_id: "", documento_url: "", firmante_email: "", firmante_nombre: "" });
    toast("Solicitud de firma creada (provider pendiente)", "success");
    router.invalidate();
  };

  const totalPendientes = firmas.filter((f: any) => f.estado === "enviado" || f.estado === "visto").length;
  const totalFirmadas = firmas.filter((f: any) => f.estado === "firmado").length;

  return (
    <PageShell
      title="Firmas electrónicas"
      subtitle="Solicita firmas a clientes para pólizas, presupuestos y documentos."
      action={
        <button type="button" onClick={() => setOpen(true)} className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 flex items-center gap-1.5 cursor-pointer">
          <Plus className="size-3.5" /> Solicitar firma
        </button>
      }
    >
      <Card className="p-3 mb-4 bg-warning/5 ring-warning/20">
        <div className="flex items-start gap-2.5 text-[11.5px]">
          <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
          <div className="text-ink-muted">
            <strong className="text-warning">Provider de firma no conectado todavía.</strong> Para activar firma real, configurar DocuSign / Signaturit / ValidatedID en config. Por ahora las solicitudes quedan registradas con estado "enviado" y proveedor "pendiente".
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <KpiCard label="Total solicitudes" value={String(firmas.length)} hint="todas" />
        <KpiCard label="Pendientes" value={String(totalPendientes)} hint="enviado / visto" deltaTone="warning" />
        <KpiCard label="Firmadas" value={String(totalFirmadas)} delta="completadas" deltaTone="success" />
      </div>

      <Card>
        {firmas.length === 0 ? (
          <div className="p-8 text-center text-[12px] text-ink-subtle">
            Sin solicitudes de firma. Crea la primera con el botón "Solicitar firma".
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Documento</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Firmante</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Proveedor</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Solicitada</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {firmas.map((f: any) => {
                const ref = f.polizas?.numero_poliza || f.presupuestos?.numero || "—";
                const tone = f.estado === "firmado" ? "success" : f.estado === "rechazado" || f.estado === "expirado" || f.estado === "error" ? "danger" : "warning";
                return (
                  <tr key={f.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-[12px] font-mono">
                      <PenLine className="size-3 inline mr-1 text-ink-subtle" />
                      {ref}
                    </td>
                    <td className="px-4 py-3 text-[12px]">
                      <div>{f.firmante_nombre || "—"}</div>
                      <div className="text-[10px] text-ink-subtle">{f.firmante_email}</div>
                    </td>
                    <td className="px-4 py-3 text-[11px] uppercase font-mono text-ink-muted">{f.proveedor}</td>
                    <td className="px-4 py-3"><StatusBadge tone={tone as any}>{f.estado}</StatusBadge></td>
                    <td className="px-4 py-3 text-[11px] font-mono text-ink-muted">
                      {new Date(f.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <RowActions
                        actions={[
                          { icon: "view", label: "Ver datos", onClick: () => setViewing(f), tone: "brand" },
                          { icon: "edit", label: "Reenviar (pendiente)", disabled: true },
                          { icon: "print", label: "—", disabled: true },
                          { icon: "download", label: "Descargar (pendiente)", disabled: true },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Solicitar firma electrónica">
        <form onSubmit={guardar} className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Tipo de documento</label>
            <select title="Tipo" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as any })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none">
              <option value="poliza">Póliza</option>
              <option value="presupuesto">Presupuesto</option>
            </select>
          </div>
          {form.tipo === "poliza" ? (
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Póliza</label>
              <select title="Póliza" value={form.poliza_id} onChange={e => setForm({ ...form, poliza_id: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none">
                <option value="">Selecciona…</option>
                {polizas.map((p) => <option key={p.id} value={p.id}>{p.numero_poliza}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Presupuesto</label>
              <select title="Presupuesto" value={form.presupuesto_id} onChange={e => setForm({ ...form, presupuesto_id: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none">
                <option value="">Selecciona…</option>
                {presupuestos.map((p) => <option key={p.id} value={p.id}>{p.numero}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Email firmante</label>
              <input required type="email" value={form.firmante_email} placeholder="cliente@email.com" onChange={e => setForm({ ...form, firmante_email: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Nombre firmante</label>
              <input type="text" value={form.firmante_nombre} placeholder="Nombre Apellido" onChange={e => setForm({ ...form, firmante_nombre: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">URL documento (opcional)</label>
            <input type="url" value={form.documento_url} placeholder="https://… (cuando provider esté conectado)" onChange={e => setForm({ ...form, documento_url: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="text-[12px] py-1.5 px-3 rounded ring-1 ring-border hover:bg-secondary cursor-pointer">Cancelar</button>
            <button type="submit" disabled={busy} className="text-[12px] py-1.5 px-3 rounded bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50">
              {busy ? "Creando…" : "Crear solicitud"}
            </button>
          </div>
        </form>
      </Modal>

      <DetailModal
        isOpen={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `Firma · ${viewing.polizas?.numero_poliza || viewing.presupuestos?.numero || viewing.id.slice(0, 8)}` : ""}
        subtitle={viewing?.firmante_email}
        rows={viewing ? [
          { label: "Firmante", value: viewing.firmante_nombre || "—" },
          { label: "Email", value: viewing.firmante_email },
          { label: "Proveedor", value: viewing.proveedor },
          { label: "Estado", value: <StatusBadge tone={viewing.estado === "firmado" ? "success" : "warning"}>{viewing.estado}</StatusBadge> },
          { label: "Documento", value: viewing.documento_url },
          { label: "Solicitada", value: new Date(viewing.created_at).toLocaleString() },
          { label: "Firmada", value: viewing.firmado_at ? new Date(viewing.firmado_at).toLocaleString() : "—" },
        ] : []}
      />
    </PageShell>
  );
}
