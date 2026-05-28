// Edge Function: audit-with-ip
//
// Wrapper que captura cf-connecting-ip + user-agent del request HTTP y
// llama a la RPC audit_perform en una sola transacción Postgres.
// La RPC hace set_config(...) + mutación en la misma tx → el trigger
// fn_audit_trigger lee las variables y popula audit_logs.ip + user_agent.
//
// Payload:
// {
//   "action": "insert" | "update" | "delete",
//   "table": "clientes",
//   "row": { ... },                    // para insert / update
//   "match": { "id": "uuid" },         // para update / delete
//   "actor_token": "supabase access token del usuario"  // opcional
// }
//
// Despliegue:
//   supabase functions deploy audit-with-ip --no-verify-jwt

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

    const ip = req.headers.get("cf-connecting-ip")
            || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
            || req.headers.get("x-real-ip")
            || "";
    const ua = req.headers.get("user-agent") || "";

    // Usar token del usuario si lo envía, sino service_role.
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

    // Una sola RPC que hace set_config + mutación EN LA MISMA TRANSACCIÓN.
    // Sin esto, set_config(..., true) muere antes del INSERT/UPDATE/DELETE
    // y el trigger ve las variables vacías → audit_logs.ip queda NULL.
    const { data, error } = await sb.rpc("audit_perform", {
      p_action: payload.action,
      p_table: payload.table,
      p_row: payload.row ?? null,
      p_match: payload.match ?? null,
      p_ip: ip,
      p_ua: ua,
    });

    if (error) return jsonResp(500, { error: "audit_perform falló: " + error.message });

    return jsonResp(200, {
      success: true,
      data,
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
