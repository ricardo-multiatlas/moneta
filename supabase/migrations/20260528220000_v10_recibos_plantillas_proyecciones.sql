-- ============================================================
-- v0.10: cierre de brechas funcionales
-- - Tabla recibos con estado cobrado/devuelto
-- - Tabla plantillas_contratos editables
-- - Vista vw_proyeccion_ingresos para forecast
-- - Backup manual ya implementado via Edge Function (no requiere tabla)
-- ============================================================

-- ------------------------------------------------------------
-- 1) Recibos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recibos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poliza_id UUID REFERENCES public.polizas(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  numero_recibo TEXT,
  importe DECIMAL(10,2) NOT NULL,
  fecha_emision DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_cobro DATE,
  fecha_devolucion DATE,
  motivo_devolucion TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','cobrado','devuelto','reclamando','impagado','anulado')),
  periodo TEXT DEFAULT 'anual'
    CHECK (periodo IN ('mensual','trimestral','semestral','anual','unico')),
  forma_pago TEXT DEFAULT 'domiciliacion'
    CHECK (forma_pago IN ('domiciliacion','transferencia','tarjeta','efectivo','otro')),
  iban_cargo TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recibos_poliza ON public.recibos(poliza_id);
CREATE INDEX IF NOT EXISTS idx_recibos_cliente ON public.recibos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_recibos_estado ON public.recibos(estado);
CREATE INDEX IF NOT EXISTS idx_recibos_fecha_emision ON public.recibos(fecha_emision);

ALTER TABLE public.recibos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recibos_select ON public.recibos;
CREATE POLICY recibos_select ON public.recibos FOR SELECT USING (
  public.es_root() OR public.es_secretaria()
  OR public.es_jefe_zona() AND cliente_id IN (
    SELECT c.id FROM public.clientes c WHERE c.comercial_asignado_id IN (SELECT public.mis_comerciales_ids())
  )
  OR cliente_id IN (
    SELECT c.id FROM public.clientes c WHERE c.comercial_asignado_id = auth.uid()
  )
  OR auth.uid() IS NULL
);

DROP POLICY IF EXISTS recibos_iud ON public.recibos;
CREATE POLICY recibos_iud ON public.recibos FOR ALL USING (
  public.es_root() OR public.es_secretaria()
  OR cliente_id IN (
    SELECT c.id FROM public.clientes c WHERE c.comercial_asignado_id = auth.uid()
  )
  OR auth.uid() IS NULL
) WITH CHECK (
  public.es_root() OR public.es_secretaria()
  OR cliente_id IN (
    SELECT c.id FROM public.clientes c WHERE c.comercial_asignado_id = auth.uid()
  )
  OR auth.uid() IS NULL
);

DROP TRIGGER IF EXISTS trg_recibos_updated ON public.recibos;
CREATE TRIGGER trg_recibos_updated
  BEFORE UPDATE ON public.recibos
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_recibos ON public.recibos;
CREATE TRIGGER trg_audit_recibos
  AFTER INSERT OR UPDATE OR DELETE ON public.recibos
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

GRANT ALL ON public.recibos TO anon, authenticated;

-- ------------------------------------------------------------
-- 2) Plantillas de contratos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plantillas_contratos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  tipo TEXT NOT NULL DEFAULT 'general'
    CHECK (tipo IN ('general','poliza_auto','poliza_hogar','poliza_vida','poliza_salud','poliza_comercio','presupuesto','renovacion','baja','reclamacion')),
  contenido TEXT NOT NULL,  -- HTML/Markdown con placeholders {{nombre_cliente}}, {{numero_poliza}}, etc.
  activa BOOLEAN DEFAULT TRUE NOT NULL,
  created_by UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plantillas_tipo ON public.plantillas_contratos(tipo);

ALTER TABLE public.plantillas_contratos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plantillas_select ON public.plantillas_contratos;
CREATE POLICY plantillas_select ON public.plantillas_contratos FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS plantillas_iud ON public.plantillas_contratos;
CREATE POLICY plantillas_iud ON public.plantillas_contratos FOR ALL USING (
  public.es_root() OR public.es_secretaria() OR auth.uid() IS NULL
) WITH CHECK (
  public.es_root() OR public.es_secretaria() OR auth.uid() IS NULL
);

DROP TRIGGER IF EXISTS trg_plantillas_updated ON public.plantillas_contratos;
CREATE TRIGGER trg_plantillas_updated
  BEFORE UPDATE ON public.plantillas_contratos
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_plantillas ON public.plantillas_contratos;
CREATE TRIGGER trg_audit_plantillas
  AFTER INSERT OR UPDATE OR DELETE ON public.plantillas_contratos
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

GRANT ALL ON public.plantillas_contratos TO anon, authenticated;

-- Seed: plantillas básicas
INSERT INTO public.plantillas_contratos (nombre, descripcion, tipo, contenido) VALUES
  (
    'Bienvenida nuevo cliente',
    'Email tras alta de cliente',
    'general',
    'Estimado/a {{nombre_cliente}},

Le damos la bienvenida a Moneta Seguros. Su comercial asignado es {{nombre_comercial}} ({{email_comercial}}).

Para cualquier consulta no dude en contactarnos.

Saludos cordiales,
Equipo Moneta Seguros'
  ),
  (
    'Aviso renovación 30 días',
    'Recordatorio de renovación cuando faltan 30 días',
    'renovacion',
    'Estimado/a {{nombre_cliente}},

Le recordamos que su póliza {{numero_poliza}} de {{aseguradora}} ({{ramo}}) vence el próximo {{fecha_vencimiento}}.

La prima actual es de {{prima_anual}}€ anuales. Si desea renovar en las mismas condiciones, no necesita hacer nada. Si quiere revisar coberturas o solicitar otro presupuesto, contáctenos en {{email_comercial}}.

Saludos cordiales,
{{nombre_comercial}}'
  ),
  (
    'Confirmación presupuesto',
    'Envío de presupuesto al cliente',
    'presupuesto',
    'Estimado/a {{nombre_cliente}},

Adjunto le envío el presupuesto solicitado para {{ramo}} con {{aseguradora}}.

Prima estimada: {{prima_estimada}}€
Validez: 30 días

Si tiene preguntas o desea aceptarlo, responda a este mensaje o llámeme al teléfono indicado.

Atentamente,
{{nombre_comercial}}'
  )
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 3) Vista proyección de ingresos (anualizada)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_proyeccion_ingresos AS
WITH polizas_activas AS (
  SELECT
    p.id,
    p.cliente_id,
    p.ramo,
    p.aseguradora,
    p.prima_anual,
    p.comision_importe,
    p.fecha_vencimiento,
    EXTRACT(YEAR FROM p.fecha_vencimiento)::int AS anio_venc,
    EXTRACT(MONTH FROM p.fecha_vencimiento)::int AS mes_venc,
    c.comercial_asignado_id,
    u.zona_id
  FROM public.polizas p
  LEFT JOIN public.clientes c ON c.id = p.cliente_id
  LEFT JOIN public.usuarios u ON u.id = c.comercial_asignado_id
  WHERE p.estado = 'activa'
)
SELECT
  anio_venc,
  mes_venc,
  TO_CHAR(MAKE_DATE(anio_venc, mes_venc, 1), 'YYYY-MM') AS periodo,
  COUNT(*) AS polizas_a_renovar,
  COALESCE(SUM(prima_anual), 0) AS prima_total,
  COALESCE(SUM(comision_importe), 0) AS comision_estimada,
  -- Asume 80% de renovación histórica
  ROUND(COALESCE(SUM(prima_anual), 0) * 0.80, 2) AS prima_proyectada,
  ROUND(COALESCE(SUM(comision_importe), 0) * 0.80, 2) AS comision_proyectada
FROM polizas_activas
WHERE fecha_vencimiento IS NOT NULL
GROUP BY anio_venc, mes_venc
ORDER BY anio_venc, mes_venc;

GRANT SELECT ON public.vw_proyeccion_ingresos TO anon, authenticated;

-- ------------------------------------------------------------
-- 4) Vista resumen recibos por estado (para dashboards)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_recibos_estado AS
SELECT
  estado,
  COUNT(*) AS cantidad,
  COALESCE(SUM(importe), 0) AS total_importe
FROM public.recibos
GROUP BY estado;

GRANT SELECT ON public.vw_recibos_estado TO anon, authenticated;
