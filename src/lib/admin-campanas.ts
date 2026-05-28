import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

/**
 * Procesa todas las campañas con estado 'programada' y `programada_para <= now()`.
 * Invoca la Edge Function `procesar-campana` para cada una.
 * Solo debe llamarse desde acción explícita de root (no hay scheduler automático).
 */
export const procesarPendientesFn = createServerFn({ method: "POST" })
  .handler(async () => {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!url || !serviceKey) {
      return { success: false as const, error: "Falta config server" };
    }
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: pendientes, error } = await admin
      .from("campanas")
      .select("id")
      .eq("estado", "programada")
      .lte("programada_para", new Date().toISOString());
    if (error) {
      return { success: false as const, error: error.message };
    }
    let procesadas = 0;
    for (const c of pendientes || []) {
      const { error: errInv } = await admin.functions.invoke("procesar-campana", {
        body: { campana_id: c.id },
      });
      if (!errInv) procesadas++;
    }
    return {
      success: true as const,
      procesadas,
      total: pendientes?.length || 0,
    };
  });
