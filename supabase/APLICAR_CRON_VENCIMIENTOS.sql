-- ============================================================
-- Programar cron diario que invoca la Edge Function
-- enviar-aviso-vencimiento todos los días a las 08:00 UTC (10:00 CEST)
-- ============================================================
-- Requiere extensiones pg_cron y pg_net en Supabase.
-- Aplicar UNA VEZ en SQL Editor.
--
-- Para verificar después: SELECT * FROM cron.job;
-- Para borrar el schedule:  SELECT cron.unschedule('avisar_vencimientos_diario');
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Borrar schedule previo si existe (idempotente)
SELECT cron.unschedule('avisar_vencimientos_diario')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'avisar_vencimientos_diario');

-- Programar nuevo schedule: todos los días a las 08:00 UTC
SELECT cron.schedule(
  'avisar_vencimientos_diario',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ivkjpcgkrihixrdyvdsj.supabase.co/functions/v1/enviar-aviso-vencimiento',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $$
);

-- IMPORTANTE: la authorization usa current_setting('app.supabase_service_role_key').
-- Hay que setearla a nivel de instancia EN SUPABASE → Database → Configuration:
--   custom postgres config → app.supabase_service_role_key = <tu SERVICE_ROLE_KEY>
-- O alternativamente, hardcodear el Bearer en este SQL (menos seguro).
--
-- Verificar que se programó:
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'avisar_vencimientos_diario';
