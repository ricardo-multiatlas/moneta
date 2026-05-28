import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Shield, MapPin } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, SectionHeader, Modal } from "@/components/app/ui-bits";
import { RowActions } from "@/components/app/row-actions";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/use-permissions";
import { useDialog } from "@/components/app/dialog-provider";

export const Route = createFileRoute("/configuracion/zonas")({
  component: ZonasPage,
  head: () => ({ meta: [{ title: "Zonas · Correduría OS" }] }),
});

function ZonasPage() {
  const [zonas, setZonas] = useState<any[]>([]);
  const [jefes, setJefes] = useState<any[]>([]);
  const [cargandoLista, setCargandoLista] = useState(true);
  const router = useRouter();

  const cargar = async () => {
    setCargandoLista(true);
    const { data: zs } = await supabase
      .from("zonas")
      .select(`
        id, nombre, descripcion, jefe_id, created_at,
        jefe:usuarios!zonas_jefe_id_fkey(nombre, email)
      `)
      .order("nombre");

    const { data: usuariosPorZona } = await supabase
      .from("usuarios")
      .select("zona_id, rol")
      .eq("rol", "comercial");

    const conteoComerciales = new Map<string, number>();
    (usuariosPorZona || []).forEach((u: any) => {
      if (u.zona_id) conteoComerciales.set(u.zona_id, (conteoComerciales.get(u.zona_id) || 0) + 1);
    });

    const { data: js } = await supabase
      .from("usuarios")
      .select("id, nombre, email, rol")
      .in("rol", ["jefe_zona", "root", "admin"]);

    setZonas((zs || []).map((z: any) => ({ ...z, comerciales: conteoComerciales.get(z.id) || 0 })));
    setJefes(js || []);
    setCargandoLista(false);
  };
  useEffect(() => { cargar(); }, []);
  const { puedeGestionarUsuarios, loading } = usePermissions();
  const { toast, confirm } = useDialog();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ nombre: "", descripcion: "", jefe_id: "" });

  if (!loading && !puedeGestionarUsuarios) {
    return (
      <PageShell title="Sin acceso">
        <Card className="p-8 text-center">
          <Shield className="size-8 text-ink-subtle mx-auto mb-3" />
          <p className="text-[13px] text-ink-subtle mb-2">Solo el rol <strong>root</strong> gestiona zonas.</p>
          <Link to="/configuracion" className="text-[12px] text-brand hover:underline">← Volver</Link>
        </Card>
      </PageShell>
    );
  }

  const abrir = (z?: any) => {
    if (z) {
      setEditId(z.id);
      setForm({ nombre: z.nombre, descripcion: z.descripcion || "", jefe_id: z.jefe_id || "" });
    } else {
      setEditId(null);
      setForm({ nombre: "", descripcion: "", jefe_id: "" });
    }
    setOpen(true);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const payload = { nombre: form.nombre, descripcion: form.descripcion || null, jefe_id: form.jefe_id || null };
    const { error } = editId
      ? await supabase.from("zonas").update(payload).eq("id", editId)
      : await supabase.from("zonas").insert(payload);
    setBusy(false);
    if (error) { toast("Error: " + error.message, "error"); return; }
    // Si hay jefe, vincular su usuario a la zona
    if (form.jefe_id) {
      await supabase.from("usuarios").update({ zona_id: editId || (await supabase.from("zonas").select("id").eq("nombre", form.nombre).maybeSingle()).data?.id }).eq("id", form.jefe_id);
    }
    setOpen(false);
    cargar();
  };

  const borrar = async (z: any) => {
    const ok = await confirm({ message: `¿Eliminar zona "${z.nombre}"? Los comerciales asignados quedarán sin zona.`, tone: "danger" });
    if (!ok) return;
    const { error } = await supabase.from("zonas").delete().eq("id", z.id);
    if (error) toast("Error: " + error.message, "error");
    else cargar();
  };

  return (
    <PageShell
      title="Zonas comerciales"
      subtitle="Cada zona tiene un jefe y un equipo de comerciales. Las RLS filtran datos por zona."
      action={
        <div className="flex items-center gap-2">
          <Link to="/configuracion/usuarios" className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
            <ArrowLeft className="size-3.5" /> Usuarios
          </Link>
          <button type="button" onClick={() => abrir()} className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 flex items-center gap-1.5 cursor-pointer">
            <Plus className="size-3.5" /> Nueva zona
          </button>
        </div>
      }
    >
      <Card>
        <div className="px-4 pt-4">
          <SectionHeader
            title={zonas.length === 0 ? "Zonas configuradas" : `${zonas.length} zona${zonas.length === 1 ? "" : "s"}`}
            hint={zonas.length === 0 ? "Aún no hay ninguna" : "Click en editar para cambiar jefe o nombre"}
          />
        </div>
        {zonas.length === 0 ? (
          <div className="p-8 text-center text-[12px] text-ink-subtle">
            Sin zonas. Crea la primera (ej. "Sevilla Centro", "Triana", "Aljarafe").
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Zona</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Jefe</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Comerciales</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {zonas.map((z: any) => (
                <tr key={z.id} className="hover:bg-secondary/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="size-3.5 text-ink-subtle" />
                      <div>
                        <div className="text-[12.5px] font-medium">{z.nombre}</div>
                        {z.descripcion && <div className="text-[11px] text-ink-subtle">{z.descripcion}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[11.5px]">{z.jefe?.nombre || <span className="text-ink-subtle italic">Sin asignar</span>}</td>
                  <td className="px-4 py-3 text-[12px] font-mono">{z.comerciales}</td>
                  <td className="px-4 py-3">
                    <RowActions
                      actions={[
                        { icon: "edit", label: "Editar", onClick: () => abrir(z), tone: "brand" },
                        { icon: "view", label: "Eliminar", onClick: () => borrar(z), tone: "danger" },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editId ? "Editar zona" : "Nueva zona"}>
        <form onSubmit={guardar} className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Nombre</label>
            <input required type="text" value={form.nombre} placeholder="Ej. Sevilla Centro" onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Descripción</label>
            <input type="text" value={form.descripcion} placeholder="Barrios incluidos, alcance…" onChange={e => setForm({ ...form, descripcion: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Jefe de zona</label>
            <select title="Jefe" value={form.jefe_id} onChange={e => setForm({ ...form, jefe_id: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none">
              <option value="">Sin asignar</option>
              {jefes.map((j: any) => <option key={j.id} value={j.id}>{j.nombre} ({j.rol})</option>)}
            </select>
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="text-[12px] py-1.5 px-3 rounded ring-1 ring-border hover:bg-secondary cursor-pointer">Cancelar</button>
            <button type="submit" disabled={busy} className="text-[12px] py-1.5 px-3 rounded bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50">
              {busy ? "Guardando…" : editId ? "Guardar" : "Crear zona"}
            </button>
          </div>
        </form>
      </Modal>
    </PageShell>
  );
}
