import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, AlertTriangle, Info, Plug } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, Modal, SectionHeader, StatusBadge, type StatusTone } from "@/components/app/ui-bits";
import { RowActions } from "@/components/app/row-actions";
import { DetailModal } from "@/components/app/detail-modal";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/use-permissions";
import { useDialog } from "@/components/app/dialog-provider";

export const Route = createFileRoute("/configuracion/integraciones")({
  component: IntegracionesPage,
  head: () => ({ meta: [{ title: "Integraciones aseguradoras · Correduría OS" }] }),
});

const ESTADOS = [
  { id: "inactiva", label: "Inactiva", tone: "neutral" as StatusTone },
  { id: "sandbox", label: "Sandbox (pruebas)", tone: "warning" as StatusTone },
  { id: "produccion", label: "Producción", tone: "success" as StatusTone },
  { id: "error", label: "Error", tone: "danger" as StatusTone },
];

const toneFor = (estado: string): StatusTone =>
  ESTADOS.find((e) => e.id === estado)?.tone || "neutral";

interface FormI {
  api_endpoint: string;
  api_key: string;
  webhook_secret: string;
  estado: string;
  notas: string;
}

function IntegracionesPage() {
  const { esRoot, loading } = usePermissions();
  const { toast } = useDialog();
  const [integraciones, setIntegraciones] = useState<any[]>([]);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(true);
  const [verOpen, setVerOpen] = useState<any>(null);
  const [editOpen, setEditOpen] = useState<any>(null);
  const [form, setForm] = useState<FormI>({
    api_endpoint: "",
    api_key: "",
    webhook_secret: "",
    estado: "inactiva",
    notas: "",
  });
  const [saving, setSaving] = useState(false);

  const cargar = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("integraciones_aseguradoras")
        .select("*")
        .order("aseguradora");
      if (error) {
        setMissing(true);
        setIntegraciones([]);
      } else {
        setIntegraciones(data || []);
        setMissing(false);
      }
    } catch {
      setMissing(true);
      setIntegraciones([]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  if (!loading && !esRoot) {
    return (
      <PageShell title="Sin acceso">
        <Card className="p-8 text-center text-[13px] text-ink-subtle">
          Solo root puede configurar integraciones.
        </Card>
      </PageShell>
    );
  }

  const abrirEdicion = (i: any) => {
    setEditOpen(i);
    setForm({
      api_endpoint: i.api_endpoint || "",
      api_key: "",
      webhook_secret: i.webhook_secret || "",
      estado: i.estado || "inactiva",
      notas: i.notas || "",
    });
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editOpen) return;
    setSaving(true);
    const payload: any = {
      api_endpoint: form.api_endpoint || null,
      webhook_secret: form.webhook_secret || null,
      estado: form.estado,
      notas: form.notas || null,
    };
    if (form.api_key) {
      // En producción esto debería ir vía edge function que cifra con KMS.
      // De momento se guarda tal cual en api_key_encrypted (placeholder).
      payload.api_key_encrypted = form.api_key;
    }
    const { error } = await supabase
      .from("integraciones_aseguradoras")
      .update(payload)
      .eq("id", editOpen.id);
    setSaving(false);
    if (error) {
      toast("Error: " + error.message, "error");
      return;
    }
    toast("Integración actualizada", "success");
    setEditOpen(null);
    cargar();
  };

  if (busy) {
    return (
      <PageShell title="Integraciones aseguradoras">
        <Card className="p-8 text-center text-[13px] text-ink-subtle">Cargando…</Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Integraciones aseguradoras"
      subtitle="API keys y endpoints de cada compañía aseguradora."
      action={
        <Link
          to="/configuracion"
          className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="size-3.5" /> Volver
        </Link>
      }
    >
      <div className="mb-5 rounded-md bg-brand-soft ring-1 ring-brand/15 px-4 py-3 flex items-start gap-2.5">
        <Info className="size-4 text-brand shrink-0 mt-0.5" />
        <div className="text-[12px] text-brand">
          <p className="font-medium">Configuración de APIs reales de aseguradoras</p>
          <p className="mt-0.5 text-ink-muted">
            Sin contrato comercial firmado con cada compañía las integraciones quedan inactivas. El modo sandbox es para pruebas con
            entorno de la aseguradora.
          </p>
        </div>
      </div>

      {missing && (
        <div className="mb-5 rounded-md bg-warning/5 ring-1 ring-warning/30 px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
          <div className="text-[12px] text-warning">
            <p className="font-medium">Migración v0.8 pendiente</p>
            <p className="mt-0.5 text-ink-muted">
              La tabla <code className="font-mono">integraciones_aseguradoras</code> aún no existe. Aplica el SQL en{" "}
              <code className="font-mono">supabase/APLICAR_EN_SQL_EDITOR_v4.sql</code>.
            </p>
          </div>
        </div>
      )}

      <Card>
        <div className="px-4 py-3 border-b border-border">
          <SectionHeader
            title={`${integraciones.length} aseguradora${integraciones.length === 1 ? "" : "s"}`}
            hint="Click editar para configurar API key y endpoint"
          />
        </div>
        {integraciones.length === 0 ? (
          <div className="p-10 text-center text-[12px] text-ink-subtle">
            <Plug className="size-6 text-ink-subtle mx-auto mb-2" />
            {missing ? "Aplica primero la migración v0.8." : "No hay integraciones configuradas."}
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Aseguradora</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Endpoint</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Última sync</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Notas</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {integraciones.map((i: any) => (
                <tr key={i.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-[12.5px] font-medium">{i.aseguradora}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={toneFor(i.estado)}>{i.estado}</StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-[11px] font-mono text-ink-muted truncate max-w-[260px]" title={i.api_endpoint || ""}>
                    {i.api_endpoint || "—"}
                  </td>
                  <td className="px-4 py-3 text-[11.5px] text-ink-muted">
                    {i.ultima_sincronizacion ? new Date(i.ultima_sincronizacion).toLocaleString() : "Nunca"}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-ink-muted truncate max-w-[220px]" title={i.notas || ""}>
                    {i.notas || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <RowActions
                      actions={[
                        { icon: "edit", label: "Editar", onClick: () => abrirEdicion(i), tone: "brand" },
                        { icon: "view", label: "Ver detalle", onClick: () => setVerOpen(i) },
                        { icon: "print", label: "Imprimir", onClick: () => {}, disabled: true },
                        { icon: "download", label: "Descargar", onClick: () => {}, disabled: true },
                      ]}
                    />
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
        title={verOpen?.aseguradora || ""}
        subtitle="Integración aseguradora"
        rows={
          verOpen
            ? [
                { label: "Estado", value: <StatusBadge tone={toneFor(verOpen.estado)}>{verOpen.estado}</StatusBadge> },
                { label: "Endpoint API", value: verOpen.api_endpoint || "—" },
                { label: "API key", value: verOpen.api_key_encrypted ? "•••••• configurada" : "Sin configurar" },
                { label: "Webhook secret", value: verOpen.webhook_secret ? "•••••• configurado" : "Sin configurar" },
                {
                  label: "Última sincronización",
                  value: verOpen.ultima_sincronizacion ? new Date(verOpen.ultima_sincronizacion).toLocaleString() : "Nunca",
                },
                { label: "Notas", value: verOpen.notas || "—" },
              ]
            : []
        }
      />

      <Modal
        isOpen={!!editOpen}
        onClose={() => setEditOpen(null)}
        title={`Configurar ${editOpen?.aseguradora || ""}`}
      >
        <form onSubmit={guardar} className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">API endpoint</label>
            <input
              type="text"
              value={form.api_endpoint}
              onChange={(e) => setForm({ ...form, api_endpoint: e.target.value })}
              placeholder="https://api.aseguradora.com/v1/"
              className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">API key (déjala vacía para no cambiar)</label>
            <input
              type="password"
              value={form.api_key}
              onChange={(e) => setForm({ ...form, api_key: e.target.value })}
              placeholder="••••••••"
              autoComplete="new-password"
              className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none font-mono"
            />
            <p className="text-[10px] text-ink-subtle mt-1">Se guarda en api_key_encrypted; en producción cifrar con KMS.</p>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Webhook secret</label>
            <input
              type="text"
              value={form.webhook_secret}
              onChange={(e) => setForm({ ...form, webhook_secret: e.target.value })}
              placeholder="Secreto para firmar webhooks entrantes"
              className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Estado</label>
            <select
              title="Estado"
              value={form.estado}
              onChange={(e) => setForm({ ...form, estado: e.target.value })}
              className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none"
            >
              {ESTADOS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Notas</label>
            <textarea
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              rows={2}
              className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none"
            />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditOpen(null)}
              className="text-[12px] py-1.5 px-3 rounded ring-1 ring-border hover:bg-secondary cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="text-[12px] py-1.5 px-3 rounded bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </Modal>
    </PageShell>
  );
}
