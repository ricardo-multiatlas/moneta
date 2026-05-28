import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, AlertTriangle, BellRing } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, Modal, SectionHeader, StatusBadge } from "@/components/app/ui-bits";
import { RowActions } from "@/components/app/row-actions";
import { DetailModal } from "@/components/app/detail-modal";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/use-permissions";
import { useDialog } from "@/components/app/dialog-provider";
import { auditMutate } from "@/lib/audit-mutate";

export const Route = createFileRoute("/configuracion/alertas")({
  component: AlertasPage,
  head: () => ({ meta: [{ title: "Alertas vencimiento · Correduría OS" }] }),
});

const RAMOS = ["", "Auto", "Hogar", "Vida", "Salud", "Comercio", "RC", "Decesos"];
const ASEGURADORAS = ["", "Mapfre", "Allianz", "Axa", "Generali", "Reale", "Caser", "Mutua Madrileña"];
const CANALES = [
  { id: "email", label: "Email" },
  { id: "sms", label: "SMS" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "sistema", label: "Sistema (en app)" },
];

interface FormA {
  nombre: string;
  ramo: string;
  aseguradora: string;
  comercial_id: string;
  zona_id: string;
  dias_antes: number;
  canal: string;
  destinatarios: string;
  activa: boolean;
}

const formVacio: FormA = {
  nombre: "",
  ramo: "",
  aseguradora: "",
  comercial_id: "",
  zona_id: "",
  dias_antes: 30,
  canal: "email",
  destinatarios: "",
  activa: true,
};

function AlertasPage() {
  const { esRoot, esJefeZona, loading } = usePermissions();
  const { toast, confirm } = useDialog();
  const [alertas, setAlertas] = useState<any[]>([]);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(true);
  const [comerciales, setComerciales] = useState<any[]>([]);
  const [zonas, setZonas] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [verOpen, setVerOpen] = useState<any>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormA>(formVacio);
  const [saving, setSaving] = useState(false);

  const cargar = async () => {
    setBusy(true);
    let alertasMissing = false;
    let alertasData: any[] = [];
    try {
      const { data, error } = await supabase
        .from("alertas_vencimiento")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) alertasMissing = true;
      else alertasData = data || [];
    } catch {
      alertasMissing = true;
    }

    const [{ data: com }, { data: zns }] = await Promise.all([
      supabase.from("usuarios").select("id, nombre, zona_id").eq("rol", "comercial").eq("activo", true).order("nombre"),
      supabase.from("zonas").select("id, nombre").order("nombre"),
    ]);

    setAlertas(alertasData);
    setMissing(alertasMissing);
    setComerciales(com || []);
    setZonas(zns || []);
    setBusy(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  if (!loading && !esRoot && !esJefeZona) {
    return (
      <PageShell title="Sin acceso">
        <Card className="p-8 text-center text-[13px] text-ink-subtle">
          Solo root o jefes de zona pueden configurar alertas.
        </Card>
      </PageShell>
    );
  }

  const abrirNueva = () => {
    setEditId(null);
    setForm(formVacio);
    setOpen(true);
  };

  const abrirEdicion = (a: any) => {
    setEditId(a.id);
    setForm({
      nombre: a.nombre || "",
      ramo: a.ramo || "",
      aseguradora: a.aseguradora || "",
      comercial_id: a.comercial_id || "",
      zona_id: a.zona_id || "",
      dias_antes: a.dias_antes || 30,
      canal: a.canal || "email",
      destinatarios: Array.isArray(a.destinatarios) ? a.destinatarios.join(", ") : "",
      activa: !!a.activa,
    });
    setOpen(true);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload: any = {
      nombre: form.nombre,
      ramo: form.ramo || null,
      aseguradora: form.aseguradora || null,
      comercial_id: form.comercial_id || null,
      zona_id: form.zona_id || null,
      dias_antes: Number(form.dias_antes),
      canal: form.canal,
      destinatarios: form.destinatarios
        ? form.destinatarios.split(",").map((d) => d.trim()).filter(Boolean)
        : null,
      activa: form.activa,
    };
    try {
      if (editId) {
        const { error } = await supabase.from("alertas_vencimiento").update(payload).eq("id", editId);
        if (error) throw new Error(error.message);
        toast("Alerta actualizada", "success");
      } else {
        const { error } = await supabase.from("alertas_vencimiento").insert(payload);
        if (error) throw new Error(error.message);
        toast("Alerta creada", "success");
      }
      setOpen(false);
      cargar();
    } catch (err: any) {
      toast("Error: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (a: any) => {
    const ok = await confirm({
      message: `¿Eliminar la alerta "${a.nombre}"?`,
      tone: "danger",
    });
    if (!ok) return;
    const { error } = await auditMutate({
      action: "delete",
      table: "alertas_vencimiento",
      match: { id: a.id },
    });
    if (error) toast("Error: " + error.message, "error");
    else {
      toast("Alerta eliminada", "success");
      cargar();
    }
  };

  if (busy) {
    return (
      <PageShell title="Alertas de vencimiento">
        <Card className="p-8 text-center text-[13px] text-ink-subtle">Cargando…</Card>
      </PageShell>
    );
  }

  const nombreComercial = (id: string | null) => comerciales.find((c) => c.id === id)?.nombre || "—";
  const nombreZona = (id: string | null) => zonas.find((z) => z.id === id)?.nombre || "—";

  return (
    <PageShell
      title="Alertas de vencimiento"
      subtitle="Configura cuándo y a quién avisar cuando una póliza esté próxima a vencer."
      action={
        <div className="flex items-center gap-2">
          <Link
            to="/configuracion"
            className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="size-3.5" /> Volver
          </Link>
          {!missing && (
            <button
              type="button"
              onClick={abrirNueva}
              className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="size-3.5" /> Nueva alerta
            </button>
          )}
        </div>
      }
    >
      {missing && (
        <div className="mb-5 rounded-md bg-warning/5 ring-1 ring-warning/30 px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
          <div className="text-[12px] text-warning">
            <p className="font-medium">Migración v0.8 pendiente</p>
            <p className="mt-0.5 text-ink-muted">
              La tabla <code className="font-mono">alertas_vencimiento</code> aún no existe. Aplica el SQL en{" "}
              <code className="font-mono">supabase/APLICAR_EN_SQL_EDITOR_v4.sql</code>.
            </p>
          </div>
        </div>
      )}

      <Card>
        <div className="px-4 py-3 border-b border-border">
          <SectionHeader
            title={`${alertas.length} alerta${alertas.length === 1 ? "" : "s"} configurada${alertas.length === 1 ? "" : "s"}`}
            hint="Filtros vacíos = aplica a todas las pólizas"
          />
        </div>
        {alertas.length === 0 ? (
          <div className="p-10 text-center text-[12px] text-ink-subtle">
            <BellRing className="size-6 text-ink-subtle mx-auto mb-2" />
            {missing
              ? "Aplica primero la migración v0.8."
              : "No hay alertas. Crea la primera con el botón superior."}
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Nombre</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Ramo</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Aseguradora</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Comercial</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Zona</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Días antes</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Canal</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Activa</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {alertas.map((a: any) => (
                <tr key={a.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-[12.5px] font-medium">{a.nombre}</td>
                  <td className="px-4 py-3 text-[11.5px] text-ink-muted">{a.ramo || "Todos"}</td>
                  <td className="px-4 py-3 text-[11.5px] text-ink-muted">{a.aseguradora || "Todas"}</td>
                  <td className="px-4 py-3 text-[11.5px] text-ink-muted">{nombreComercial(a.comercial_id)}</td>
                  <td className="px-4 py-3 text-[11.5px] text-ink-muted">{nombreZona(a.zona_id)}</td>
                  <td className="px-4 py-3 text-[12px] font-mono tabular-nums">{a.dias_antes}d</td>
                  <td className="px-4 py-3 text-[11.5px]">{a.canal}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={a.activa ? "success" : "neutral"}>{a.activa ? "Activa" : "Pausada"}</StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    <RowActions
                      actions={[
                        { icon: "view", label: "Ver detalle", onClick: () => setVerOpen(a) },
                        { icon: "edit", label: "Editar", onClick: () => abrirEdicion(a), tone: "brand" },
                        { icon: "trash", label: "Eliminar", onClick: () => eliminar(a), tone: "danger" },
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
        title={verOpen?.nombre || ""}
        subtitle="Alerta de vencimiento"
        rows={
          verOpen
            ? [
                { label: "Ramo", value: verOpen.ramo || "Todos" },
                { label: "Aseguradora", value: verOpen.aseguradora || "Todas" },
                { label: "Comercial", value: nombreComercial(verOpen.comercial_id) },
                { label: "Zona", value: nombreZona(verOpen.zona_id) },
                { label: "Días antes", value: `${verOpen.dias_antes} días` },
                { label: "Canal", value: verOpen.canal },
                {
                  label: "Destinatarios extra",
                  value: Array.isArray(verOpen.destinatarios) && verOpen.destinatarios.length > 0 ? verOpen.destinatarios.join(", ") : "—",
                },
                { label: "Estado", value: verOpen.activa ? "Activa" : "Pausada" },
                {
                  label: "Última ejecución",
                  value: verOpen.ultima_ejecucion ? new Date(verOpen.ultima_ejecucion).toLocaleString() : "Nunca",
                },
              ]
            : []
        }
      />

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editId ? "Editar alerta" : "Nueva alerta"}>
        <form onSubmit={guardar} className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Nombre</label>
            <input
              required
              type="text"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej. Vencimiento Auto 30 días"
              className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Ramo</label>
              <select
                title="Ramo"
                value={form.ramo}
                onChange={(e) => setForm({ ...form, ramo: e.target.value })}
                className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none"
              >
                {RAMOS.map((r) => (
                  <option key={r} value={r}>
                    {r || "— Todos —"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Aseguradora</label>
              <select
                title="Aseguradora"
                value={form.aseguradora}
                onChange={(e) => setForm({ ...form, aseguradora: e.target.value })}
                className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none"
              >
                {ASEGURADORAS.map((a) => (
                  <option key={a} value={a}>
                    {a || "— Todas —"}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Comercial</label>
              <select
                title="Comercial"
                value={form.comercial_id}
                onChange={(e) => setForm({ ...form, comercial_id: e.target.value })}
                className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none"
              >
                <option value="">— Todos —</option>
                {comerciales.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Zona</label>
              <select
                title="Zona"
                value={form.zona_id}
                onChange={(e) => setForm({ ...form, zona_id: e.target.value })}
                className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none"
              >
                <option value="">— Todas —</option>
                {zonas.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Días antes</label>
              <input
                required
                type="number"
                min={1}
                max={365}
                value={form.dias_antes}
                onChange={(e) => setForm({ ...form, dias_antes: Number(e.target.value) })}
                className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Canal</label>
              <select
                title="Canal"
                value={form.canal}
                onChange={(e) => setForm({ ...form, canal: e.target.value })}
                className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none"
              >
                {CANALES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Destinatarios extra (separados por comas)</label>
            <textarea
              value={form.destinatarios}
              onChange={(e) => setForm({ ...form, destinatarios: e.target.value })}
              placeholder="aviso@empresa.es, +34666111222"
              rows={2}
              className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none"
            />
          </div>
          <label className="flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={form.activa}
              onChange={(e) => setForm({ ...form, activa: e.target.checked })}
            />
            Alerta activa
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
              {saving ? "Guardando…" : editId ? "Guardar cambios" : "Crear alerta"}
            </button>
          </div>
        </form>
      </Modal>
    </PageShell>
  );
}
