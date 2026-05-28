import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, AlertTriangle, Plus, Webhook } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, Modal, SectionHeader, StatusBadge } from "@/components/app/ui-bits";
import { RowActions } from "@/components/app/row-actions";
import { DetailModal } from "@/components/app/detail-modal";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/use-permissions";
import { useDialog } from "@/components/app/dialog-provider";
import { auditMutate } from "@/lib/audit-mutate";

export const Route = createFileRoute("/configuracion/webhooks")({
  component: WebhooksPage,
  head: () => ({ meta: [{ title: "Webhooks · Correduría OS" }] }),
});

const EVENTOS = [
  { id: "*", label: "* (todos los eventos)" },
  { id: "poliza.created", label: "poliza.created" },
  { id: "poliza.deleted", label: "poliza.deleted" },
  { id: "cliente.created", label: "cliente.created" },
  { id: "vencimiento.proximo", label: "vencimiento.proximo" },
  { id: "comision.aprobada", label: "comision.aprobada" },
];

interface FormW {
  nombre: string;
  url: string;
  evento: string;
  secret: string;
  activo: boolean;
}

const formVacio: FormW = {
  nombre: "",
  url: "",
  evento: "*",
  secret: "",
  activo: true,
};

function WebhooksPage() {
  const { esRoot, loading } = usePermissions();
  const { toast, confirm } = useDialog();
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [missingEndpoints, setMissingEndpoints] = useState(false);
  const [eventosRecibidos, setEventosRecibidos] = useState<any[]>([]);
  const [missingEventos, setMissingEventos] = useState(false);
  const [busy, setBusy] = useState(true);
  const [verOpen, setVerOpen] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormW>(formVacio);
  const [saving, setSaving] = useState(false);

  const cargar = async () => {
    setBusy(true);
    // webhook_endpoints
    let endpsMissing = false;
    let endpsData: any[] = [];
    try {
      const { data, error } = await supabase
        .from("webhook_endpoints")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) endpsMissing = true;
      else endpsData = data || [];
    } catch {
      endpsMissing = true;
    }

    // email_eventos (de Resend)
    let evMissing = false;
    let evData: any[] = [];
    try {
      const { data, error } = await supabase
        .from("email_eventos")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) evMissing = true;
      else evData = data || [];
    } catch {
      evMissing = true;
    }

    setEndpoints(endpsData);
    setMissingEndpoints(endpsMissing);
    setEventosRecibidos(evData);
    setMissingEventos(evMissing);
    setBusy(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  if (!loading && !esRoot) {
    return (
      <PageShell title="Sin acceso">
        <Card className="p-8 text-center text-[13px] text-ink-subtle">
          Solo root puede gestionar webhooks.
        </Card>
      </PageShell>
    );
  }

  const abrirNuevo = () => {
    setEditId(null);
    setForm(formVacio);
    setOpen(true);
  };

  const abrirEdicion = (w: any) => {
    setEditId(w.id);
    setForm({
      nombre: w.nombre || "",
      url: w.url || "",
      evento: w.evento || "*",
      secret: w.secret || "",
      activo: !!w.activo,
    });
    setOpen(true);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload: any = {
      nombre: form.nombre,
      url: form.url,
      evento: form.evento,
      secret: form.secret || null,
      activo: form.activo,
    };
    try {
      if (editId) {
        const { error } = await supabase.from("webhook_endpoints").update(payload).eq("id", editId);
        if (error) throw new Error(error.message);
        toast("Webhook actualizado", "success");
      } else {
        const { error } = await supabase.from("webhook_endpoints").insert(payload);
        if (error) throw new Error(error.message);
        toast("Webhook creado", "success");
      }
      setOpen(false);
      cargar();
    } catch (err: any) {
      toast("Error: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (w: any) => {
    const ok = await confirm({ message: `¿Eliminar el webhook "${w.nombre}"?`, tone: "danger" });
    if (!ok) return;
    const { error } = await auditMutate({
      action: "delete",
      table: "webhook_endpoints",
      match: { id: w.id },
    });
    if (error) toast("Error: " + error.message, "error");
    else {
      toast("Webhook eliminado", "success");
      cargar();
    }
  };

  if (busy) {
    return (
      <PageShell title="Webhooks">
        <Card className="p-8 text-center text-[13px] text-ink-subtle">Cargando…</Card>
      </PageShell>
    );
  }

  const pctExito = (w: any) => {
    const total = Number(w.invocaciones_totales || 0);
    if (total === 0) return "—";
    const ok = total - Number(w.invocaciones_fallidas || 0);
    return `${Math.round((ok / total) * 100)}%`;
  };

  return (
    <PageShell
      title="Webhooks"
      subtitle="Endpoints salientes para notificar eventos del sistema y eventos recibidos de Resend."
      action={
        <div className="flex items-center gap-2">
          <Link
            to="/configuracion"
            className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="size-3.5" /> Volver
          </Link>
          {!missingEndpoints && (
            <button
              type="button"
              onClick={abrirNuevo}
              className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="size-3.5" /> Nuevo webhook
            </button>
          )}
        </div>
      }
    >
      {(missingEndpoints || missingEventos) && (
        <div className="mb-5 rounded-md bg-warning/5 ring-1 ring-warning/30 px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
          <div className="text-[12px] text-warning">
            <p className="font-medium">Migración v0.8 pendiente</p>
            <p className="mt-0.5 text-ink-muted">
              {missingEndpoints && (
                <>
                  La tabla <code className="font-mono">webhook_endpoints</code> aún no existe.{" "}
                </>
              )}
              {missingEventos && (
                <>
                  La tabla <code className="font-mono">email_eventos</code> aún no existe.{" "}
                </>
              )}
              Aplica el SQL en <code className="font-mono">supabase/APLICAR_EN_SQL_EDITOR_v4.sql</code>.
            </p>
          </div>
        </div>
      )}

      {/* A. Webhooks salientes */}
      <Card className="mb-6">
        <div className="px-4 py-3 border-b border-border">
          <SectionHeader
            title={`Webhooks salientes (${endpoints.length})`}
            hint="El sistema invoca estas URLs cuando ocurren los eventos configurados"
          />
        </div>
        {endpoints.length === 0 ? (
          <div className="p-10 text-center text-[12px] text-ink-subtle">
            <Webhook className="size-6 text-ink-subtle mx-auto mb-2" />
            {missingEndpoints ? "Aplica primero la migración v0.8." : "No hay webhooks configurados."}
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Nombre</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">URL</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Evento</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Activo</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Última invoc.</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Status</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">% éxito</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {endpoints.map((w: any) => (
                <tr key={w.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-[12.5px] font-medium">{w.nombre}</td>
                  <td className="px-4 py-3 text-[11px] font-mono text-ink-muted truncate max-w-[280px]" title={w.url}>
                    {w.url}
                  </td>
                  <td className="px-4 py-3 text-[11px] font-mono">{w.evento}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={w.activo ? "success" : "neutral"}>{w.activo ? "Activo" : "Pausado"}</StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-[11.5px] text-ink-muted">
                    {w.ultima_invocacion ? new Date(w.ultima_invocacion).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-[11px] font-mono">
                    {w.ultima_respuesta ? (
                      <StatusBadge tone={w.ultima_respuesta >= 200 && w.ultima_respuesta < 300 ? "success" : "danger"}>
                        {w.ultima_respuesta}
                      </StatusBadge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-[11.5px] font-mono tabular-nums">{pctExito(w)}</td>
                  <td className="px-4 py-3">
                    <RowActions
                      actions={[
                        { icon: "view", label: "Ver detalle", onClick: () => setVerOpen(w) },
                        { icon: "edit", label: "Editar", onClick: () => abrirEdicion(w), tone: "brand" },
                        { icon: "trash", label: "Eliminar", onClick: () => eliminar(w), tone: "danger" },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* B. Eventos recibidos de Resend */}
      <Card>
        <div className="px-4 py-3 border-b border-border">
          <SectionHeader
            title={`Eventos email recibidos (${eventosRecibidos.length})`}
            hint="Eventos que Resend manda a /functions/v1/webhook-resend"
          />
        </div>
        {eventosRecibidos.length === 0 ? (
          <div className="p-8 text-center text-[12px] text-ink-subtle">
            {missingEventos ? "Tabla email_eventos no disponible." : "Sin eventos registrados."}
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Cuándo</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Destinatario</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Resend ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {eventosRecibidos.map((ev: any) => (
                <tr key={ev.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-[11px] font-mono text-ink-muted whitespace-nowrap">
                    {new Date(ev.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-[11.5px] font-mono">{ev.tipo}</td>
                  <td className="px-4 py-3 text-[11.5px] text-ink-muted">{ev.destinatario || "—"}</td>
                  <td className="px-4 py-3 text-[10.5px] font-mono text-ink-subtle truncate max-w-[180px]" title={ev.resend_id || ""}>
                    {ev.resend_id || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <DetailModal
        isOpen={!!verOpen}
        onClose={() => setVerOpen(null)}
        title={verOpen?.nombre || ""}
        subtitle="Webhook saliente"
        rows={
          verOpen
            ? [
                { label: "URL", value: verOpen.url },
                { label: "Evento", value: verOpen.evento },
                { label: "Secret", value: verOpen.secret ? "•••••• configurado" : "Sin firmar" },
                { label: "Activo", value: verOpen.activo ? "Sí" : "No" },
                {
                  label: "Última invocación",
                  value: verOpen.ultima_invocacion ? new Date(verOpen.ultima_invocacion).toLocaleString() : "—",
                },
                { label: "Último status HTTP", value: verOpen.ultima_respuesta || "—" },
                { label: "Invocaciones totales", value: verOpen.invocaciones_totales || 0 },
                { label: "Invocaciones fallidas", value: verOpen.invocaciones_fallidas || 0 },
              ]
            : []
        }
      />

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editId ? "Editar webhook" : "Nuevo webhook"}>
        <form onSubmit={guardar} className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Nombre</label>
            <input
              required
              type="text"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Notificar CRM"
              className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">URL</label>
            <input
              required
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://miapp.com/webhooks/moneta"
              className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Evento</label>
              <select
                title="Evento"
                value={form.evento}
                onChange={(e) => setForm({ ...form, evento: e.target.value })}
                className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none"
              >
                {EVENTOS.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Secret (HMAC)</label>
              <input
                type="text"
                value={form.secret}
                onChange={(e) => setForm({ ...form, secret: e.target.value })}
                placeholder="opcional"
                className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none font-mono"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm({ ...form, activo: e.target.checked })}
            />
            Webhook activo
          </label>
          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[12px] py-1.5 px-3 rounded ring-1 ring-border hover:bg-secondary cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="text-[12px] py-1.5 px-3 rounded bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50"
            >
              {saving ? "Guardando…" : editId ? "Guardar" : "Crear webhook"}
            </button>
          </div>
        </form>
      </Modal>
    </PageShell>
  );
}
