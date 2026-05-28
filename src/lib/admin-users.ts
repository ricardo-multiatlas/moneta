import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

/**
 * Crea un usuario nuevo desde la admin API (service_role).
 * Ventajas vs supabase.auth.signUp() en el cliente:
 *  1. NO cambia la sesión del usuario actual (root sigue logueado).
 *  2. Marca el email como confirmado para entrar al instante.
 *  3. Inserta el perfil en public.usuarios con el rol asignado por root.
 */
export const crearUsuarioAdminFn = createServerFn({ method: "POST" })
  .inputValidator((d: {
    email: string;
    password: string;
    nombre: string;
    rol: string;
    zona_id?: string | null;
    jefe_id?: string | null;
    telefono?: string | null;
  }) => d)
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!url || !serviceKey) {
      return { success: false as const, error: "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el servidor" };
    }

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    // 1. Crear en auth.users con email ya confirmado
    const { data: created, error: errAuth } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { nombre: data.nombre },
    });
    if (errAuth || !created.user) {
      return { success: false as const, error: errAuth?.message || "No se creó el usuario en auth" };
    }

    // 2. Insertar perfil en public.usuarios con rol, zona y jerarquía
    const { error: errPerfil } = await admin.from("usuarios").upsert({
      id: created.user.id,
      email: data.email,
      nombre: data.nombre,
      rol: data.rol,
      zona_id: data.zona_id || null,
      jefe_id: data.jefe_id || null,
      telefono: data.telefono || null,
      activo: true,
    });
    if (errPerfil) {
      // Rollback: borrar el auth.user si falló el perfil
      await admin.auth.admin.deleteUser(created.user.id);
      return { success: false as const, error: "Perfil: " + errPerfil.message };
    }

    return { success: true as const, userId: created.user.id };
  });

/**
 * Resetear la password de un usuario (solo root). Usa admin API.
 */
export const resetPasswordAdminFn = createServerFn({ method: "POST" })
  .inputValidator((d: { userId: string; password: string }) => d)
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!url || !serviceKey) {
      return { success: false as const, error: "Falta config server" };
    }
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error } = await admin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) return { success: false as const, error: error.message };
    return { success: true as const };
  });

/**
 * Resetear (eliminar) todos los factores MFA del usuario. Solo root.
 */
export const resetMFAAdminFn = createServerFn({ method: "POST" })
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!url || !serviceKey) return { success: false as const, error: "Falta config server" };
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    // Listar factors del usuario
    const { data: factors, error: errList } = await admin.auth.admin.mfa.listFactors({ userId: data.userId });
    if (errList) return { success: false as const, error: errList.message };
    let deleted = 0;
    for (const f of factors?.factors || []) {
      const { error: errDel } = await admin.auth.admin.mfa.deleteFactor({ userId: data.userId, id: f.id });
      if (!errDel) deleted++;
    }
    return { success: true as const, deleted };
  });

/**
 * Eliminar un usuario completamente (auth + perfil). Solo root.
 */
export const eliminarUsuarioAdminFn = createServerFn({ method: "POST" })
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!url || !serviceKey) return { success: false as const, error: "Falta config server" };
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error } = await admin.auth.admin.deleteUser(data.userId);
    if (error) return { success: false as const, error: error.message };
    await admin.from("usuarios").delete().eq("id", data.userId);
    return { success: true as const };
  });
