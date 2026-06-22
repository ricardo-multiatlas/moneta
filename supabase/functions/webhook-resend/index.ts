// Edge Function: webhook-brevo
// (Carpeta sigue llamándose `webhook-resend` para no romper la URL pública
//  ni los redirects/transactionWebhook ya configurados — solo el código se
//  adapta al nuevo proveedor Brevo, Francia / UE.)
//
// Recibe eventos POST de Brevo (delivered, opened, click, hard_bounce,
// soft_bounce, spam, unsubscribed) y los registra en email_eventos.
// Si el evento incluye campana_envio_id en headers `X-Mailin-custom`,
// actualiza el row correspondiente de campana_envios.
//
// Despliegue (sin verificación JWT — Brevo no envía JWT propio):
//   supabase functions deploy webhook-resend --no-verify-jwt
//
// Configurar en Brevo dashboard → Transactional → Settings → Webhook:
//   URL: https://<project>.supabase.co/functions/v1/webhook-resend
//   Eventos: delivered, opened, click, hard_bounce, soft_bounce, spam, unsubscribed

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

// Payload de Brevo (transactional webhook).
// Docs: https://developers.brevo.com/docs/transactional-webhooks
interface BrevoEvent {
  event: string;                 // "delivered" | "opened" | "click" | "hard_bounce" | "soft_bounce" | "spam" | "unsubscribed" | "request" | "deferred"
  email?: string;
  date?: string;                 // ISO timestamp
  ts?: number;                   // epoch (alternativo)
  "message-id"?: string;         // <uuid@smtp-relay.mailin.fr>
  messageId?: string;            // por si el header llega camelCase
  tag?: string | string[];
  tags?: string[];
  link?: string;                 // solo en `click`
  reason?: string;               // en bounces / spam
  "X-Mailin-custom"?: string;    // JSON con metadata custom (campana_envio_id, etc.)
  [k: string]: any;
}

// Mapea evento Brevo → tipo canónico en email_eventos.
function mapEventTipo(event: string): string {
  switch (event) {
    case "delivered":     return "entregado";
    case "opened":        return "abierto";
    case "click":         return "click";
    case "hard_bounce":
    case "soft_bounce":   return "rebote";
    case "spam":          return "spam";
    case "unsubscribed":  return "baja";
    case "request":       return "enviado";   // alias informativo
    case "deferred":      return "diferido";
    default:              return event;        // pasa cualquier otro tal cual
  }
}

function parseMailinCustom(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

function eventTimestamp(payload: BrevoEvent): string {
  if (payload.date) return payload.date;
  if (typeof payload.ts === "number") return new Date(payload.ts * 1000).toISOString();
  return new Date().toISOString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: BrevoEvent;
  try {
    payload = (await req.json()) as BrevoEvent;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  const tipo = mapEventTipo(payload.event);
  const providerMsgId = payload["message-id"] || payload.messageId || null;
  const destinatario = payload.email || null;
  const custom = parseMailinCustom(payload["X-Mailin-custom"]);
  const campanaEnvioId = custom.campana_envio_id || null;
  const ts = eventTimestamp(payload);

  // 1. Registrar evento
  await sb.from("email_eventos").insert({
    tipo,
    provider: "brevo",
    provider_msg_id: providerMsgId,
    destinatario,
    campana_envio_id: campanaEnvioId,
    payload: payload as any,
  });

  // 2. Actualizar campana_envios si aplica
  if (campanaEnvioId) {
    const updates: Record<string, any> = {};
    if (payload.event === "delivered") updates.entregado_at = ts;
    if (payload.event === "opened") updates.abierto_at = ts;
    if (payload.event === "click") updates.clic_at = ts;
    if (payload.event === "hard_bounce" || payload.event === "soft_bounce") {
      updates.estado = "rebotado";
      updates.error = payload.reason || payload.event;
    }
    if (payload.event === "spam") {
      updates.estado = "spam";
      updates.error = payload.reason || "spam";
    }
    if (payload.event === "unsubscribed") {
      updates.estado = "baja";
    }
    if (Object.keys(updates).length > 0) {
      await sb.from("campana_envios").update(updates).eq("id", campanaEnvioId);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
