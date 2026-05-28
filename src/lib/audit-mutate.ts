import { supabase } from "@/lib/supabase";

/**
 * Wrapper para mutaciones críticas que debe quedar registrada con IP + user-agent
 * en audit_logs. Llama a la Edge Function `audit-with-ip` que captura
 * cf-connecting-ip del request HTTP, setea variables de sesión Postgres
 * y ejecuta la mutación en la misma transacción.
 *
 * Uso:
 *   await auditMutate({ action: "insert", table: "clientes", row: { ... } });
 *   await auditMutate({ action: "update", table: "polizas", row: { estado: "cancelada" }, match: { id: "uuid" } });
 *   await auditMutate({ action: "delete", table: "clientes", match: { id: "uuid" } });
 *
 * Si la Edge Function no está desplegada (error de invoke), cae al cliente
 * Supabase normal — la mutación se registra sin IP/UA (regresión silenciosa
 * a comportamiento anterior, no rompe la app).
 */
export async function auditMutate(opts: {
  action: "insert" | "update" | "delete";
  table: string;
  row?: Record<string, unknown>;
  match?: Record<string, unknown>;
}): Promise<{ data: any; error: { message: string } | null }> {
  // Adjuntar el access token actual para que la Edge Function ejecute la
  // mutación con el JWT del usuario (no como service_role) y respete RLS.
  const { data: sess } = await supabase.auth.getSession();
  const actor_token = sess.session?.access_token;

  try {
    const { data, error } = await supabase.functions.invoke("audit-with-ip", {
      body: { ...opts, actor_token },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return { data: data?.data ?? null, error: null };
  } catch (e: any) {
    // Fallback: ejecutar mutación localmente sin IP/UA
    console.warn("audit-with-ip no disponible, fallback sin IP:", e?.message);
    let q: any;
    switch (opts.action) {
      case "insert":
        q = await supabase.from(opts.table).insert(opts.row as any).select();
        break;
      case "update": {
        let b = supabase.from(opts.table).update(opts.row as any);
        for (const [k, v] of Object.entries(opts.match || {})) b = b.eq(k, v as any);
        q = await b.select();
        break;
      }
      case "delete": {
        let b = supabase.from(opts.table).delete();
        for (const [k, v] of Object.entries(opts.match || {})) b = b.eq(k, v as any);
        q = await b;
        break;
      }
    }
    return { data: q?.data ?? null, error: q?.error ?? null };
  }
}
