// Edge Function: webhook-resend
// Recibe eventos POST de Resend (email.sent, delivered, opened, clicked, bounced)
// y los registra en email_eventos. Si el evento incluye campana_envio_id en tags,
// actualiza el row correspondiente.
//
// Despliegue (sin verificación JWT — Resend no envía JWT propio):
//   supabase functions deploy webhook-resend --no-verify-jwt
//
// Configurar en Resend dashboard → Webhooks → Add Endpoint:
//   URL: https://<project>.supabase.co/functions/v1/webhook-resend
//   Eventos: email.sent, email.delivered, email.opened, email.clicked, email.bounced
//
// (Opcional) Verificar firma con Resend signing secret:
//   supabase secrets set RESEND_WEBHOOK_SECRET=whsec_xxx

// @ts-expect-error - Deno std
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-expect-error - Edge runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// @ts-expect-error - Deno global
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
// @ts-expect-error - Deno global
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ResendEvent {
  type: string;        // "email.sent" | "email.delivered" | "email.opened" | "email.clicked" | "email.bounced"
  created_at: string;
  data: {
    email_id: string;
    to: string[] | string;
    tags?: Array<{ name: string; value: string }>;
    [k: string]: any;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: ResendEvent;
  try {
    payload = (await req.json()) as ResendEvent;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  const destinatario = Array.isArray(payload.data?.to) ? payload.data.to[0] : payload.data?.to;
  const tags = payload.data?.tags || [];
  const campanaEnvioId = tags.find((t) => t.name === "campana_envio_id")?.value || null;

  // 1. Registrar evento
  await sb.from("email_eventos").insert({
    tipo: payload.type,
    resend_id: payload.data?.email_id,
    destinatario,
    campana_envio_id: campanaEnvioId,
    payload: payload as any,
  });

  // 2. Actualizar campana_envios si aplica
  if (campanaEnvioId) {
    const updates: Record<string, any> = {};
    if (payload.type === "email.delivered") updates.entregado_at = payload.created_at;
    if (payload.type === "email.opened") updates.abierto_at = payload.created_at;
    if (payload.type === "email.clicked") updates.clic_at = payload.created_at;
    if (payload.type === "email.bounced") { updates.estado = "rebotado"; updates.error = "bounce"; }
    if (Object.keys(updates).length > 0) {
      await sb.from("campana_envios").update(updates).eq("id", campanaEnvioId);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
