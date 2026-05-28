-- ============================================================
-- v0.7: cierre de items pendientes de la matriz Diego
-- - DNI por cliente (categoría separada)
-- - Recibos con estado "devuelto banco"
-- - Tarificador cotizaciones (histórico)
-- - Set audit context (IP + UA via session vars)
-- - Schedule jobs para campañas
-- - Vista comerciales-zona para jefes
-- ============================================================

-- ------------------------------------------------------------
-- 1) Clientes: campos DNI directos
-- ------------------------------------------------------------
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS dni_anverso_url TEXT,
  ADD COLUMN IF NOT EXISTS dni_reverso_url TEXT,
  ADD COLUMN IF NOT EXISTS dni_caduca DATE;

-- ------------------------------------------------------------
-- 2) Tabla recibos (separados de facturas)
--    Recibo = cobro emitido al cliente (mensual/trimestral)
--    Factura = documento contable (que puede agrupar recibos)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recibos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poliza_id UUID NOT NULL REFERENCES public.polizas(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  numero_recibo TEXT,
  periodo TEXT,                       -- ej. "2026-05"
  fecha_emision DATE DEFAULT CURRENT_DATE,
  fecha_cargo DATE,
  importe DECIMAL(10,2) NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','cobrado','devuelto_banco','anulado')),
  motivo_devolucion TEXT,             -- si fue devuelto banco
  cobrado_at TIMESTAMPTZ,
  iban_cargo TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recibos_poliza ON public.recibos(poliza_id);
CREATE INDEX IF NOT EXISTS idx_recibos_cliente ON public.recibos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_recibos_estado ON public.recibos(estado);

-- ------------------------------------------------------------
-- 3) Tabla tarificador_cotizaciones (histórico de cotizaciones)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tarificador_cotizaciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nombre TEXT,
  comercial_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ramo TEXT NOT NULL,
  valor_asegurado DECIMAL(12,2),
  edad_tomador INTEGER,
  resultados JSONB NOT NULL,         -- array de aseguradoras + primas
  presupuesto_id UUID REFERENCES public.presupuestos(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tarificador_cliente ON public.tarificador_cotizaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_tarificador_comercial ON public.tarificador_cotizaciones(comercial_id);

-- ------------------------------------------------------------
-- 4) Set audit context: variables de sesión Postgres con IP + UA
--    La app llama esta RPC antes de cada mutación importante
--    para que el trigger fn_audit_trigger las lea con current_setting()
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_audit_context(
  p_ip TEXT,
  p_user_agent TEXT
) RETURNS void AS $$
BEGIN
  PERFORM set_config('app.audit_ip', COALESCE(p_ip, ''), true);
  PERFORM set_config('app.audit_ua', COALESCE(p_user_agent, ''), true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.set_audit_context(TEXT, TEXT) TO anon, authenticated;

-- Actualizar fn_audit_trigger para que lea las variables de sesión
CREATE OR REPLACE FUNCTION public.fn_audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
  v_uid    UUID;
  v_email  TEXT;
  v_role   TEXT;
  v_ip     TEXT;
  v_ua     TEXT;
  v_old    JSONB;
  v_new    JSONB;
  v_diff   JSONB;
  v_record TEXT;
BEGIN
  BEGIN
    v_uid   := auth.uid();
    v_email := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'email', NULL);
    v_role  := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', current_user);
    v_ip    := NULLIF(current_setting('app.audit_ip', true), '');
    v_ua    := NULLIF(current_setting('app.audit_ua', true), '');
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL; v_email := NULL; v_role := current_user;
    v_ip := NULL; v_ua := NULL;
  END;

  IF (TG_OP = 'INSERT') THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
    v_record := COALESCE((NEW.id)::text, '');
  ELSIF (TG_OP = 'UPDATE') THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record := COALESCE((NEW.id)::text, '');
    SELECT jsonb_object_agg(key, value) INTO v_diff
    FROM jsonb_each(v_new)
    WHERE v_old->key IS DISTINCT FROM value;
  ELSE
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_record := COALESCE((OLD.id)::text, '');
  END IF;

  INSERT INTO public.audit_logs (table_name, record_id, action, actor_id, actor_email, actor_role, ip, user_agent, old_data, new_data, diff)
  VALUES (TG_TABLE_NAME, v_record, TG_OP, v_uid, v_email, v_role, v_ip, v_ua, v_old, v_new, v_diff);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 5) Vista: comerciales agrupados por zona (para dashboard jefe)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_zona_kpis AS
SELECT
  z.id AS zona_id,
  z.nombre AS zona_nombre,
  COUNT(DISTINCT u.id) FILTER (WHERE u.rol = 'comercial' AND u.activo) AS comerciales_activos,
  COUNT(DISTINCT c.id) AS clientes_total,
  COUNT(DISTINCT p.id) FILTER (WHERE p.estado = 'activa') AS polizas_activas,
  COALESCE(SUM(p.prima_anual) FILTER (WHERE p.estado = 'activa'), 0) AS prima_total
FROM public.zonas z
LEFT JOIN public.usuarios u ON u.zona_id = z.id
LEFT JOIN public.clientes c ON c.comercial_asignado_id = u.id
LEFT JOIN public.polizas p ON p.cliente_id = c.id
GROUP BY z.id, z.nombre;

GRANT SELECT ON public.vw_zona_kpis TO anon, authenticated;

-- ------------------------------------------------------------
-- 6) Función calcular_comision_real (USA reglas_comision)
--    Aplica reglas_comision en cada póliza activa del comercial
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calcular_liquidacion_comercial(
  p_comercial_id UUID
) RETURNS DECIMAL AS $$
DECLARE
  v_total DECIMAL := 0;
  v_poliza RECORD;
  v_comision DECIMAL;
BEGIN
  FOR v_poliza IN
    SELECT p.id, p.prima_anual, p.ramo, p.aseguradora
    FROM public.polizas p
    JOIN public.clientes c ON c.id = p.cliente_id
    WHERE c.comercial_asignado_id = p_comercial_id
      AND p.estado = 'activa'
  LOOP
    v_comision := public.fn_calcular_comision(v_poliza.id);
    v_total := v_total + (v_comision / 12);  -- 1/12 mensual
  END LOOP;
  RETURN v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.calcular_liquidacion_comercial(UUID) TO anon, authenticated;

-- ------------------------------------------------------------
-- 7) Schedule job para procesar campañas programadas
--    pg_cron sería ideal pero requiere extension paga.
--    Mantenemos solo la columna y el flag — el procesado real lo hace
--    una Edge Function llamada por el cron de la app (frontend periódico
--    o llamada manual "Procesar pendientes").
-- ------------------------------------------------------------
-- Ya existe campanas.programada_para. Nada que añadir en DB.

-- ------------------------------------------------------------
-- 8) RLS en tablas nuevas
-- ------------------------------------------------------------
ALTER TABLE public.recibos                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarificador_cotizaciones ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['recibos','tarificador_cotizaciones']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_iud"    ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s_select" ON public.%I FOR SELECT USING (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_iud"    ON public.%I FOR ALL    USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- Audit triggers
SELECT public.fn_install_audit('recibos');
SELECT public.fn_install_audit('tarificador_cotizaciones');

GRANT ALL ON public.recibos, public.tarificador_cotizaciones TO anon, authenticated;
