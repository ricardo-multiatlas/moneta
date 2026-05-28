-- ============================================================
-- APLICAR EN: Supabase Dashboard → SQL Editor → New Query → Pegar y Run
-- Proyecto: ivkjpcgkrihixrdyvdsj
-- Versión 2: añade auditoría inmutable, siniestros, anexos,
-- trazabilidad lead→cliente y comunicaciones.
-- 100% idempotente: se puede ejecutar varias veces sin romper nada.
-- ============================================================

-- ------------------------------------------------------------
-- 1) AUDITORÍA INMUTABLE
--    Registro append-only: quién, cuándo, qué cambió en cada tabla.
--    Las filas no se pueden editar ni borrar (revoke).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id BIGSERIAL PRIMARY KEY,
    occurred_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT,
    action TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
    actor_id UUID,
    actor_email TEXT,
    actor_role TEXT,
    old_data JSONB,
    new_data JSONB,
    diff JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON public.audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_occurred    ON public.audit_logs(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor       ON public.audit_logs(actor_id);

-- Función genérica que escribe el log
CREATE OR REPLACE FUNCTION public.fn_audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
  v_uid    UUID;
  v_email  TEXT;
  v_role   TEXT;
  v_old    JSONB;
  v_new    JSONB;
  v_diff   JSONB;
  v_record TEXT;
BEGIN
  -- Datos del actor (puede ser null si es proceso sistema)
  BEGIN
    v_uid   := auth.uid();
    v_email := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'email', NULL);
    v_role  := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', current_user);
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL; v_email := NULL; v_role := current_user;
  END;

  IF (TG_OP = 'INSERT') THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
    v_record := COALESCE((NEW.id)::text, '');
  ELSIF (TG_OP = 'UPDATE') THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record := COALESCE((NEW.id)::text, '');
    -- diff: solo campos que cambiaron
    SELECT jsonb_object_agg(key, value) INTO v_diff
    FROM jsonb_each(v_new)
    WHERE v_old->key IS DISTINCT FROM value;
  ELSE -- DELETE
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_record := COALESCE((OLD.id)::text, '');
  END IF;

  INSERT INTO public.audit_logs (table_name, record_id, action, actor_id, actor_email, actor_role, old_data, new_data, diff)
  VALUES (TG_TABLE_NAME, v_record, TG_OP, v_uid, v_email, v_role, v_old, v_new, v_diff);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función helper para attachar triggers
CREATE OR REPLACE FUNCTION public.fn_install_audit(p_table TEXT) RETURNS void AS $$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS audit_%s ON public.%I', p_table, p_table);
  EXECUTE format('CREATE TRIGGER audit_%s
                    AFTER INSERT OR UPDATE OR DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger()', p_table, p_table);
END;
$$ LANGUAGE plpgsql;

-- Instalar audit triggers en todas las tablas operativas
SELECT public.fn_install_audit('clientes');
SELECT public.fn_install_audit('polizas');
SELECT public.fn_install_audit('vencimientos');
SELECT public.fn_install_audit('facturas');
SELECT public.fn_install_audit('leads');
SELECT public.fn_install_audit('comisiones_reportes');

-- audit_logs es append-only: revocar UPDATE/DELETE
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_select_all"  ON public.audit_logs;
DROP POLICY IF EXISTS "audit_insert_any"  ON public.audit_logs;
CREATE POLICY "audit_select_all" ON public.audit_logs FOR SELECT USING (true);
CREATE POLICY "audit_insert_any" ON public.audit_logs FOR INSERT WITH CHECK (true);
-- No hay políticas de UPDATE ni DELETE: por defecto bloqueado bajo RLS

REVOKE UPDATE, DELETE ON public.audit_logs FROM anon, authenticated, public;
GRANT  SELECT, INSERT ON public.audit_logs TO anon, authenticated;
GRANT  USAGE, SELECT  ON SEQUENCE public.audit_logs_id_seq TO anon, authenticated;

-- ------------------------------------------------------------
-- 2) TRAZABILIDAD: leads → cliente (cuando se gana el lead)
-- ------------------------------------------------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS cliente_convertido_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 3) SINIESTROS por póliza
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.siniestros (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    poliza_id UUID NOT NULL REFERENCES public.polizas(id) ON DELETE CASCADE,
    fecha_ocurrencia DATE NOT NULL,
    fecha_apertura DATE DEFAULT CURRENT_DATE,
    descripcion TEXT NOT NULL,
    importe_estimado DECIMAL(10,2),
    importe_pagado DECIMAL(10,2),
    estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','en_tramite','cerrado','rechazado')),
    referencia_aseguradora TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_siniestros_poliza ON public.siniestros(poliza_id);

-- ------------------------------------------------------------
-- 4) ANEXOS / DOCUMENTOS de póliza
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.polizas_anexos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    poliza_id UUID NOT NULL REFERENCES public.polizas(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL DEFAULT 'documento'
        CHECK (tipo IN ('documento','anexo','suplemento','clausula','recibo','otro')),
    nombre TEXT NOT NULL,
    descripcion TEXT,
    file_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_polizas_anexos_poliza ON public.polizas_anexos(poliza_id);

-- ------------------------------------------------------------
-- 5) COMUNICACIONES con cliente (notas, llamadas, emails)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comunicaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    poliza_id UUID REFERENCES public.polizas(id) ON DELETE SET NULL,
    tipo TEXT NOT NULL DEFAULT 'nota'
        CHECK (tipo IN ('nota','llamada','email','whatsapp','reunion','sms')),
    asunto TEXT,
    contenido TEXT,
    fecha TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comunicaciones_cliente ON public.comunicaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_comunicaciones_fecha   ON public.comunicaciones(fecha DESC);

-- ------------------------------------------------------------
-- 6) Líneas de detalle del informe de comisiones (post-IA)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comisiones_lineas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporte_id UUID NOT NULL REFERENCES public.comisiones_reportes(id) ON DELETE CASCADE,
    numero_poliza TEXT,
    tomador TEXT,
    importe_declarado DECIMAL(10,2),
    importe_esperado DECIMAL(10,2),
    diferencia DECIMAL(10,2),
    poliza_id UUID REFERENCES public.polizas(id) ON DELETE SET NULL,
    estado_match TEXT DEFAULT 'sin_match'
        CHECK (estado_match IN ('match_exacto','match_aproximado','sin_match','sin_poliza')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comisiones_lineas_reporte ON public.comisiones_lineas(reporte_id);

-- ------------------------------------------------------------
-- 7) RLS modo desarrollo en las nuevas tablas
-- ------------------------------------------------------------
ALTER TABLE public.siniestros          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polizas_anexos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicaciones      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comisiones_lineas   ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['siniestros','polizas_anexos','comunicaciones','comisiones_lineas']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "dev_select_%s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "dev_insert_%s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "dev_update_%s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "dev_delete_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "dev_select_%s" ON public.%I FOR SELECT USING (true)', t, t);
    EXECUTE format('CREATE POLICY "dev_insert_%s" ON public.%I FOR INSERT WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "dev_update_%s" ON public.%I FOR UPDATE USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "dev_delete_%s" ON public.%I FOR DELETE USING (true)', t, t);
  END LOOP;
END $$;

-- Instalar audit triggers también en estas tablas nuevas
SELECT public.fn_install_audit('siniestros');
SELECT public.fn_install_audit('polizas_anexos');
SELECT public.fn_install_audit('comunicaciones');
SELECT public.fn_install_audit('comisiones_lineas');

-- ------------------------------------------------------------
-- 8) Bucket Storage para PDFs y anexos
--    (Crear desde panel Storage si prefieres UI)
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('polizas-pdf', 'polizas-pdf', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('comisiones-reportes', 'comisiones-reportes', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas storage dev: cualquiera autenticado puede leer/subir
DROP POLICY IF EXISTS "storage_dev_read"   ON storage.objects;
DROP POLICY IF EXISTS "storage_dev_insert" ON storage.objects;
CREATE POLICY "storage_dev_read"
  ON storage.objects FOR SELECT
  USING (bucket_id IN ('polizas-pdf','comisiones-reportes'));
CREATE POLICY "storage_dev_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id IN ('polizas-pdf','comisiones-reportes'));

-- ------------------------------------------------------------
-- 9) GRANTs explícitos para las tablas nuevas
-- ------------------------------------------------------------
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
