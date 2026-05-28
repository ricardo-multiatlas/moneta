-- ============================================================
-- v0.6: cierra todos los items pendientes de la matriz Diego
-- - Campos extendidos en clientes (familia, ingresos, propiedades, hipoteca)
-- - Tabla disponibilidad comerciales
-- - Tabla reglas de comisión configurables
-- - Tabla firmas electrónicas (con stub provider)
-- - Tabla permisos granulares (recurso × acción × rol)
-- - Trigger auto-asignar comercial al crear cliente como comercial
-- - Función masked IBAN (vista para no-self / no-root)
-- - Webhook log para Resend (tracking apertura/click)
-- ============================================================

-- ------------------------------------------------------------
-- 1) Campos extendidos en clientes
-- ------------------------------------------------------------
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS familia       JSONB,  -- { conyuge, hijos:[{nombre,edad}], otros }
  ADD COLUMN IF NOT EXISTS ingresos      JSONB,  -- { mensual_neto, fuente, otros_ingresos }
  ADD COLUMN IF NOT EXISTS propiedades   JSONB,  -- [{tipo,direccion,valor}]
  ADD COLUMN IF NOT EXISTS hipoteca      JSONB,  -- { entidad, importe, cuota, vencimiento }
  ADD COLUMN IF NOT EXISTS dni_url       TEXT,
  ADD COLUMN IF NOT EXISTS notas_internas TEXT;

-- ------------------------------------------------------------
-- 2) Disponibilidad comerciales (calendario)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.disponibilidad (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comercial_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  hora_inicio TIME,
  hora_fin TIME,
  tipo TEXT NOT NULL DEFAULT 'disponible'
    CHECK (tipo IN ('disponible','ocupado','vacaciones','baja','reunion')),
  nota TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (comercial_id, fecha, hora_inicio)
);
CREATE INDEX IF NOT EXISTS idx_disponibilidad_comercial_fecha ON public.disponibilidad(comercial_id, fecha);

-- ------------------------------------------------------------
-- 3) Reglas de comisión configurables
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reglas_comision (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  ramo TEXT,            -- null = aplica a todos los ramos
  aseguradora TEXT,     -- null = aplica a todas
  comercial_id UUID REFERENCES public.usuarios(id) ON DELETE CASCADE, -- null = aplica a todos
  porcentaje DECIMAL(5,2) NOT NULL,  -- ej. 12.50 = 12.5%
  bono_fijo DECIMAL(10,2) DEFAULT 0, -- ej. +5€ por póliza
  activa BOOLEAN DEFAULT TRUE NOT NULL,
  prioridad INTEGER DEFAULT 100,     -- mayor número = se evalúa antes
  fecha_desde DATE,
  fecha_hasta DATE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------
-- 4) Firmas electrónicas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.firmas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poliza_id UUID REFERENCES public.polizas(id) ON DELETE CASCADE,
  presupuesto_id UUID REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  documento_url TEXT NOT NULL,
  firmante_email TEXT NOT NULL,
  firmante_nombre TEXT,
  proveedor TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (proveedor IN ('pendiente','docusign','signaturit','validatedid')),
  proveedor_request_id TEXT,
  estado TEXT NOT NULL DEFAULT 'enviado'
    CHECK (estado IN ('enviado','visto','firmado','rechazado','expirado','error')),
  firmado_at TIMESTAMPTZ,
  pdf_firmado_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------
-- 5) Permisos granulares (matriz recurso × acción × rol)
--    Sobrescriben los permisos por defecto del rol
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permisos_granulares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rol TEXT NOT NULL,
  recurso TEXT NOT NULL,     -- ej. "comisiones", "facturacion", "tarificador"
  accion TEXT NOT NULL,      -- ej. "ver", "crear", "editar", "eliminar", "aprobar"
  permitido BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (rol, recurso, accion)
);

-- ------------------------------------------------------------
-- 6) Webhook log (tracking apertura/click de emails Resend)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_eventos (
  id BIGSERIAL PRIMARY KEY,
  recibido_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  tipo TEXT NOT NULL,        -- email.sent, email.delivered, email.opened, email.clicked, email.bounced
  resend_id TEXT,
  destinatario TEXT,
  campana_envio_id UUID REFERENCES public.campana_envios(id) ON DELETE SET NULL,
  payload JSONB
);
CREATE INDEX IF NOT EXISTS idx_email_eventos_resend ON public.email_eventos(resend_id);

-- ------------------------------------------------------------
-- 7) Trigger: auto-asignar comercial_asignado_id al crear cliente
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_auto_asignar_comercial()
RETURNS TRIGGER AS $$
BEGIN
  -- Si el cliente no tiene comercial asignado y el actor es comercial, asignárselo
  IF NEW.comercial_asignado_id IS NULL AND auth.uid() IS NOT NULL THEN
    DECLARE
      v_rol TEXT;
    BEGIN
      SELECT rol INTO v_rol FROM public.usuarios WHERE id = auth.uid();
      IF v_rol = 'comercial' THEN
        NEW.comercial_asignado_id := auth.uid();
      END IF;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_asignar_comercial ON public.clientes;
CREATE TRIGGER trg_auto_asignar_comercial
  BEFORE INSERT ON public.clientes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_asignar_comercial();

-- ------------------------------------------------------------
-- 8) Función: calcular comisión aplicando reglas
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_calcular_comision(
  p_poliza_id UUID
) RETURNS DECIMAL AS $$
DECLARE
  v_pol RECORD;
  v_regla RECORD;
  v_pct DECIMAL := 10;  -- default 10%
  v_bono DECIMAL := 0;
BEGIN
  SELECT p.*, c.comercial_asignado_id AS comercial_id
    INTO v_pol
    FROM public.polizas p
    LEFT JOIN public.clientes c ON c.id = p.cliente_id
    WHERE p.id = p_poliza_id;

  IF v_pol IS NULL THEN RETURN 0; END IF;

  -- Buscar regla más específica
  SELECT * INTO v_regla FROM public.reglas_comision
    WHERE activa = TRUE
      AND (ramo IS NULL OR ramo = v_pol.ramo)
      AND (aseguradora IS NULL OR aseguradora = v_pol.aseguradora)
      AND (comercial_id IS NULL OR comercial_id = v_pol.comercial_id)
      AND (fecha_desde IS NULL OR fecha_desde <= CURRENT_DATE)
      AND (fecha_hasta IS NULL OR fecha_hasta >= CURRENT_DATE)
    ORDER BY prioridad DESC
    LIMIT 1;

  IF v_regla.id IS NOT NULL THEN
    v_pct := v_regla.porcentaje;
    v_bono := v_regla.bono_fijo;
  END IF;

  RETURN (v_pol.prima_anual * v_pct / 100) + v_bono;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ------------------------------------------------------------
-- 9) Vista IBAN masked para no-root no-self
--    NOTA: la app debería leer esta vista en lugar de usuarios cuando
--    el visualizador no es root o el propio usuario.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.usuarios_publicos AS
SELECT
  id, email, nombre, rol, zona_id, jefe_id, telefono, foto_url, activo, created_at,
  CASE
    WHEN id = auth.uid() OR public.es_root() THEN iban_cifrado
    WHEN iban_cifrado IS NULL THEN NULL
    ELSE '••••' || RIGHT(iban_cifrado, 4)
  END AS iban_visible
FROM public.usuarios;

GRANT SELECT ON public.usuarios_publicos TO anon, authenticated;

-- ------------------------------------------------------------
-- 10) Ampliar audit_logs con IP + user-agent
-- ------------------------------------------------------------
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS ip TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- ------------------------------------------------------------
-- 11) RLS modo dev abierto en tablas nuevas
-- ------------------------------------------------------------
ALTER TABLE public.disponibilidad      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reglas_comision     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firmas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permisos_granulares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_eventos       ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['disponibilidad','reglas_comision','firmas','permisos_granulares','email_eventos']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_iud"    ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s_select" ON public.%I FOR SELECT USING (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_iud"    ON public.%I FOR ALL    USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- Audit triggers en tablas nuevas
SELECT public.fn_install_audit('disponibilidad');
SELECT public.fn_install_audit('reglas_comision');
SELECT public.fn_install_audit('firmas');
SELECT public.fn_install_audit('permisos_granulares');

GRANT ALL ON public.disponibilidad, public.reglas_comision, public.firmas, public.permisos_granulares TO anon, authenticated;
GRANT SELECT, INSERT ON public.email_eventos TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.email_eventos_id_seq TO anon, authenticated;

-- ------------------------------------------------------------
-- 12) Seed: reglas de comisión por ramo (defaults sensatos)
-- ------------------------------------------------------------
INSERT INTO public.reglas_comision (nombre, ramo, porcentaje, bono_fijo, prioridad)
VALUES
  ('Default Vida',     'Vida',     18, 0, 50),
  ('Default Decesos',  'Decesos',  22, 0, 50),
  ('Default Salud',    'Salud',    14, 0, 50),
  ('Default Auto',     'Auto',     10, 0, 50),
  ('Default Hogar',    'Hogar',    10, 0, 50),
  ('Default Comercio', 'Comercio', 12, 0, 50)
ON CONFLICT DO NOTHING;
