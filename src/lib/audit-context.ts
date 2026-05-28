import { supabase } from "@/lib/supabase";

/**
 * Audit context helper — pasa IP pública + user agent del cliente
 * al backend Postgres via la RPC `set_audit_context` (v0.7).
 *
 * DEFENSIVO: si la RPC no existe (migración v0.7 pendiente) o ipify
 * falla, no rompe la app — solo no se persisten esos campos en
 * audit_logs (el trigger los pone NULL).
 */

let lastSet = 0;
let cached: { ip: string; ua: string } | null = null;
const FIVE_MIN = 5 * 60 * 1000;

/** Llama esta función UNA vez por sesión navegador (después del login). */
export async function setupAuditContext(): Promise<void> {
  try {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent;
    const r = await fetch("https://api.ipify.org?format=json");
    const j = (await r.json()) as { ip?: string };
    const ip = j?.ip || "";
    if (!ip) return;
    cached = { ip, ua };
    await supabase.rpc("set_audit_context", { p_ip: ip, p_user_agent: ua });
    lastSet = Date.now();
  } catch {
    // Si la RPC no existe (v0.7 pendiente) o ipify falla, no romper la app
  }
}

/** Refresca el contexto si han pasado >5min desde el último set */
export async function refreshAuditContextIfStale(): Promise<void> {
  if (!cached) return;
  if (Date.now() - lastSet <= FIVE_MIN) return;
  try {
    await supabase.rpc("set_audit_context", { p_ip: cached.ip, p_user_agent: cached.ua });
    lastSet = Date.now();
  } catch {
    // ignore
  }
}
