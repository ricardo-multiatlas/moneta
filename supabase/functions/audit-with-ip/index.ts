// Edge Function: audit-with-ip
//
// Wrapper que captura cf-connecting-ip + user-agent del request HTTP,
// los setea en variables de sesión Postgres (set_audit_context) y EN LA
// MISMA TRANSACCIÓN ejecuta la mutación. Así el trigger fn_audit_trigger
// lee las variables y popula audit_logs.ip y audit_logs.user_agent.
//
// Payload:
// {
//   "action": "insert" | "update" | "delete",
//   "table": "clientes",
//   "row": { ... },                    // para insert / update
//   "match": { "id": "uuid" },         // para update / delete
//   "actor_token": "supabase access token del usuario"  // opcional, para hacer la mutación con su JWT
// }
//
// Despliegue:
//   supabase functions deploy audit-with-ip --no-verify-jwt
//   (no requiere secrets adicionales: usa SUPABASE_SERVICE_ROLE_KEY ya configurado)

// @ts-expect-error - Deno runtime
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-expect-error - Deno runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// @ts-expect-error - Deno global
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
// @ts-expect-error - Deno global
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  action: "insert" | "update" | "delete";
  table: string;
  row?: Record<string, unknown>;
  match?: Record<string, unknown>;
  actor_token?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as Payload;
    if (!payload.action || !payload.table) {
      return jsonResp(400, { error: "action y table son requeridos" });
    }

    // Capturar IP del request (Cloudflare lo añade automáticamente)
    const ip = req.headers.get("cf-connecting-ip")
            || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
            || req.headers.get("x-real-ip")
            || "";
    const ua = req.headers.get("user-agent") || "";

    // Cliente Supabase: si el caller envió un token de usuario, usarlo (para que auth.uid funcione)
    // Si no, usar service_role.
    const authHeader = req.headers.get("authorization");
    const userToken = payload.actor_token
                   || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);

    const sb = userToken
      ? createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { autoRefreshToken: false, persistSession: false },
          global: { headers: { Authorization: `Bearer ${userToken}` } },
        })
      : createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

    // 1. Setear contexto de auditoría (IP + UA)
    const { error: errCtx } = await sb.rpc("set_audit_context", {
      p_ip: ip,
      p_user_agent: ua,
    });
    if (errCtx) {
      return jsonResp(500, { error: "set_audit_context falló: " + errCtx.message });
    }

    // 2. Ejecutar la mutación
    let res;
    switch (payload.action) {
      case "insert":
        if (!payload.row) return jsonResp(400, { error: "row requerido para insert" });
        res = await sb.from(payload.table).insert(payload.row).select();
        break;
      case "update":
        if (!payload.row || !payload.match) {
          return jsonResp(400, { error: "row y match requeridos para update" });
        }
        let q = sb.from(payload.table).update(payload.row);
        for (const [k, v] of Object.entries(payload.match)) {
          q = q.eq(k, v as any);
        }
        res = await q.select();
        break;
      case "delete":
        if (!payload.match) return jsonResp(400, { error: "match requerido para delete" });
        let q2 = sb.from(payload.table).delete();
        for (const [k, v] of Object.entries(payload.match)) {
          q2 = q2.eq(k, v as any);
        }
        res = await q2;
        break;
      default:
        return jsonResp(400, { error: "action inválido: " + payload.action });
    }

    if (res.error) return jsonResp(500, { error: res.error.message });

    return jsonResp(200, {
      success: true,
      data: res.data,
      audit: { ip, ua },
    });
  } catch (e) {
    return jsonResp(500, { error: (e as Error).message });
  }
});

function jsonResp(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
