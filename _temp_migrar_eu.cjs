// Aplica todas las migraciones del directorio supabase/migrations/ al nuevo
// proyecto MONETA-EU vía Management API.
const fs = require("fs");
const path = require("path");

const PAT = "sbp_e6528e3cdf2e1b77c5a1641ca41b58fdedcdf99c";
const NEW_REF = "osmmbzrlbrdscblouaca";
const MIGRATIONS_DIR = path.join(__dirname, "supabase", "migrations");

async function runSQL(sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${NEW_REF}/database/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${PAT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`❌ ${label} → HTTP ${res.status}`);
    console.error(text.slice(0, 500));
    return false;
  }
  console.log(`✓ ${label}`);
  return true;
}

(async () => {
  // 1. Asegurar extensiones críticas primero
  await runSQL(
    `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pgcrypto;`,
    "Extensiones uuid-ossp + pgcrypto"
  );

  // 1b. Función helper fn_set_updated_at (usada por triggers de v6/v9)
  await runSQL(`
    CREATE OR REPLACE FUNCTION public.fn_set_updated_at() RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `, "Helper fn_set_updated_at");

  // 2. Aplicar migraciones en orden alfabético
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const f of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    const ok = await runSQL(sql, f);
    if (!ok) {
      console.error(`Migración FALLÓ en ${f}. Deteniendo.`);
      process.exit(1);
    }
  }

  console.log("\n✓ Todas las migraciones aplicadas en MONETA-EU");

  // 3. Aplicar v6 SQL editor (RPC audit_perform + dashboard_widgets/reportes_personalizados)
  const v6Path = path.join(__dirname, "supabase", "APLICAR_EN_SQL_EDITOR_v6.sql");
  if (fs.existsSync(v6Path)) {
    const v6sql = fs.readFileSync(v6Path, "utf8");
    await runSQL(v6sql, "v6 (audit_perform + dashboard + reportes)");
  }

  // 4. Aplicar cron de vencimientos
  const cronSQL = `
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    CREATE EXTENSION IF NOT EXISTS pg_net;

    SELECT cron.unschedule('avisar_vencimientos_diario')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'avisar_vencimientos_diario');

    SELECT cron.schedule(
      'avisar_vencimientos_diario',
      '0 8 * * *',
      $$
      SELECT net.http_post(
        url := 'https://${NEW_REF}.supabase.co/functions/v1/enviar-aviso-vencimiento',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zbW1ienJsYnJkc2NibG91YWNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTk4NjIxMiwiZXhwIjoyMDk1NTYyMjEyfQ.ulLnH6iT3H7CFLWyqkQ8A0DT2ZLXViN5EnVS6DrkZAs'
        ),
        body := jsonb_build_object('trigger', 'cron')
      );
      $$
    );
  `;
  await runSQL(cronSQL, "Cron vencimientos diario");

  console.log("\n=== MIGRACIONES COMPLETADAS EN MONETA-EU ===");
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
