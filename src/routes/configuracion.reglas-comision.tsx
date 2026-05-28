import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Shield, Sliders } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, SectionHeader, StatusBadge, Modal } from "@/components/app/ui-bits";
import { RowActions } from "@/components/app/row-actions";
import { DetailModal } from "@/components/app/detail-modal";
import { supabase } from "@/lib/supabase";
import { useDialog } from "@/components/app/dialog-provider";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/configuracion/reglas-comision")({
  component: ReglasComisionPage,
  head: () => ({ meta: [{ title: "Reglas de comisión · Correduría OS" }] }),
});

const RAMOS = ["", "Auto", "Hogar", "Vida", "Salud", "Comercio", "RC", "Decesos"];

interface FormR {
  nombre: string;
  ramo: string;
  aseguradora: string;
  comercial_id: string;
  porcentaje: string;
  bono_fijo: string;
  prioridad: string;
  activa: boolean;
  fecha_desde: string;
  fecha_hasta: string;
}

const emptyForm: FormR = {
  nombre: "", ramo: "", aseguradora: "", comercial_id: "",
  porcentaje: "10", bono_fijo: "0", prioridad: "100", activa: true,
  fecha_desde: "", fecha_hasta: "",
};

function ReglasComisionPage() {
  const [reglas, setReglas] = useState<any[]>([]);
  const [comerciales, setComerciales] = useState<any[]>([]);
  const [cargandoLista, setCargandoLista] = useState(true);
  const router = useRouter();
  const { toast, confirm } = useDialog();
  const { esRoot, loading } = usePermissions();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const cargar = async () => {
    setCargandoLista(true);
    const [{ data: rs }, { data: cms }] = await Promise.all([
      supabase
        .from("reglas_comision")
        .select(`
          id, nombre, ramo, aseguradora, comercial_id, porcentaje, bono_fijo, activa, prioridad, fecha_desde, fecha_hasta, created_at,
          comercial:usuarios!reglas_comision_comercial_id_fkey(nombre)
        `)
        .order("prioridad", { ascending: false }),
      supabase.from("usuarios").select("id, nombre").eq("rol", "comercial").order("nombre"),
    ]);
    setReglas(rs || []);
    setComerciales(cms || []);
    setCargandoLista(false);
  };
  useEffect(() => { cargar(); }, []);
  const [viewing, setViewing] = useState<any | null>(null);
  const [form, setForm] = useState<FormR>(emptyForm);

  useEffect(() => {
    if (!open) { setEditId(null); setForm(emptyForm); }
  }, [open]);

  if (!loading && !esRoot) {
    return (
      <PageShell title="Sin acceso">
        <Card className="p-8 text-center">
          <Shield className="size-8 text-ink-subtle mx-auto mb-3" />
          <p className="text-[13px] text-ink-subtle">Solo root puede gestionar reglas de comisión.</p>
          <Link to="/configuracion" className="text-[12px] text-brand hover:underline">← Volver</Link>
        </Card>
      </PageShell>
    );
  }

  const abrirEditar = (r: any) => {
    setEditId(r.id);
    setForm({
      nombre: r.nombre,
      ramo: r.ramo || "",
      aseguradora: r.aseguradora || "",
      comercial_id: r.comercial_id || "",
      porcentaje: String(r.porcentaje ?? "10"),
      bono_fijo: String(r.bono_fijo ?? "0"),
      prioridad: String(r.prioridad ?? "100"),
      activa: !!r.activa,
      fecha_desde: r.fecha_desde || "",
      fecha_hasta: r.fecha_hasta || "",
    });
    setOpen(true);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const payload = {
      nombre: form.nombre,
      ramo: form.ramo || null,
      aseguradora: form.aseguradora || null,
      comercial_id: form.comercial_id || null,
      porcentaje: Number(form.porcentaje),
      bono_fijo: Number(form.bono_fijo),
      prioridad: Number(form.prioridad),
      activa: form.activa,
      fecha_desde: form.fecha_desde || null,
      fecha_hasta: form.fecha_hasta || null,
    };
    const { error } = editId
      ? await supabase.from("reglas_comision").update(payload).eq("id", editId)
      : await supabase.from("reglas_comision").insert(payload);
    setBusy(false);
    if (error) { toast("Error: " + error.message, "error"); return; }
    setOpen(false);
    cargar();
    toast(editId ? "Regla actualizada" : "Regla creada", "success");
  };

  const eliminar = async (r: any) => {
    const ok = await confirm({ message: `¿Eliminar la regla "${r.nombre}"?`, tone: "danger" });
    if (!ok) return;
    const { error } = await supabase.from("reglas_comision").delete().eq("id", r.id);
    if (error) toast("Error: " + error.message, "error");
    else { toast("Regla eliminada", "success"); cargar(); }
  };

  return (
    <PageShell
      title="Reglas de comisión"
      subtitle="Define qué porcentaje y bono aplica el sistema al calcular comisiones, por ramo, aseguradora o comercial."
      action={
        <div className="flex items-center gap-2">
          <Link to="/configuracion" className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
            <ArrowLeft className="size-3.5" /> Volver
          </Link>
          <button type="button" onClick={() => setOpen(true)} className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 flex items-center gap-1.5 cursor-pointer">
            <Plus className="size-3.5" /> Nueva regla
          </button>
        </div>
      }
    >
      <Card>
        <SectionHeader title={`${reglas.length} regla(s)`} hint="Ordenadas por prioridad. Mayor número = se evalúa antes." action={<Sliders className="size-4 text-ink-subtle" />} />
        {reglas.length === 0 ? (
          <div className="p-8 text-center text-[12px] text-ink-subtle">Sin reglas. Crea la primera.</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Nombre</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Ámbito</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">%</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Bono</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Prioridad</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Activa</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reglas.map((r: any) => (
                <tr key={r.id} className="hover:bg-secondary/30">
                  <td className="px-4 py-3 text-[12.5px] font-medium">{r.nombre}</td>
                  <td className="px-4 py-3 text-[11.5px] text-ink-muted">
                    {[r.ramo, r.aseguradora, r.comercial?.nombre].filter(Boolean).join(" · ") || "Todos"}
                  </td>
                  <td className="px-4 py-3 text-[12px] font-mono">{Number(r.porcentaje).toFixed(2)}%</td>
                  <td className="px-4 py-3 text-[12px] font-mono">{Number(r.bono_fijo).toFixed(2)}€</td>
                  <td className="px-4 py-3 text-[12px] font-mono">{r.prioridad}</td>
                  <td className="px-4 py-3"><StatusBadge tone={r.activa ? "success" : "neutral"}>{r.activa ? "Activa" : "Inactiva"}</StatusBadge></td>
                  <td className="px-4 py-3">
                    <RowActions
                      actions={[
                        { icon: "view", label: "Ver datos", onClick: () => setViewing(r), tone: "brand" },
                        { icon: "edit", label: "Editar", onClick: () => abrirEditar(r) },
                        { icon: "trash", label: "Eliminar", onClick: () => eliminar(r), tone: "danger" },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editId ? "Editar regla" : "Nueva regla de comisión"}>
        <form onSubmit={guardar} className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Nombre</label>
            <input required value={form.nombre} placeholder="Ej. Bono Auto Mapfre Q4" onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Ramo</label>
              <select title="Ramo" value={form.ramo} onChange={e => setForm({ ...form, ramo: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none">
                {RAMOS.map(r => <option key={r} value={r}>{r || "Todos"}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Aseguradora</label>
              <input type="text" placeholder="Todas" value={form.aseguradora} onChange={e => setForm({ ...form, aseguradora: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Comercial</label>
              <select title="Comercial" value={form.comercial_id} onChange={e => setForm({ ...form, comercial_id: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none">
                <option value="">Todos</option>
                {comerciales.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Porcentaje (%)</label>
              <input required type="number" step="0.01" min="0" max="100" value={form.porcentaje} onChange={e => setForm({ ...form, porcentaje: e.target.value })} placeholder="12.50" className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Bono fijo (€)</label>
              <input type="number" step="0.01" min="0" value={form.bono_fijo} onChange={e => setForm({ ...form, bono_fijo: e.target.value })} placeholder="0" className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Prioridad</label>
              <input type="number" min="0" value={form.prioridad} onChange={e => setForm({ ...form, prioridad: e.target.value })} placeholder="100" className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Desde</label>
              <input type="date" title="Fecha desde" placeholder="—" value={form.fecha_desde} onChange={e => setForm({ ...form, fecha_desde: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Hasta</label>
              <input type="date" title="Fecha hasta" placeholder="—" value={form.fecha_hasta} onChange={e => setForm({ ...form, fecha_hasta: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                <input type="checkbox" checked={form.activa} onChange={e => setForm({ ...form, activa: e.target.checked })} title="Activa" />
                Activa
              </label>
            </div>
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="text-[12px] py-1.5 px-3 rounded ring-1 ring-border hover:bg-secondary cursor-pointer">Cancelar</button>
            <button type="submit" disabled={busy} className="text-[12px] py-1.5 px-3 rounded bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50">
              {busy ? "Guardando…" : editId ? "Guardar cambios" : "Crear regla"}
            </button>
          </div>
        </form>
      </Modal>

      <DetailModal
        isOpen={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.nombre || ""}
        rows={viewing ? [
          { label: "Ramo", value: viewing.ramo || "Todos" },
          { label: "Aseguradora", value: viewing.aseguradora || "Todas" },
          { label: "Comercial", value: viewing.comercial?.nombre || "Todos" },
          { label: "Porcentaje", value: `${Number(viewing.porcentaje).toFixed(2)}%` },
          { label: "Bono fijo", value: `${Number(viewing.bono_fijo).toFixed(2)} €` },
          { label: "Prioridad", value: viewing.prioridad },
          { label: "Estado", value: <StatusBadge tone={viewing.activa ? "success" : "neutral"}>{viewing.activa ? "Activa" : "Inactiva"}</StatusBadge> },
          { label: "Desde", value: viewing.fecha_desde || "Sin límite" },
          { label: "Hasta", value: viewing.fecha_hasta || "Sin límite" },
        ] : []}
      />
    </PageShell>
  );
}
