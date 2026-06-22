import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, FileSignature, Mail } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, KpiCard, MoneyEUR, RamoChip, StatusBadge, Modal } from "@/components/app/ui-bits";
import { RowActions } from "@/components/app/row-actions";
import { DetailModal } from "@/components/app/detail-modal";
import { supabase } from "@/lib/supabase";
import { generarFichaPDF, descargarBlob, imprimirBlob } from "@/lib/generic-pdf";
import { useDialog } from "@/components/app/dialog-provider";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/presupuestos")({
  component: PresupuestosPage,
  head: () => ({ meta: [{ title: "Presupuestos · Correduría OS" }] }),
  loader: async () => {
    const { data: presupuestos } = await supabase
      .from("presupuestos")
      .select(`
        id, numero, cliente_id, cliente_nombre, ramo, aseguradora, prima_anual, fecha_emision, fecha_validez, estado, comercial_id,
        clientes(id, nombre_razon_social, email), comercial:usuarios!presupuestos_comercial_id_fkey(nombre)
      `)
      .order("created_at", { ascending: false });
    const { data: clientes } = await supabase.from("clientes").select("id, nombre_razon_social, email").order("nombre_razon_social");
    const { data: comerciales } = await supabase
      .from("usuarios")
      .select("id, nombre, jefe_id")
      .eq("rol", "comercial")
      .order("nombre");
    return { presupuestos: presupuestos || [], clientes: clientes || [], comerciales: comerciales || [] };
  },
});

const RAMOS = ["Auto","Hogar","Vida","Salud","Comercio","RC","Decesos"] as const;
const ASEGURADORAS = ["Mapfre","Allianz","Axa","Generali","Mutua Madrileña","Reale","Caser","Línea Directa"] as const;

function PresupuestosPage() {
  const { presupuestos, clientes, comerciales } = Route.useLoaderData();
  const router = useRouter();
  const { toast, confirm } = useDialog();
  const { esRoot, esJefeZona, perfil } = usePermissions();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);
  const [form, setForm] = useState({
    cliente_id: "" as string,
    cliente_nombre: "",
    ramo: "Auto" as string,
    aseguradora: "" as string,
    prima_anual: "",
    notas: "",
    comercial_id: "" as string,
  });

  // Comerciales visibles: root ve todos, jefe_zona ve los suyos (jefe_id == perfil.id)
  const comercialesVisibles = esRoot
    ? comerciales
    : esJefeZona
      ? comerciales.filter((c: any) => c.jefe_id === perfil?.id)
      : [];
  const puedeSelectorComercial = (esRoot || esJefeZona) && comercialesVisibles.length > 0;

  const stats = {
    borrador: presupuestos.filter((p: any) => p.estado === "borrador").length,
    enviado: presupuestos.filter((p: any) => p.estado === "enviado").length,
    aceptado: presupuestos.filter((p: any) => p.estado === "aceptado").length,
    convertido: presupuestos.filter((p: any) => p.estado === "convertido").length,
  };

  const generarNumero = () => {
    const year = new Date().getFullYear();
    const n = (presupuestos.length + 1).toString().padStart(4, "0");
    return `PRES-${year}-${n}`;
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const nombre = form.cliente_id
      ? clientes.find((c: any) => c.id === form.cliente_id)?.nombre_razon_social
      : form.cliente_nombre;
    const { error } = await supabase.from("presupuestos").insert({
      numero: generarNumero(),
      cliente_id: form.cliente_id || null,
      cliente_nombre: nombre || form.cliente_nombre,
      ramo: form.ramo,
      aseguradora: form.aseguradora || null,
      prima_anual: Number(form.prima_anual),
      fecha_validez: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      estado: "borrador",
      notas: form.notas || null,
      comercial_id: form.comercial_id || perfil?.id || null,
    });
    setBusy(false);
    if (error) { toast("Error: " + error.message, "error"); return; }
    setOpen(false);
    setForm({ cliente_id: "", cliente_nombre: "", ramo: "Auto", aseguradora: "", prima_anual: "", notas: "", comercial_id: "" });
    router.invalidate();
  };

  const enviarPorEmail = async (p: any) => {
    if (!p.cliente_id) {
      toast("Este presupuesto no tiene cliente asignado.", "warning");
      return;
    }
    const email = p.clientes?.email;
    if (!email) {
      toast("El cliente no tiene email registrado.", "warning");
      return;
    }
    const ok = await confirm({
      message: `¿Enviar presupuesto ${p.numero} a ${email}?`,
      tone: "brand",
    });
    if (!ok) return;
    // Reutilizamos enviar-aviso-vencimiento como bus; si no está, fallback
    const { error } = await supabase.functions.invoke("enviar-aviso-vencimiento", {
      body: {
        plantilla: "presupuesto",
        destinatario: email,
        asunto: `Tu presupuesto ${p.numero}`,
        contenido: `Adjuntamos el presupuesto ${p.numero} (${p.ramo}, ${p.aseguradora || "—"}) por ${Number(p.prima_anual).toFixed(2)}€/año.`,
      },
    });
    // Registrar en comunicaciones
    await supabase.from("comunicaciones").insert({
      cliente_id: p.cliente_id,
      tipo: "email",
      asunto: `Presupuesto ${p.numero} enviado`,
      contenido: `Enviado a ${email}. Estado: ${error ? "simulado (falta deploy Edge Function)" : "enviado vía Brevo"}.`,
      fecha: new Date().toISOString(),
    });
    if (error) toast("Se envió por email (simulado, falta deploy Edge Function)", "warning");
    else toast("Presupuesto enviado por email", "success");
  };

  const cambiarEstado = async (p: any, nuevoEstado: string) => {
    const { error } = await supabase.from("presupuestos").update({ estado: nuevoEstado }).eq("id", p.id);
    if (error) toast("Error: " + error.message, "error");
    else router.invalidate();
  };

  const convertirAPoliza = async (p: any) => {
    if (!p.cliente_id) {
      toast("Este presupuesto no tiene cliente asignado. Edita el presupuesto y asigna un cliente antes de convertir.", "warning");
      return;
    }
    const ok = await confirm({ message: `¿Convertir presupuesto ${p.numero} en póliza activa?`, tone: "brand" });
    if (!ok) return;
    const { data: poliza, error } = await supabase
      .from("polizas")
      .insert({
        cliente_id: p.cliente_id,
        numero_poliza: `POL-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`,
        ramo: p.ramo,
        aseguradora: p.aseguradora || "Por definir",
        prima_anual: p.prima_anual,
        fecha_inicio: new Date().toISOString().split("T")[0],
        fecha_vencimiento: new Date(Date.now() + 365 * 86400000).toISOString().split("T")[0],
        estado: "activa",
      })
      .select("id")
      .single();
    if (error) { toast("Error: " + error.message, "error"); return; }
    await supabase.from("presupuestos").update({ estado: "convertido", poliza_convertida_id: poliza.id }).eq("id", p.id);
    router.invalidate();
    toast(`Presupuesto convertido a póliza`, "success");
  };

  const buildPDF = (p: any): Blob =>
    generarFichaPDF({
      titulo: `Presupuesto ${p.numero}`,
      subtitulo: `${p.cliente_nombre} · ${p.ramo}`,
      bloques: [
        {
          titulo: "Detalles",
          filas: [
            ["Cliente", p.cliente_nombre],
            ["Ramo", p.ramo],
            ["Aseguradora", p.aseguradora || "—"],
            ["Prima anual", `${Number(p.prima_anual).toFixed(2)} €`],
            ["Fecha emisión", p.fecha_emision],
            ["Válido hasta", p.fecha_validez || "—"],
            ["Estado", p.estado],
          ],
        },
      ],
    });

  return (
    <PageShell
      title="Presupuestos"
      subtitle="Crea presupuestos, envíalos al cliente y conviértelos en pólizas activas."
      action={
        <button type="button" onClick={() => setOpen(true)} className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 flex items-center gap-1.5 cursor-pointer">
          <Plus className="size-3.5" /> Nuevo presupuesto
        </button>
      }
    >
      <div className="grid grid-cols-4 gap-3 mb-6">
        <KpiCard label="Borradores" value={String(stats.borrador)} hint="por enviar" />
        <KpiCard label="Enviados" value={String(stats.enviado)} hint="esperando respuesta" />
        <KpiCard label="Aceptados" value={String(stats.aceptado)} delta="convertir a póliza" deltaTone="success" />
        <KpiCard label="Convertidos" value={String(stats.convertido)} delta="cerrados" deltaTone="success" />
      </div>

      <Card>
        {presupuestos.length === 0 ? (
          <div className="p-8 text-center text-[12px] text-ink-subtle">
            Sin presupuestos. Crea el primero con el botón "Nuevo presupuesto".
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Nº</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Cliente</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Ramo</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Aseguradora</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Prima</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {presupuestos.map((p: any) => {
                const tone =
                  p.estado === "convertido" ? "success" :
                  p.estado === "aceptado" ? "success" :
                  p.estado === "rechazado" ? "danger" :
                  p.estado === "enviado" ? "info" : "neutral";
                return (
                  <tr key={p.id} className="hover:bg-secondary/30">
                    <td className="px-4 py-3 text-[11px] font-mono">{p.numero}</td>
                    <td className="px-4 py-3 text-[12.5px] font-medium">{p.cliente_nombre}</td>
                    <td className="px-4 py-3"><RamoChip ramo={p.ramo} /></td>
                    <td className="px-4 py-3 text-[11.5px] text-ink-muted">{p.aseguradora || "—"}</td>
                    <td className="px-4 py-3 text-[12px]"><MoneyEUR value={Number(p.prima_anual)} /></td>
                    <td className="px-4 py-3"><StatusBadge tone={tone as any}>{p.estado}</StatusBadge></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => enviarPorEmail(p)}
                          disabled={!p.cliente_id || !p.clientes?.email}
                          title={!p.cliente_id ? "Sin cliente asignado" : !p.clientes?.email ? "Cliente sin email" : "Enviar por email"}
                          className="p-1.5 rounded text-ink-subtle hover:bg-secondary hover:text-foreground cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Mail className="size-3.5" />
                        </button>
                        <RowActions
                          actions={[
                            { icon: "view", label: "Ver datos", onClick: () => setViewing(p), tone: "brand" },
                            {
                              icon: "edit",
                              label: p.estado === "borrador" ? "Marcar enviado" : p.estado === "enviado" ? "Marcar aceptado" : p.estado === "aceptado" ? "Convertir a póliza" : "Sin acción",
                              disabled: p.estado === "convertido" || p.estado === "rechazado",
                              onClick: () => {
                                if (p.estado === "borrador") cambiarEstado(p, "enviado");
                                else if (p.estado === "enviado") cambiarEstado(p, "aceptado");
                                else if (p.estado === "aceptado") convertirAPoliza(p);
                              },
                            },
                            { icon: "print", label: "Imprimir", onClick: () => imprimirBlob(buildPDF(p)) },
                            { icon: "download", label: "Descargar PDF", onClick: () => descargarBlob(buildPDF(p), `presupuesto_${p.numero}.pdf`) },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Nuevo presupuesto">
        <form onSubmit={guardar} className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Cliente existente</label>
            <select title="Cliente" value={form.cliente_id} onChange={e => setForm({ ...form, cliente_id: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none">
              <option value="">— O escribe nombre nuevo abajo —</option>
              {clientes.map((c: any) => <option key={c.id} value={c.id}>{c.nombre_razon_social}</option>)}
            </select>
          </div>
          {!form.cliente_id && (
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Nombre nuevo cliente / lead</label>
              <input type="text" value={form.cliente_nombre} placeholder="Nombre del prospecto" onChange={e => setForm({ ...form, cliente_nombre: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
          )}
          {puedeSelectorComercial && (
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Crear en nombre de comercial</label>
              <select
                title="Comercial"
                value={form.comercial_id}
                onChange={e => setForm({ ...form, comercial_id: e.target.value })}
                className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none"
              >
                <option value="">— Yo mismo —</option>
                {comercialesVisibles.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Ramo</label>
              <select title="Ramo" value={form.ramo} onChange={e => setForm({ ...form, ramo: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none">
                {RAMOS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Aseguradora</label>
              <select title="Aseguradora" value={form.aseguradora} onChange={e => setForm({ ...form, aseguradora: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none">
                <option value="">A elegir</option>
                {ASEGURADORAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Prima (€)</label>
              <input required type="number" step="0.01" value={form.prima_anual} placeholder="0.00" onChange={e => setForm({ ...form, prima_anual: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Notas</label>
            <textarea title="Notas" rows={2} value={form.notas} placeholder="Coberturas, condiciones, observaciones…" onChange={e => setForm({ ...form, notas: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="text-[12px] py-1.5 px-3 rounded ring-1 ring-border hover:bg-secondary cursor-pointer">Cancelar</button>
            <button type="submit" disabled={busy} className="text-[12px] py-1.5 px-3 rounded bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
              <FileSignature className="size-3.5" /> {busy ? "Guardando…" : "Crear presupuesto"}
            </button>
          </div>
        </form>
      </Modal>

      <DetailModal
        isOpen={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.numero || ""}
        subtitle={viewing ? `${viewing.cliente_nombre} · ${viewing.ramo}` : undefined}
        rows={viewing ? [
          { label: "Cliente", value: viewing.cliente_nombre },
          { label: "Ramo", value: <RamoChip ramo={viewing.ramo} /> },
          { label: "Aseguradora", value: viewing.aseguradora || "—" },
          { label: "Prima anual", value: <MoneyEUR value={Number(viewing.prima_anual)} /> },
          { label: "Fecha emisión", value: viewing.fecha_emision },
          { label: "Válido hasta", value: viewing.fecha_validez || "—" },
          { label: "Estado", value: viewing.estado },
        ] : []}
      />
    </PageShell>
  );
}
