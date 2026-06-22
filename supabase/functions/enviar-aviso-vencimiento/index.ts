// Edge Function: enviar-aviso-vencimiento
// Despliegue:  supabase functions deploy enviar-aviso-vencimiento --no-verify-jwt
// Secrets:
//   supabase secrets set BREVO_API_KEY=xkeysib-xxx
//   supabase secrets set BREVO_FROM_EMAIL=avisos@moneta.es
//   supabase secrets set BREVO_FROM_NAME="Moneta Seguros"
//
// Llamada desde el frontend (vía supabase.functions.invoke):
//   supabase.functions.invoke("enviar-aviso-vencimiento", {
//     body: { vencimiento_id: "uuid", canal: "email" | "whatsapp" }
//   })
//
// Funciona para registros individuales o lotes (pasando ids: [...]).
//
// Proveedor: Brevo (Francia, UE) — sustituye a Resend (USA) para cumplir
// la promesa "datos en UE" del Bloque 8 de la propuesta.

// @ts-expect-error - Deno standard lib (no resuelve en TypeScript Node, sí en Edge runtime)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-expect-error - resuelve en Edge runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// @ts-expect-error - Deno global en Edge runtime
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
// @ts-expect-error - Deno global en Edge runtime
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
// @ts-expect-error - Deno global en Edge runtime
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
// @ts-expect-error - Deno global en Edge runtime
const FROM_EMAIL = Deno.env.get("BREVO_FROM_EMAIL") || "avisos@moneta.es";
// @ts-expect-error - Deno global en Edge runtime
const FROM_NAME = Deno.env.get("BREVO_FROM_NAME") || "Moneta Seguros";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  vencimiento_id?: string;
  ids?: string[];
  canal?: "email" | "whatsapp";
}

interface VencimientoRow {
  id: string;
  fecha_vencimiento: string;
  estado: string;
  polizas: {
    numero_poliza: string;
    ramo: string;
    aseguradora: string;
    prima_anual: number;
    clientes: {
      nombre_razon_social: string;
      email: string | null;
      telefono: string | null;
    };
  };
}

function htmlAvisoVencimiento(v: VencimientoRow): string {
  const cliente = v.polizas.clientes.nombre_razon_social;
  const ramo = v.polizas.ramo;
  const num = v.polizas.numero_poliza;
  const aseg = v.polizas.aseguradora;
  const fecha = new Date(v.fecha_vencimiento).toLocaleDateString("es-ES");
  const dias = Math.ceil((new Date(v.fecha_vencimiento).getTime() - Date.now()) / 86400000);
  return `<!doctype html>
<html lang="es"><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f6f8;padding:24px;color:#222">
  <table cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e3e7eb;overflow:hidden">
    <tr><td style="background:#0f1e2d;color:#fff;padding:18px 24px">
      <div style="font-weight:600;font-size:14px;letter-spacing:.4px">CORREDURÍA MONETA · SEVILLA</div>
    </td></tr>
    <tr><td style="padding:24px">
      <h2 style="margin:0 0 12px;font-size:18px">Hola ${cliente},</h2>
      <p style="margin:0 0 14px;line-height:1.55">
        Te avisamos de que tu póliza de <strong>${ramo}</strong> con <strong>${aseg}</strong>
        (nº ${num}) vence el <strong>${fecha}</strong> (${dias} día${dias === 1 ? "" : "s"}).
      </p>
      <p style="margin:0 0 18px;line-height:1.55">
        Si quieres renovarla con las mismas coberturas, no tienes que hacer nada.
        Si quieres revisar precio o coberturas, contesta a este email y te llamamos.
      </p>
      <div style="background:#f0f4f8;border-radius:6px;padding:12px 16px;font-size:13px;color:#555">
        Prima anual actual: <strong>${Number(v.polizas.prima_anual).toFixed(2)} €</strong>
      </div>
      <p style="margin:18px 0 0;font-size:12px;color:#888">
        Equipo Moneta Seguros · 954 00 00 00 · monetaseguros.es
      </p>
    </td></tr>
  </table>
</body></html>`;
}

function textAvisoVencimiento(v: VencimientoRow): string {
  const cliente = v.polizas.clientes.nombre_razon_social;
  const ramo = v.polizas.ramo;
  const num = v.polizas.numero_poliza;
  const aseg = v.polizas.aseguradora;
  const fecha = new Date(v.fecha_vencimiento).toLocaleDateString("es-ES");
  return `Hola ${cliente},\n\nTu póliza de ${ramo} con ${aseg} (nº ${num}) vence el ${fecha}.\nSi quieres renovarla igual, no hace falta hacer nada. Si quieres revisar precio o coberturas, contesta a este email.\n\nEquipo Moneta Seguros · 954 00 00 00`;
}

async function enviarEmail(
  toEmail: string,
  toName: string,
  subject: string,
  html: string,
  text: string,
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
      textContent: text,
      tags: ["aviso-vencimiento"],
      headers: { "X-Mailin-custom": JSON.stringify(metadata) },
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Brevo ${res.status}: ${txt}`);
  }
  const body = (await res.json()) as { messageId: string };
  return { messageId: body.messageId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!BREVO_API_KEY) {
    return new Response(JSON.stringify({ error: "BREVO_API_KEY no configurado" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload = (await req.json()) as Payload;
  const ids = payload.ids ?? (payload.vencimiento_id ? [payload.vencimiento_id] : []);
  if (ids.length === 0) {
    return new Response(JSON.stringify({ error: "vencimiento_id o ids requeridos" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  const { data, error } = await sb
    .from("vencimientos")
    .select(`
      id, fecha_vencimiento, estado,
      polizas (
        numero_poliza, ramo, aseguradora, prima_anual,
        clientes ( nombre_razon_social, email, telefono )
      )
    `)
    .in("id", ids);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const resultados: Array<{ id: string; ok: boolean; detalle?: string; provider_msg_id?: string }> = [];

  for (const row of (data || []) as unknown as VencimientoRow[]) {
    const email = row.polizas?.clientes?.email;
    if (!email) {
      resultados.push({ id: row.id, ok: false, detalle: "Cliente sin email" });
      continue;
    }
    try {
      const sendRes = await enviarEmail(
        email,
        row.polizas.clientes.nombre_razon_social || "",
        `Tu póliza de ${row.polizas.ramo} vence el ${new Date(row.fecha_vencimiento).toLocaleDateString("es-ES")}`,
        htmlAvisoVencimiento(row),
        textAvisoVencimiento(row),
        { vencimiento_id: row.id, kind: "aviso-vencimiento" }
      );
      await sb.from("vencimientos").update({ estado: "avisado" }).eq("id", row.id);
      await sb.from("comunicaciones").insert({
        cliente_id: null,
        poliza_id: null,
        tipo: "email",
        asunto: `Aviso de vencimiento - póliza ${row.polizas.numero_poliza}`,
        contenido: `Email enviado a ${email} sobre vencimiento del ${row.fecha_vencimiento}. provider_msg_id=${sendRes.messageId}`,
        fecha: new Date().toISOString(),
      });
      resultados.push({ id: row.id, ok: true, provider_msg_id: sendRes.messageId });
    } catch (e) {
      resultados.push({ id: row.id, ok: false, detalle: (e as Error).message });
    }
  }

  return new Response(JSON.stringify({ enviados: resultados.filter((r) => r.ok).length, resultados }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
