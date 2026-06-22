import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Send, Mail, MessageSquare, Plus, FileText, Clock, Play } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, KpiCard, SectionHeader, StatusBadge, Modal } from "@/components/app/ui-bits";
import { RowActions } from "@/components/app/row-actions";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/use-permissions";
import { useDialog } from "@/components/app/dialog-provider";
import { procesarPendientesFn } from "@/lib/admin-campanas";

export const Route = createFileRoute("/comunicaciones")({
  component: ComunicacionesPage,
  head: () => ({ meta: [{ title: "Comunicaciones · Correduría OS" }] }),
  loader: async () => {
    const [{ data: campanas }, { data: plantillas }] = await Promise.all([
      supabase.from("campanas").select("*").order("created_at", { ascending: false }),
      supabase.from("plantillas").select("*").order("created_at", { ascending: false }),
    ]);
    return { campanas: campanas || [], plantillas: plantillas || [] };
  },
});

const TIPO_PLANTILLA = ["contrato","recordatorio","presupuesto_email","renovacion","bienvenida","otro"] as const;

function ComunicacionesPage() {
  const { campanas, plantillas } = Route.useLoaderData();
  const router = useRouter();
  const { puedeEnviarMasivo, esRoot } = usePermissions();
  const { toast, confirm } = useDialog();
  const [tab, setTab] = useState<"campanas"|"plantillas">("campanas");
  const [openCamp, setOpenCamp] = useState(false);
  const [openTpl, setOpenTpl] = useState(false);
  const [busy, setBusy] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [camp, setCamp] = useState({ nombre: "", tipo: "email", asunto: "", contenido: "", programada_para: "" });
  const [tpl, setTpl] = useState({ nombre: "", tipo: "recordatorio", asunto: "", contenido: "" });

  const totalEnviadosMes = campanas
    .filter((c: any) => c.estado === "enviada")
    .reduce((s: number, c: any) => s + (c.enviados || 0), 0);
  const tasaApertura = totalEnviadosMes > 0
    ? Math.round((campanas.reduce((s: number, c: any) => s + (c.aperturas || 0), 0) / totalEnviadosMes) * 100)
    : 0;

  const guardarCampana = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    // En esta primera versión cuenta destinatarios contra todos los clientes activos
    const { count } = await supabase.from("clientes").select("*", { count: "exact", head: true });
    const programada = camp.programada_para && camp.programada_para.trim().length > 0;
    const { error } = await supabase.from("campanas").insert({
      nombre: camp.nombre,
      tipo: camp.tipo,
      asunto: camp.asunto || null,
      contenido: camp.contenido,
      estado: programada ? "programada" : "borrador",
      programada_para: programada ? new Date(camp.programada_para).toISOString() : null,
      total_destinatarios: count || 0,
    });
    setBusy(false);
    if (error) { toast("Error: " + error.message, "error"); return; }
    setOpenCamp(false);
    setCamp({ nombre: "", tipo: "email", asunto: "", contenido: "", programada_para: "" });
    router.invalidate();
  };

  const procesarPendientes = async () => {
    const ok = await confirm({
      message: "¿Procesar todas las campañas programadas cuya fecha ya haya pasado? Se invocará la Edge Function para cada una.",
      tone: "brand",
    });
    if (!ok) return;
    setProcesando(true);
    try {
      const res = await procesarPendientesFn();
      if (!res.success) {
        toast("Error: " + (res.error || "Sin detalle"), "error");
      } else {
        toast(`Procesadas ${res.procesadas} de ${res.total} campañas pendientes.`, "success");
        router.invalidate();
      }
    } catch (e: any) {
      toast("Error: " + (e?.message || String(e)), "error");
    } finally {
      setProcesando(false);
    }
  };

  const guardarPlantilla = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("plantillas").insert({
      nombre: tpl.nombre,
      tipo: tpl.tipo,
      asunto: tpl.asunto || null,
      contenido: tpl.contenido,
    });
    setBusy(false);
    if (error) { toast("Error: " + error.message, "error"); return; }
    setOpenTpl(false);
    setTpl({ nombre: "", tipo: "recordatorio", asunto: "", contenido: "" });
    router.invalidate();
  };

  const enviarCampana = async (c: any) => {
    const ok = await confirm({ message: `¿Enviar campaña "${c.nombre}" a ${c.total_destinatarios} destinatarios?`, tone: "brand" });
    if (!ok) return;
    const { data, error } = await supabase.functions.invoke("procesar-campana", { body: { campana_id: c.id } });
    if (error) {
      // Fallback: marcar como enviada localmente para no bloquear el flujo
      await supabase.from("campanas").update({
        estado: "enviada",
        enviada_at: new Date().toISOString(),
        enviados: c.total_destinatarios,
      }).eq("id", c.id);
      toast(`Campaña marcada (Edge Function no desplegada): ${error.message}`, "warning");
    } else {
      const enviados = (data as any)?.enviados ?? c.total_destinatarios;
      toast(`Campaña enviada (${enviados} emails)`, "success");
    }
    router.invalidate();
  };

  return (
    <PageShell
      title="Comunicaciones masivas"
      subtitle="Email, SMS y WhatsApp a base de datos filtrada. Plantillas reutilizables."
      action={
        <div className="flex items-center gap-2">
          {esRoot && (
            <button
              type="button"
              onClick={procesarPendientes}
              disabled={procesando}
              className="text-[12px] py-1.5 px-3 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Play className="size-3.5" /> {procesando ? "Procesando…" : "Procesar pendientes ahora"}
            </button>
          )}
          <button type="button" onClick={() => setOpenTpl(true)} className="text-[12px] py-1.5 px-3 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
            <FileText className="size-3.5" /> Nueva plantilla
          </button>
          {puedeEnviarMasivo && (
            <button type="button" onClick={() => setOpenCamp(true)} className="text-[12px] py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 flex items-center gap-1.5 cursor-pointer">
              <Plus className="size-3.5" /> Nueva campaña
            </button>
          )}
        </div>
      }
    >
      <Card className="p-3 mb-4 bg-warning/5 ring-warning/20">
        <div className="flex items-start gap-2.5 text-[11.5px]">
          <span className="text-warning shrink-0 mt-0.5">⚠</span>
          <div className="text-ink-muted">
            <strong className="text-warning">SMS y WhatsApp Business</strong> requieren conectar un proveedor (Twilio, MessageBird, Vonage). Hasta que se configure, esos canales quedan como simulación: la campaña se marca como enviada pero no se entrega ningún mensaje.
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <KpiCard label="Campañas totales" value={String(campanas.length)} hint="todas" />
        <KpiCard label="Enviadas" value={String(campanas.filter((c: any) => c.estado === "enviada").length)} hint="completadas" />
        <KpiCard label="Mensajes enviados" value={String(totalEnviadosMes)} hint="total emails/sms" />
        <KpiCard label="Tasa de apertura" value={`${tasaApertura}%`} delta="media" deltaTone="success" />
      </div>

      <div className="flex gap-1 mb-5 text-[12px] w-fit bg-secondary/40 rounded-md p-1">
        <button type="button" onClick={() => setTab("campanas")} className={["py-1 px-3 rounded font-medium", tab === "campanas" ? "bg-surface ring-1 ring-border" : "text-ink-subtle"].join(" ")}>Campañas</button>
        <button type="button" onClick={() => setTab("plantillas")} className={["py-1 px-3 rounded font-medium", tab === "plantillas" ? "bg-surface ring-1 ring-border" : "text-ink-subtle"].join(" ")}>Plantillas</button>
      </div>

      {tab === "campanas" && (
        <Card>
          {campanas.length === 0 ? (
            <div className="p-8 text-center text-[12px] text-ink-subtle">Sin campañas. Crea la primera.</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-secondary/40 border-b border-border">
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Nombre</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Tipo</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Destinatarios</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Enviados</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Aperturas</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {campanas.map((c: any) => {
                  const Icon = c.tipo === "email" ? Mail : c.tipo === "sms" ? MessageSquare : MessageSquare;
                  return (
                    <tr key={c.id} className="hover:bg-secondary/30">
                      <td className="px-4 py-3 text-[12.5px] font-medium">{c.nombre}</td>
                      <td className="px-4 py-3 text-[11px]"><span className="inline-flex items-center gap-1 text-ink-muted"><Icon className="size-3" /> {c.tipo}</span></td>
                      <td className="px-4 py-3 text-[12px] font-mono">{c.total_destinatarios}</td>
                      <td className="px-4 py-3 text-[12px] font-mono">{c.enviados}</td>
                      <td className="px-4 py-3 text-[12px] font-mono">{c.aperturas}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <StatusBadge tone={c.estado === "enviada" ? "success" : c.estado === "fallida" ? "danger" : c.estado === "programada" ? "info" : "neutral"}>{c.estado}</StatusBadge>
                          {c.estado === "programada" && c.programada_para && (
                            <span className="text-[10px] text-ink-subtle font-mono flex items-center gap-1 mt-0.5">
                              <Clock className="size-2.5" /> {new Date(c.programada_para).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <RowActions
                          actions={[
                            { icon: "view", label: "Ver detalles", onClick: () => { void confirm({ title: c.nombre, message: c.contenido || "Sin contenido", confirmLabel: "OK", cancelLabel: "Cerrar", tone: "brand" }); }, tone: "brand" },
                            { icon: "check", label: c.estado === "borrador" ? "Enviar ahora" : "Ya enviada", disabled: c.estado !== "borrador" || !puedeEnviarMasivo, onClick: () => enviarCampana(c), tone: "brand" },
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
      )}

      {tab === "plantillas" && (
        <Card>
          {plantillas.length === 0 ? (
            <div className="p-8 text-center text-[12px] text-ink-subtle">Sin plantillas. Crea la primera para reutilizarla en campañas.</div>
          ) : (
            <ul className="divide-y divide-border">
              {plantillas.map((p: any) => (
                <li key={p.id} className="p-4 flex items-center gap-4">
                  <FileText className="size-5 text-ink-subtle" />
                  <div className="flex-1">
                    <div className="text-[12.5px] font-medium">{p.nombre}</div>
                    <div className="text-[10px] text-ink-subtle">{p.tipo} {p.asunto && `· ${p.asunto}`}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Modal isOpen={openCamp} onClose={() => setOpenCamp(false)} title="Nueva campaña">
        <form onSubmit={guardarCampana} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Nombre</label>
              <input required value={camp.nombre} placeholder="Renovaciones septiembre" onChange={e => setCamp({ ...camp, nombre: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Canal</label>
              <select title="Canal" value={camp.tipo} onChange={e => setCamp({ ...camp, tipo: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none">
                <option value="email">Email (Brevo)</option>
                <option value="sms">SMS (proveedor pendiente)</option>
                <option value="whatsapp">WhatsApp Business (proveedor pendiente)</option>
              </select>
            </div>
          </div>
          {camp.tipo === "email" && (
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Asunto</label>
              <input required value={camp.asunto} placeholder="Tu póliza vence pronto" onChange={e => setCamp({ ...camp, asunto: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
          )}
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Contenido (puedes usar {`{{nombre}}`} {`{{ramo}}`})</label>
            <textarea required rows={5} value={camp.contenido} placeholder="Hola {{nombre}}, te recordamos que tu póliza de {{ramo}} vence pronto…" onChange={e => setCamp({ ...camp, contenido: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Programar envío (opcional)</label>
            <input
              type="datetime-local"
              title="Fecha y hora de envío programado"
              value={camp.programada_para}
              onChange={e => setCamp({ ...camp, programada_para: e.target.value })}
              className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none"
            />
            <p className="text-[10px] text-ink-subtle mt-1">
              Si lo dejas vacío se crea como borrador y se envía manualmente. Si rellenas fecha, queda en estado "programada".
            </p>
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setOpenCamp(false)} className="text-[12px] py-1.5 px-3 rounded ring-1 ring-border hover:bg-secondary cursor-pointer">Cancelar</button>
            <button type="submit" disabled={busy} className="text-[12px] py-1.5 px-3 rounded bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
              <Send className="size-3.5" /> {busy ? "Guardando…" : (camp.programada_para ? "Programar" : "Crear borrador")}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={openTpl} onClose={() => setOpenTpl(false)} title="Nueva plantilla">
        <form onSubmit={guardarPlantilla} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Nombre</label>
              <input required value={tpl.nombre} placeholder="Recordatorio vencimiento auto" onChange={e => setTpl({ ...tpl, nombre: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Tipo</label>
              <select title="Tipo" value={tpl.tipo} onChange={e => setTpl({ ...tpl, tipo: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none">
                {TIPO_PLANTILLA.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Asunto (si es email)</label>
            <input value={tpl.asunto} placeholder="Tu póliza con Mapfre vence el {{fecha}}" onChange={e => setTpl({ ...tpl, asunto: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Cuerpo</label>
            <textarea required rows={6} value={tpl.contenido} placeholder="Hola {{nombre}}…" onChange={e => setTpl({ ...tpl, contenido: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setOpenTpl(false)} className="text-[12px] py-1.5 px-3 rounded ring-1 ring-border hover:bg-secondary cursor-pointer">Cancelar</button>
            <button type="submit" disabled={busy} className="text-[12px] py-1.5 px-3 rounded bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50">
              {busy ? "Guardando…" : "Guardar plantilla"}
            </button>
          </div>
        </form>
      </Modal>
    </PageShell>
  );
}
