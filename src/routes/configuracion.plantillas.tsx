import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, FileText, Copy, Eye } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, SectionHeader, StatusBadge, Modal } from "@/components/app/ui-bits";
import { RowActions } from "@/components/app/row-actions";
import { supabase } from "@/lib/supabase";
import { useDialog } from "@/components/app/dialog-provider";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/configuracion/plantillas")({
  component: PlantillasPage,
  head: () => ({ meta: [{ title: "Plantillas de contratos · Correduría OS" }] }),
});

const TIPOS = [
  { id: "general", label: "General" },
  { id: "poliza_auto", label: "Póliza Auto" },
  { id: "poliza_hogar", label: "Póliza Hogar" },
  { id: "poliza_vida", label: "Póliza Vida" },
  { id: "poliza_salud", label: "Póliza Salud" },
  { id: "poliza_comercio", label: "Póliza Comercio" },
  { id: "presupuesto", label: "Presupuesto" },
  { id: "renovacion", label: "Renovación" },
  { id: "baja", label: "Baja" },
  { id: "reclamacion", label: "Reclamación" },
];

const TIPO_LABEL: Record<string, string> = Object.fromEntries(TIPOS.map((t) => [t.id, t.label]));

const PLACEHOLDERS_DISPONIBLES = [
  "{{nombre_cliente}}",
  "{{nif_cliente}}",
  "{{email_cliente}}",
  "{{telefono_cliente}}",
  "{{numero_poliza}}",
  "{{ramo}}",
  "{{aseguradora}}",
  "{{prima_anual}}",
  "{{prima_estimada}}",
  "{{fecha_inicio}}",
  "{{fecha_vencimiento}}",
  "{{nombre_comercial}}",
  "{{email_comercial}}",
  "{{fecha_hoy}}",
];

function PlantillasPage() {
  const router = useRouter();
  const { esRoot, esSecretaria, loading } = usePermissions();
  const { toast, confirm } = useDialog();
  const [plantillas, setPlantillas] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [open, setOpen] = useState(false);
  const [verOpen, setVerOpen] = useState<any | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    nombre: "",
    descripcion: "",
    tipo: "general",
    contenido: "",
    activa: true,
  });

  const cargar = async () => {
    setCargando(true);
    const { data } = await supabase
      .from("plantillas_contratos")
      .select("*")
      .order("tipo", { ascending: true })
      .order("nombre", { ascending: true });
    setPlantillas(data || []);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  if (!loading && !esRoot && !esSecretaria) {
    return (
      <PageShell title="Sin acceso">
        <Card className="p-8 text-center text-[13px] text-ink-subtle">
          Solo root o secretaria pueden gestionar plantillas.
          <div className="mt-4"><Link to="/configuracion" className="text-[12px] text-brand hover:underline">← Volver</Link></div>
        </Card>
      </PageShell>
    );
  }

  const abrir = (p?: any) => {
    if (p) {
      setEditId(p.id);
      setForm({
        nombre: p.nombre,
        descripcion: p.descripcion || "",
        tipo: p.tipo,
        contenido: p.contenido,
        activa: p.activa,
      });
    } else {
      setEditId(null);
      setForm({ nombre: "", descripcion: "", tipo: "general", contenido: "", activa: true });
    }
    setOpen(true);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      nombre: form.nombre,
      descripcion: form.descripcion || null,
      tipo: form.tipo,
      contenido: form.contenido,
      activa: form.activa,
    };
    const { error } = editId
      ? await supabase.from("plantillas_contratos").update(payload).eq("id", editId)
      : await supabase.from("plantillas_contratos").insert(payload);
    if (error) { toast("Error: " + error.message, "error"); return; }
    setOpen(false);
    toast(editId ? "Plantilla actualizada" : "Plantilla creada", "success");
    cargar();
  };

  const duplicar = async (p: any) => {
    const { error } = await supabase.from("plantillas_contratos").insert({
      nombre: p.nombre + " (copia)",
      descripcion: p.descripcion,
      tipo: p.tipo,
      contenido: p.contenido,
      activa: false,
    });
    if (error) toast("Error: " + error.message, "error");
    else { toast("Plantilla duplicada", "success"); cargar(); }
  };

  const eliminar = async (p: any) => {
    const ok = await confirm({ message: `¿Eliminar la plantilla "${p.nombre}"?`, tone: "danger" });
    if (!ok) return;
    const { error } = await supabase.from("plantillas_contratos").delete().eq("id", p.id);
    if (error) toast("Error: " + error.message, "error");
    else { toast("Plantilla eliminada", "success"); cargar(); }
  };

  const insertarPlaceholder = (placeholder: string) => {
    setForm({ ...form, contenido: form.contenido + placeholder });
  };

  return (
    <PageShell
      title="Plantillas de contratos"
      subtitle="Plantillas reutilizables para emails, contratos, renovaciones, reclamaciones. Usa placeholders para personalizar."
      action={
        <div className="flex items-center gap-2">
          <Link to="/configuracion" className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
            <ArrowLeft className="size-3.5" /> Volver
          </Link>
          <button type="button" onClick={() => abrir()} className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 flex items-center gap-1.5 cursor-pointer">
            <Plus className="size-3.5" /> Nueva plantilla
          </button>
        </div>
      }
    >
      <Card>
        <div className="px-4 pt-4">
          <SectionHeader
            title={plantillas.length === 0 ? "Plantillas de contratos" : `${plantillas.length} plantilla${plantillas.length === 1 ? "" : "s"}`}
            hint={plantillas.length === 0 ? "Aún no hay ninguna. Crea la primera con \"Nueva plantilla\"." : "Click en editar para modificar contenido o desactivar"}
          />
        </div>
        {cargando ? (
          <div className="p-8 text-center text-[12px] text-ink-subtle">Cargando…</div>
        ) : plantillas.length === 0 ? (
          <div className="p-10 text-center text-[12px] text-ink-subtle">
            <FileText className="size-6 text-ink-subtle mx-auto mb-2" />
            Sin plantillas todavía.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Nombre</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Descripción</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {plantillas.map((p: any) => (
                <tr key={p.id} className="hover:bg-secondary/30">
                  <td className="px-4 py-3 text-[12.5px] font-medium">{p.nombre}</td>
                  <td className="px-4 py-3 text-[11.5px]"><StatusBadge tone="brand">{TIPO_LABEL[p.tipo] || p.tipo}</StatusBadge></td>
                  <td className="px-4 py-3 text-[11.5px] text-ink-muted truncate max-w-[320px]">{p.descripcion || "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={p.activa ? "success" : "neutral"}>{p.activa ? "Activa" : "Inactiva"}</StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    <RowActions
                      actions={[
                        { icon: "view", label: "Ver contenido", onClick: () => setVerOpen(p), tone: "brand" },
                        { icon: "edit", label: "Editar", onClick: () => abrir(p) },
                        { icon: "print", label: "Duplicar", onClick: () => duplicar(p) },
                        { icon: "trash", label: "Eliminar", onClick: () => eliminar(p), tone: "danger" },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editId ? "Editar plantilla" : "Nueva plantilla"}>
        <form onSubmit={guardar} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Nombre *</label>
              <input
                required
                type="text"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                className="w-full bg-secondary border-0 rounded px-3 py-1.5 text-[12px] ring-1 ring-border"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Tipo *</label>
              <select
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                className="w-full bg-secondary border-0 rounded px-3 py-1.5 text-[12px] ring-1 ring-border cursor-pointer"
              >
                {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Descripción</label>
            <input
              type="text"
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Cuándo y para qué se usa esta plantilla"
              className="w-full bg-secondary border-0 rounded px-3 py-1.5 text-[12px] ring-1 ring-border"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-medium text-ink-subtle">Contenido *</label>
              <span className="text-[10px] text-ink-subtle">Usa los placeholders abajo</span>
            </div>
            <textarea
              required
              value={form.contenido}
              onChange={(e) => setForm({ ...form, contenido: e.target.value })}
              rows={10}
              placeholder="Estimado/a {{nombre_cliente}}, le escribimos sobre su póliza {{numero_poliza}}…"
              className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border font-mono"
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {PLACEHOLDERS_DISPONIBLES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => insertarPlaceholder(p)}
                  className="text-[10px] font-mono py-1 px-2 rounded bg-brand-soft text-brand hover:brightness-95 cursor-pointer"
                  title="Click para insertar al final del contenido"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12px] cursor-pointer">
            <input type="checkbox" checked={form.activa} onChange={(e) => setForm({ ...form, activa: e.target.checked })} className="cursor-pointer" />
            Plantilla activa (visible en selectores)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="text-[12px] py-1.5 px-3 rounded ring-1 ring-border hover:bg-secondary cursor-pointer">Cancelar</button>
            <button type="submit" className="text-[12px] py-1.5 px-3 rounded bg-brand text-brand-foreground hover:brightness-110 cursor-pointer">
              {editId ? "Guardar" : "Crear plantilla"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!verOpen} onClose={() => setVerOpen(null)} title={verOpen?.nombre || ""}>
        {verOpen && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[11px] text-ink-subtle">
              <StatusBadge tone="brand">{TIPO_LABEL[verOpen.tipo]}</StatusBadge>
              <StatusBadge tone={verOpen.activa ? "success" : "neutral"}>{verOpen.activa ? "Activa" : "Inactiva"}</StatusBadge>
            </div>
            {verOpen.descripcion && <p className="text-[12px] text-ink-muted">{verOpen.descripcion}</p>}
            <pre className="bg-secondary/40 p-3 rounded text-[11.5px] whitespace-pre-wrap font-mono ring-1 ring-border max-h-[60vh] overflow-auto">
              {verOpen.contenido}
            </pre>
          </div>
        )}
      </Modal>
    </PageShell>
  );
}
