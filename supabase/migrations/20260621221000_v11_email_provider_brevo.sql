-- ============================================================
-- v11 · Migración Resend → Brevo (proveedor de email en UE)
-- Bloque 8 de la propuesta: cumplir promesa "datos en UE".
-- Brevo (ex-Sendinblue) está en Francia.
-- ============================================================
-- Cambios:
--   1. email_eventos.resend_id  →  email_eventos.provider_msg_id
--   2. email_eventos.provider   (nuevo, DEFAULT 'brevo')
--   3. Renombrar índice idx_email_eventos_resend → idx_email_eventos_provider_msg_id
-- Idempotente: usa DO $$ con EXCEPTION para tolerar re-aplicación.
-- ============================================================

-- 1) Renombrar columna resend_id → provider_msg_id si todavía existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'email_eventos'
       AND column_name  = 'resend_id'
  ) AND NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'email_eventos'
       AND column_name  = 'provider_msg_id'
  ) THEN
    ALTER TABLE public.email_eventos RENAME COLUMN resend_id TO provider_msg_id;
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    -- email_eventos no existe en este entorno: ignorar.
    NULL;
END $$;

-- 2) Asegurar que existe provider_msg_id (por si la tabla se creó sin resend_id)
ALTER TABLE public.email_eventos
  ADD COLUMN IF NOT EXISTS provider_msg_id TEXT;

-- 3) Añadir columna provider con default 'brevo'
ALTER TABLE public.email_eventos
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'brevo';

-- 4) Sustituir índice antiguo por uno sobre provider_msg_id
DROP INDEX IF EXISTS public.idx_email_eventos_resend;
CREATE INDEX IF NOT EXISTS idx_email_eventos_provider_msg_id
  ON public.email_eventos (provider_msg_id);

-- 5) Index secundario por proveedor (útil cuando convivan históricos Resend + nuevos Brevo)
CREATE INDEX IF NOT EXISTS idx_email_eventos_provider
  ON public.email_eventos (provider);

COMMENT ON COLUMN public.email_eventos.provider_msg_id
  IS 'ID que devuelve el proveedor de email (Brevo: messageId con formato <id@smtp-relay.mailin.fr>)';
COMMENT ON COLUMN public.email_eventos.provider
  IS 'Proveedor de envío: brevo (UE, actual) | resend (USA, legado histórico)';
