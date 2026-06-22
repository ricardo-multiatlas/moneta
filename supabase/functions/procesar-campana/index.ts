// Edge Function: procesar-campana
// Despliegue:  supabase functions deploy procesar-campana --no-verify-jwt
// Secrets:
//   supabase secrets set BREVO_API_KEY=xkeysib-xxx
//   supabase secrets set BREVO_FROM_EMAIL=avisos@moneta.es
//   supabase secrets set BREVO_FROM_NAME="Moneta Seguros"
//
// Llamada desde frontend (vía supabase.functions.invoke):
//   supabase.functions.invoke("procesar-campana", { body: { campana_id: "uuid" } })
//
// Proveedor: Brevo (Francia, UE) — sustituye a Resend (USA) para cumplir
// la promesa "datos en UE" del Bloque 8 de la propuesta.

// @ts-expect-error - Deno standard lib
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-expect-error - Edge runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// @ts-expect-error - Deno global
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
// @ts-expect-error - Deno global
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
// @ts-expect-error - Deno global
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
// @ts-expect-error - Deno global
const FROM_EMAIL = Deno.env.get("BREVO_FROM_EMAIL") || "avisos@moneta.es";
// @ts-expect-error - Deno global
const FROM_NAME = Deno.env.get("BREVO_FROM_NAME") || "Moneta Seguros";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  campana_id: string;
}

function reemplazarPlaceholders(texto: string, cliente: any): string {
  return (texto || "")
    .replaceAll("{{nombre}}", cliente.nombre_razon_social || "cliente")
    .replaceAll("{{email}}", cliente.email || "");
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function enviarEmailBrevo(
  toEmail: string,
  toName: string,
  subject: string,
  html: string,
  metadata: Record<string, string>
): Promise<{ messageId: string }> {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY!,
      "Content-Type": "application/json",
      "accept": "application/json",
    },
    body: JSON.stringify({
      sender: { email: FROM_EMAIL, name: FROM_NAME },
      to: [{ email: toEmail, name: toName || toEmail }],
      subject,
      htmlContent: html,
      textContent: htmlToText(html),
      tags: ["campana", `campana:${metadata.campana_id ?? ""}`],
      headers: { "X-Mailin-custom": JSON.stringify(metadata) },
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Brevo ${res.status}: ${txt}`);
  }
  return (await res.json()) as { messageId: string };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!BREVO_API_KEY) {
    return new Response(JSON.stringify({ error: "BREVO_API_KEY no configurado" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { campana_id } = (await req.json()) as Payload;
  if (!campana_id) {
    return new Response(JSON.stringify({ error: "campana_id requerido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  // 1. Cargar campaña
  const { data: campana, error: errCamp } = await sb
    .from("campanas")
    .select("id, nombre, tipo, asunto, contenido, estado")
    .eq("id", campana_id)
    .maybeSingle();
  if (errCamp || !campana) {
    return new Response(JSON.stringify({ error: errCamp?.message || "Campaña no encontrada" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (campana.estado === "enviada") {
    return new Response(JSON.stringify({ error: "Campaña ya enviada" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (campana.tipo !== "email") {
    return new Response(JSON.stringify({ error: `Canal ${campana.tipo} no soportado todavía` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Destinatarios = clientes con email
  const { data: destinatarios, error: errDest } = await sb
    .from("clientes")
    .select("id, nombre_razon_social, email")
    .not("email", "is", null);
  if (errDest) {
    return new Response(JSON.stringify({ error: errDest.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const resultados: Array<{ id: string; ok: boolean; detalle?: string }> = [];
  let ok = 0;
  let fail = 0;

  // Envío uno-a-uno (mantenemos patrón existente — Brevo cobra por destinatario,
  // no por request, y así conservamos el provider_msg_id individual por envío).
  for (const cliente of destinatarios || []) {
    if (!cliente.email) continue;

    // Insertar fila campana_envios primero (para tener id para tagging)
    const { data: envio, error: errEnv } = await sb
      .from("campana_envios")
      .insert({
        campana_id,
        cliente_id: cliente.id,
        destinatario: cliente.email,
        estado: "pendiente",
      })
      .select("id")
      .single();
    if (errEnv || !envio) {
      fail++;
      resultados.push({ id: cliente.id, ok: false, detalle: errEnv?.message });
      continue;
    }

    try {
      const subject = reemplazarPlaceholders(campana.asunto || campana.nombre, cliente);
      const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.55;color:#222;padding:20px">${reemplazarPlaceholders(campana.contenido || "", cliente).replace(/\n/g, "<br>")}</body></html>`;
      const res = await enviarEmailBrevo(
        cliente.email,
        cliente.nombre_razon_social || "",
        subject,
        html,
        { campana_id, campana_envio_id: envio.id },
      );
      await sb.from("campana_envios").update({
        estado: "enviado",
        proveedor_msg_id: res.messageId,
        enviado_at: new Date().toISOString(),
      }).eq("id", envio.id);
      ok++;
      resultados.push({ id: cliente.id, ok: true });
    } catch (e) {
      await sb.from("campana_envios").update({
        estado: "error",
        error: (e as Error).message,
      }).eq("id", envio.id);
      fail++;
      resultados.push({ id: cliente.id, ok: false, detalle: (e as Error).message });
    }
  }

  // 3. Actualizar campaña
  await sb.from("campanas").update({
    estado: "enviada",
    enviada_at: new Date().toISOString(),
    enviados: ok,
    total_destinatarios: destinatarios?.length ?? 0,
  }).eq("id", campana_id);

  return new Response(JSON.stringify({ enviados: ok, fallidos: fail, total: (destinatarios || []).length, resultados }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
