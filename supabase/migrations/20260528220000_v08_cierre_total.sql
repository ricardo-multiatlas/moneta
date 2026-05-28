-- ============================================================
-- v0.8: cierre total matriz Diego
-- - Tabla alertas_vencimiento (configurador root/jefe)
-- - Tabla integraciones_aseguradoras (API keys por aseguradora)
-- - Tabla aprobaciones (flujo aprobación jefe→root)
-- - Tabla webhook_endpoints (gestión de webhooks)
-- - RLS jefe_zona puede crear/editar comerciales de su zona
-- - Vista vw_ventas_por_ramo, vw_ventas_por_aseguradora, vw_ventas_por_comercial
-- - Vista vw_ranking_aseguradoras (revenue + comisiones)
-- ============================================================

-- ------------------------------------------------------------
-- 1) Alertas personalizadas de vencimiento
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alertas_vencimiento (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  ramo TEXT,                          -- null = todos
  aseguradora TEXT,                   -- null = todas
  comercial_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  zona_id UUID REFERENCES public.zonas(id) ON DELETE SET NULL,
  dias_antes INTEGER NOT NULL DEFAULT 30 CHECK (dias_antes BETWEEN 1 AND 365),
  canal TEXT NOT NULL DEFAULT 'email' CHECK (canal IN ('email','sms','whatsapp','sistema')),
  destinatarios TEXT[],               -- emails o teléfonos extra a notificar
  activa BOOLEAN DEFAULT TRUE NOT NULL,
  ultima_ejecucion TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alertas_activa ON public.alertas_vencimiento(activa);

-- ------------------------------------------------------------
-- 2) Integraciones con aseguradoras (API keys per partner)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integraciones_aseguradoras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aseguradora TEXT NOT NULL UNIQUE,
  estado TEXT NOT NULL DEFAULT 'inactiva' CHECK (estado IN ('inactiva','sandbox','produccion','error')),
  api_endpoint TEXT,
  api_key_encrypted TEXT,             -- en producción cifrar con KMS
  webhook_secret TEXT,
  ultima_sincronizacion TIMESTAMPTZ,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Seed con las aseguradoras del tarificador (todas inactivas)
INSERT INTO public.integraciones_aseguradoras (aseguradora, estado, notas)
VALUES
  ('Mapfre',   'inactiva', 'Pendiente firmar contrato Mapfre Connect'),
  ('Allianz',  'inactiva', 'Pendiente firmar contrato Allianz Direct'),
  ('Axa',      'inactiva', 'Pendiente firmar contrato Axa Conecta'),
  ('Generali', 'inactiva', 'Pendiente'),
  ('Reale',    'inactiva', 'Pendiente'),
  ('Caser',    'inactiva', 'Pendiente'),
  ('Mutua Madrileña', 'inactiva', 'Pendiente')
ON CONFLICT (aseguradora) DO NOTHING;

-- ------------------------------------------------------------
-- 3) Flujo de aprobaciones (jefe pide → root aprueba)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.aprobaciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo TEXT NOT NULL CHECK (tipo IN ('desactivar_comercial','eliminar_cliente','cambio_rol','otro')),
  solicitante_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  target_cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  payload JSONB,                      -- datos contextuales según tipo
  motivo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada')),
  resuelto_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  resuelto_at TIMESTAMPTZ,
  comentario_resolucion TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aprobaciones_estado ON public.aprobaciones(estado);

-- ------------------------------------------------------------
-- 4) Webhook endpoints (gestión de webhooks salientes)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  url TEXT NOT NULL,
  evento TEXT NOT NULL,               -- ej. "poliza.created", "vencimiento.proximo", "*"
  secret TEXT,
  activo BOOLEAN DEFAULT TRUE NOT NULL,
  ultima_invocacion TIMESTAMPTZ,
  ultima_respuesta INTEGER,           -- HTTP status code
  invocaciones_totales INTEGER DEFAULT 0,
  invocaciones_fallidas INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------
-- 5) RLS: jefe_zona puede crear/editar comerciales de su zona
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "usuarios_insert" ON public.usuarios;
CREATE POLICY "usuarios_insert" ON public.usuarios FOR INSERT WITH CHECK (
  public.es_root()
  -- Jefe de zona puede crear comerciales en su misma zona
  OR (public.es_jefe_zona() AND rol = 'comercial' AND zona_id = public.mi_zona())
  OR auth.uid() IS NULL
);

DROP POLICY IF EXISTS "usuarios_update" ON public.usuarios;
CREATE POLICY "usuarios_update" ON public.usuarios FOR UPDATE USING (
  public.es_root()
  -- Cada uno puede editar su propio perfil
  OR id = auth.uid()
  -- Jefe de zona puede editar comerciales de su zona
  OR (public.es_jefe_zona() AND rol = 'comercial' AND zona_id = public.mi_zona())
  OR auth.uid() IS NULL
);

-- ------------------------------------------------------------
-- 6) Vistas de análisis para dashboard ejecutivo
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_ventas_por_ramo AS
SELECT
  COALESCE(p.ramo, 'Sin ramo') AS ramo,
  COUNT(*) AS polizas_count,
  COUNT(*) FILTER (WHERE p.estado = 'activa') AS activas,
  COALESCE(SUM(p.prima_anual), 0) AS prima_total,
  COALESCE(SUM(p.prima_anual) FILTER (WHERE p.estado = 'activa'), 0) AS prima_activa,
  COALESCE(SUM(COALESCE(p.comision_importe, p.prima_anual * 0.1)), 0) AS comision_total
FROM public.polizas p
GROUP BY p.ramo
ORDER BY prima_activa DESC;

GRANT SELECT ON public.vw_ventas_por_ramo TO anon, authenticated;

CREATE OR REPLACE VIEW public.vw_ventas_por_aseguradora AS
SELECT
  COALESCE(p.aseguradora, 'Sin aseguradora') AS aseguradora,
  COUNT(*) AS polizas_count,
  COUNT(*) FILTER (WHERE p.estado = 'activa') AS activas,
  COALESCE(SUM(p.prima_anual), 0) AS prima_total,
  COALESCE(SUM(p.prima_anual) FILTER (WHERE p.estado = 'activa'), 0) AS prima_activa,
  COALESCE(SUM(COALESCE(p.comision_importe, p.prima_anual * 0.1)), 0) AS comision_total,
  ROUND(
    100.0 * COALESCE(SUM(COALESCE(p.comision_importe, p.prima_anual * 0.1)), 0) /
    NULLIF(COALESCE(SUM(p.prima_anual), 0), 0),
    2
  ) AS rentabilidad_pct
FROM public.polizas p
GROUP BY p.aseguradora
ORDER BY prima_activa DESC;

GRANT SELECT ON public.vw_ventas_por_aseguradora TO anon, authenticated;

CREATE OR REPLACE VIEW public.vw_ventas_por_comercial AS
SELECT
  u.id AS comercial_id,
  u.nombre AS comercial_nombre,
  u.email AS comercial_email,
  z.nombre AS zona_nombre,
  COUNT(DISTINCT c.id) AS clientes_count,
  COUNT(p.id) FILTER (WHERE p.estado = 'activa') AS polizas_activas,
  COALESCE(SUM(p.prima_anual) FILTER (WHERE p.estado = 'activa'), 0) AS prima_total,
  COALESCE(SUM(COALESCE(p.comision_importe, p.prima_anual * 0.1)) FILTER (WHERE p.estado = 'activa'), 0) AS comision_anual
FROM public.usuarios u
LEFT JOIN public.zonas z ON z.id = u.zona_id
LEFT JOIN public.clientes c ON c.comercial_asignado_id = u.id
LEFT JOIN public.polizas p ON p.cliente_id = c.id
WHERE u.rol = 'comercial' AND u.activo
GROUP BY u.id, u.nombre, u.email, z.nombre
ORDER BY prima_total DESC;

GRANT SELECT ON public.vw_ventas_por_comercial TO anon, authenticated;

-- Tendencia mensual: pólizas creadas por mes (últimos 12)
CREATE OR REPLACE VIEW public.vw_tendencia_mensual AS
SELECT
  date_trunc('month', p.created_at)::date AS mes,
  COUNT(*) AS polizas_nuevas,
  COALESCE(SUM(p.prima_anual), 0) AS prima_nueva
FROM public.polizas p
WHERE p.created_at >= now() - interval '12 months'
GROUP BY mes
ORDER BY mes ASC;

GRANT SELECT ON public.vw_tendencia_mensual TO anon, authenticated;

-- ------------------------------------------------------------
-- 7) RLS en tablas nuevas
-- ------------------------------------------------------------
ALTER TABLE public.alertas_vencimiento         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integraciones_aseguradoras  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aprobaciones                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints           ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['alertas_vencimiento','integraciones_aseguradoras','aprobaciones','webhook_endpoints']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_iud"    ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s_select" ON public.%I FOR SELECT USING (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_iud"    ON public.%I FOR ALL    USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- Audit triggers
SELECT public.fn_install_audit('alertas_vencimiento');
SELECT public.fn_install_audit('integraciones_aseguradoras');
SELECT public.fn_install_audit('aprobaciones');
SELECT public.fn_install_audit('webhook_endpoints');

GRANT ALL ON public.alertas_vencimiento, public.integraciones_aseguradoras, public.aprobaciones, public.webhook_endpoints TO anon, authenticated;
