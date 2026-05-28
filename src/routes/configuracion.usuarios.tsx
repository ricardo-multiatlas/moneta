import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, UserPlus, Shield, Mail, Phone, Building2, Edit3, UserX, Check } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, SectionHeader, StatusBadge, Modal } from "@/components/app/ui-bits";
import { RowActions } from "@/components/app/row-actions";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/use-permissions";
import { crearUsuarioAdminFn, resetPasswordAdminFn, eliminarUsuarioAdminFn, resetMFAAdminFn } from "@/lib/admin-users";
import { useDialog } from "@/components/app/dialog-provider";

export const Route = createFileRoute("/configuracion/usuarios")({
  component: UsuariosPage,
  head: () => ({ meta: [{ title: "Usuarios · Correduría OS" }] }),
});

const ROLES = [
  { id: "root", label: "Root (admin total)" },
  { id: "jefe_zona", label: "Jefe de zona" },
  { id: "comercial", label: "Comercial" },
  { id: "secretaria", label: "Secretaría" },
] as const;

function UsuariosPage() {
  const router = useRouter();
  const { esRoot, esJefeZona, perfil, loading } = usePermissions();
  const { toast, confirm, prompt } = useDialog();
  const [usuariosAll, setUsuariosAll] = useState<any[]>([]);
  const [zonas, setZonas] = useState<any[]>([]);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    nombre: "",
    rol: "comercial" as string,
    zona_id: "" as string,
    jefe_id: "" as string,
    telefono: "",
    password: "",
  });

  // Datos vía useEffect → la página renderiza inmediatamente, los datos llegan
  // después. Si la query cuelga, igual ves el form y puedes crear.
  const cargar = async () => {
    setCargandoLista(true);
    const [{ data: us }, { data: zs }] = await Promise.all([
      supabase
        .from("usuarios")
        .select("id, email, nombre, rol, zona_id, jefe_id, telefono, activo, created_at, zonas!usuarios_zona_id_fkey(nombre)")
        .order("created_at", { ascending: false }),
      supabase.from("zonas").select("id, nombre").order("nombre"),
    ]);
    setUsuariosAll(us || []);
    setZonas(zs || []);
    setCargandoLista(false);
  };
  useEffect(() => { cargar(); }, []);

  // Filtrar: jefe_zona solo ve los de su zona (UX, RLS también lo aplica)
  const usuarios = useMemo(() => {
    if (esRoot) return usuariosAll;
    if (esJefeZona && perfil?.zona_id) {
      return usuariosAll.filter((u: any) => u.zona_id === perfil.zona_id);
    }
    return [];
  }, [usuariosAll, esRoot, esJefeZona, perfil?.zona_id]);

  // Posibles jefes: root, admin, jefe_zona (cualquiera con rango superior a comercial)
  const posiblesJefes = usuariosAll.filter(
    (u: any) => ["root", "admin", "jefe_zona"].includes(u.rol) && u.activo
  );
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  if (!loading && !esRoot && !esJefeZona) {
    return (
      <PageShell title="Sin acceso">
        <Card className="p-8 text-center">
          <Shield className="size-8 text-ink-subtle mx-auto mb-3" />
          <p className="text-[13px] text-ink-subtle mb-2">Solo root o jefes de zona pueden gestionar usuarios.</p>
          <Link to="/configuracion" className="text-[12px] text-brand hover:underline">← Volver</Link>
        </Card>
      </PageShell>
    );
  }

  const abrirNuevo = () => {
    setEditId(null);
    // Si es jefe_zona, se fuerza rol=comercial y su propia zona
    setFormData({
      email: "",
      nombre: "",
      rol: "comercial",
      zona_id: esJefeZona && perfil?.zona_id ? perfil.zona_id : "",
      jefe_id: esJefeZona && perfil?.id ? perfil.id : "",
      telefono: "",
      password: "",
    });
    setOpen(true);
  };

  const abrirEdicion = (u: any) => {
    setEditId(u.id);
    setFormData({
      email: u.email,
      nombre: u.nombre,
      rol: u.rol,
      zona_id: u.zona_id || "",
      jefe_id: u.jefe_id || "",
      telefono: u.telefono || "",
      password: "",
    });
    setOpen(true);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);

    // Para jefe_zona: forzar rol=comercial y zona=propia (no puede escalar privilegios)
    const rolFinal = esJefeZona && !esRoot ? "comercial" : formData.rol;
    const zonaFinal = esJefeZona && !esRoot && perfil?.zona_id ? perfil.zona_id : formData.zona_id;

    if (editId) {
      // EDITAR perfil existente (no toca password, eso es botón aparte)
      const { error } = await supabase.from("usuarios").update({
        nombre: formData.nombre,
        rol: rolFinal,
        zona_id: zonaFinal || null,
        jefe_id: formData.jefe_id || null,
        telefono: formData.telefono || null,
      }).eq("id", editId);
      setBusy(false);
      if (error) { toast("Error: " + error.message, "error"); return; }
      setOpen(false);
      cargar();
      return;
    }

    // CREAR usuario nuevo vía server function admin (NO cambia sesión de root)
    const res = await crearUsuarioAdminFn({
      data: {
        email: formData.email,
        password: formData.password,
        nombre: formData.nombre,
        rol: rolFinal,
        zona_id: zonaFinal || null,
        jefe_id: formData.jefe_id || null,
        telefono: formData.telefono || null,
      },
    });
    setBusy(false);
    if (!res.success) {
      toast("Error creando usuario: " + res.error, "error");
      return;
    }
    await confirm({
      title: "Usuario creado",
      message: `Usuario ${formData.email} creado.\nPassword inicial: ${formData.password}`,
      confirmLabel: "OK",
      cancelLabel: "Cerrar",
      tone: "brand",
    });
    setOpen(false);
    setFormData({ email: "", nombre: "", rol: "comercial", zona_id: "", jefe_id: "", telefono: "", password: "" });
    cargar();
  };

  const desactivar = async (u: any) => {
    const accion = u.activo ? "Desactivar" : "Reactivar";

    // Si soy jefe_zona (no root) y voy a desactivar a un comercial: requiere aprobación root
    if (esJefeZona && !esRoot && u.activo) {
      const motivo = await prompt({
        title: "Solicitar desactivación",
        message: `La desactivación de ${u.nombre} requiere aprobación de root. Indica el motivo:`,
        validate: (v) => (v.trim().length < 5 ? "Indica al menos 5 caracteres" : null),
      });
      if (motivo === null) return;
      try {
        const { error } = await supabase.from("aprobaciones").insert({
          tipo: "desactivar_comercial",
          solicitante_id: perfil?.id || null,
          target_user_id: u.id,
          motivo,
          estado: "pendiente",
        });
        if (error) throw new Error(error.message);
        toast("Solicitud enviada a root para aprobación", "info");
      } catch (e: any) {
        toast("Error: " + (e.message || "no se pudo crear la solicitud"), "error");
      }
      return;
    }

    const ok = await confirm({ message: `¿${accion} a ${u.nombre}? ${u.activo ? "No podrá entrar al sistema." : "Volverá a tener acceso."}`, tone: u.activo ? "danger" : "brand" });
    if (!ok) return;
    const { error } = await supabase.from("usuarios").update({ activo: !u.activo }).eq("id", u.id);
    if (error) toast("Error: " + error.message, "error");
    else cargar();
  };

  const resetearPassword = async (u: any) => {
    const nueva = await prompt({
      title: "Resetear contraseña",
      message: `Nueva password para ${u.nombre} (mín. 6 caracteres):`,
      inputType: "text",
      validate: (v) => v.length < 6 ? "Mínimo 6 caracteres" : null,
    });
    if (nueva === null) return;
    const res = await resetPasswordAdminFn({ data: { userId: u.id, password: nueva } });
    if (!res.success) toast("Error: " + res.error, "error");
    else await confirm({
      title: "Password actualizada",
      message: `Password de ${u.nombre} actualizada a:\n${nueva}\n\nComunícasela ahora.`,
      confirmLabel: "OK",
      cancelLabel: "Cerrar",
      tone: "brand",
    });
  };

  const resetear2FA = async (userId: string, nombre: string) => {
    const ok = await confirm({
      title: "Resetear 2FA",
      message: `¿Eliminar todos los factores 2FA de ${nombre}?\nTendrá que volver a configurarlo en su próximo login.`,
      tone: "danger",
    });
    if (!ok) return;
    const res = await resetMFAAdminFn({ data: { userId } });
    if (!res.success) toast("Error: " + res.error, "error");
    else toast(`2FA reseteado (${res.deleted} factor(es) eliminados)`, "success");
  };

  const eliminar = async (u: any) => {
    const ok = await confirm({ message: `¿ELIMINAR PERMANENTEMENTE a ${u.nombre}?\nSe borrará su cuenta y perfil. No se puede deshacer.`, tone: "danger" });
    if (!ok) return;
    const res = await eliminarUsuarioAdminFn({ data: { userId: u.id } });
    if (!res.success) toast("Error: " + res.error, "error");
    else cargar();
  };

  return (
    <PageShell
      title="Usuarios y equipo"
      subtitle="Crea usuarios, asigna roles y zonas. Solo root puede acceder a esta sección."
      action={
        <div className="flex items-center gap-2">
          <Link to="/configuracion" className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
            <ArrowLeft className="size-3.5" /> Volver
          </Link>
          <Link to="/configuracion/zonas" className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
            <Building2 className="size-3.5" /> Gestionar zonas
          </Link>
          <button type="button" onClick={abrirNuevo} className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 flex items-center gap-1.5 cursor-pointer">
            <UserPlus className="size-3.5" /> Nuevo usuario
          </button>
        </div>
      }
    >
      <Card>
        <SectionHeader title={`${usuarios.length} usuario${usuarios.length === 1 ? "" : "s"}`} hint="Click en editar para cambiar rol o zona" />
        {usuarios.length === 0 ? (
          <div className="p-8 text-center text-[12px] text-ink-subtle">Sin usuarios.</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Nombre</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Email</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Rol</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Zona</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Teléfono</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {usuarios.map((u: any) => (
                <tr key={u.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-[12.5px] font-medium">{u.nombre}</td>
                  <td className="px-4 py-3 text-[11.5px] text-ink-muted">{u.email}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={u.rol === "root" || u.rol === "admin" ? "brand" : u.rol === "jefe_zona" ? "warning" : u.rol === "comercial" ? "info" : "neutral"}>
                      {u.rol}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-[11.5px] text-ink-muted">{u.zonas?.nombre || "—"}</td>
                  <td className="px-4 py-3 text-[11.5px] text-ink-muted">{u.telefono || "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={u.activo ? "success" : "danger"}>{u.activo ? "Activo" : "Inactivo"}</StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    <RowActions
                      actions={[
                        { icon: "view", label: u.activo ? "Desactivar acceso" : "Reactivar acceso", onClick: () => desactivar(u), tone: u.activo ? undefined : "brand" },
                        { icon: "edit", label: "Editar perfil", onClick: () => abrirEdicion(u), tone: "brand" },
                        { icon: "print", label: "Resetear password", onClick: () => resetearPassword(u) },
                        { icon: "download", label: "Eliminar usuario", onClick: () => eliminar(u), tone: "danger" },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editId ? "Editar usuario" : "Nuevo usuario"}>
        <form onSubmit={guardar} className="space-y-3">
          {!editId && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-ink-subtle mb-1">Email</label>
                <input required type="email" value={formData.email} placeholder="comercial@moneta.es" onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-ink-subtle mb-1">Contraseña inicial</label>
                <input required type="text" value={formData.password} placeholder="Mín 6 caracteres" onChange={e => setFormData({ ...formData, password: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
              </div>
            </div>
          )}
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Nombre completo</label>
            <input required type="text" value={formData.nombre} placeholder="Nombre Apellido" onChange={e => setFormData({ ...formData, nombre: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {esRoot ? (
              <div>
                <label className="block text-[11px] font-medium text-ink-subtle mb-1">Rol</label>
                <select title="Rol" value={formData.rol} onChange={e => setFormData({ ...formData, rol: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none">
                  {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-medium text-ink-subtle mb-1">Rol</label>
                <div className="w-full bg-secondary rounded px-3 py-2 text-[12px] ring-1 ring-border text-ink-muted">
                  Comercial <span className="text-[10px] text-ink-subtle">(jefes solo crean comerciales)</span>
                </div>
              </div>
            )}
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Zona</label>
              {esRoot ? (
                <select title="Zona" value={formData.zona_id} onChange={e => setFormData({ ...formData, zona_id: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none">
                  <option value="">Sin asignar</option>
                  {zonas.map((z: any) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
                </select>
              ) : (
                <div className="w-full bg-secondary rounded px-3 py-2 text-[12px] ring-1 ring-border text-ink-muted">
                  {zonas.find((z: any) => z.id === perfil?.zona_id)?.nombre || "Tu zona"}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Jefe directo (jerarquía)</label>
            <select
              title="Jefe directo"
              value={formData.jefe_id}
              onChange={e => setFormData({ ...formData, jefe_id: e.target.value })}
              className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none"
            >
              <option value="">Sin jefe asignado</option>
              {posiblesJefes
                .filter((j: any) => j.id !== editId) // no permitir auto-jefe
                .map((j: any) => (
                  <option key={j.id} value={j.id}>
                    {j.nombre} — {j.rol === "root" || j.rol === "admin" ? "Root" : "Jefe zona"}{j.zonas?.nombre ? ` (${j.zonas.nombre})` : ""}
                  </option>
                ))}
            </select>
            <p className="text-[10px] text-ink-subtle mt-1">Define quién supervisa a este usuario. Solo root y jefes de zona pueden ser jefes.</p>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Teléfono</label>
            <input type="tel" value={formData.telefono} placeholder="+34..." onChange={e => setFormData({ ...formData, telefono: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
          </div>
          <div className="pt-2 flex justify-between items-center gap-2">
            {editId ? (
              <button
                type="button"
                onClick={() => resetear2FA(editId, formData.nombre)}
                className="text-[11px] py-1.5 px-2.5 rounded ring-1 ring-warning/30 text-warning hover:bg-warning/10 cursor-pointer flex items-center gap-1.5"
              >
                <Shield className="size-3.5" /> Resetear 2FA
              </button>
            ) : <span />}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="text-[12px] py-1.5 px-3 rounded ring-1 ring-border hover:bg-secondary cursor-pointer">Cancelar</button>
              <button type="submit" disabled={busy} className="text-[12px] py-1.5 px-3 rounded bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
                <Check className="size-3.5" /> {busy ? "Guardando…" : editId ? "Guardar" : "Crear usuario"}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </PageShell>
  );
}
