import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Faltan variables de entorno para Supabase');
}

// Fetch con timeout 15s. Solo se aplica en cliente — el SSR de Cloudflare
// tiene su propio timeout y aplicar otro encima causa errores raros.
// Sin esto, si Supabase no responde, la petición cuelga indefinidamente
// y los route loaders quedan pendientes para siempre → la UI no responde.
const supabaseFetch: typeof fetch = (input, init) => {
  if (typeof window === "undefined") return fetch(input, init);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  if (init?.signal) {
    if (init.signal.aborted) controller.abort();
    else init.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: supabaseFetch },
});
