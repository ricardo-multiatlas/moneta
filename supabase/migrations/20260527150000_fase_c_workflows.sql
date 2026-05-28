-- ============================================================
-- FASE C: Tablas para workflows extendidos
-- Presupuestos, liquidaciones, plantillas, campañas email
-- Workflow comisiones (estado), foto perfil + IBAN ya están en usuarios
-- ============================================================

-- ------------------------------------------------------------
-- 1) PRESUPUESTOS (Quotes)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.presupuestos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero TEXT UNIQUE,                    -- ej. PRES-2026-0001
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nombre TEXT,                   -- snapshot por si no hay cliente_id (lead aún sin convertir)
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  comercial_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ramo TEXT NOT NULL,
  aseguradora TEXT,
  prima_anual DECIMAL(10,2) NOT NULL,
  coberturas JSONB,                      -- detalle de garantías
  fecha_emision DATE DEFAULT CURRENT_DATE,
  fecha_validez DATE,                    -- típicamente +30d
  estado TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','enviado','aceptado','rechazado','expirado','convertido')),
  poliza_convertida_id UUID REFERENCES public.polizas(id) ON DELETE SET NULL,
  pdf_url TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_presupuestos_cliente ON public.presupuestos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_presupuestos_comercial ON public.presupuestos(comercial_id);
CREATE INDEX IF NOT EXISTS idx_presupuestos_estado ON public.presupuestos(estado);

-- ------------------------------------------------------------
-- 2) Comisiones: ampliar workflow
-- ------------------------------------------------------------
ALTER TABLE public.comisiones_reportes ADD COLUMN IF NOT EXISTS aprobado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL;
ALTER TABLE public.comisiones_reportes ADD COLUMN IF NOT EXISTS aprobado_at TIMESTAMPTZ;
ALTER TABLE public.comisiones_reportes ADD COLUMN IF NOT EXISTS notas TEXT;

-- Permitir más estados: añadimos 'Aprobado' y 'Liquidado'
ALTER TABLE public.comisiones_reportes DROP CONSTRAINT IF EXISTS comisiones_reportes_estado_check;
ALTER TABLE public.comisiones_reportes ADD CONSTRAINT comisiones_reportes_estado_check
  CHECK (estado IN ('Pendiente subir', 'Conciliado', 'Discrepancia', 'Reclamado', 'Aprobado', 'Liquidado', 'Rechazado'));

-- ------------------------------------------------------------
-- 3) LIQUIDACIONES MENSUALES (nómina de comerciales)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.liquidaciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comercial_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  periodo TEXT NOT NULL,                 -- ej. "2026-05"
  importe_bruto DECIMAL(10,2) NOT NULL,
  importe_neto DECIMAL(10,2),
  retencion DECIMAL(5,2),
  detalle JSONB,                          -- desglose: lista de pólizas + comisión por cada una
  estado TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','aprobada','pagada','cancelada')),
  pagada_at TIMESTAMPTZ,
  pdf_url TEXT,                           -- justificante PDF
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (comercial_id, periodo)
);
CREATE INDEX IF NOT EXISTS idx_liquidaciones_comercial ON public.liquidaciones(comercial_id);
CREATE INDEX IF NOT EXISTS idx_liquidaciones_periodo ON public.liquidaciones(periodo);

-- ------------------------------------------------------------
-- 4) PLANTILLAS DE DOCUMENTOS / CONTRATOS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plantillas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'documento'
    CHECK (tipo IN ('contrato','recordatorio','presupuesto_email','renovacion','bienvenida','otro')),
  contenido TEXT,                         -- HTML o markdown con placeholders {{cliente_nombre}}, etc.
  asunto TEXT,                            -- para emails
  variables TEXT[],                       -- lista de placeholders disponibles
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plantillas_tipo ON public.plantillas(tipo);

-- ------------------------------------------------------------
-- 5) CAMPAÑAS DE COMUNICACIÓN MASIVA (email/sms/whatsapp)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campanas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('email','sms','whatsapp')),
  plantilla_id UUID REFERENCES public.plantillas(id) ON DELETE SET NULL,
  asunto TEXT,
  contenido TEXT,
  filtro_segmento JSONB,                  -- ej. { "ramo": "auto", "zona_id": "..." }
  programada_para TIMESTAMPTZ,            -- null = enviar ahora
  estado TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','programada','enviando','enviada','fallida','cancelada')),
  total_destinatarios INTEGER DEFAULT 0,
  enviados INTEGER DEFAULT 0,
  fallidos INTEGER DEFAULT 0,
  aperturas INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  creado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  enviada_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_campanas_estado ON public.campanas(estado);

-- Detalle por destinatario (para estadísticas y retry)
CREATE TABLE IF NOT EXISTS public.campana_envios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id UUID NOT NULL REFERENCES public.campanas(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  destinatario TEXT NOT NULL,             -- email o teléfono
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','enviado','fallido','abierto','clickeado','rebotado')),
  proveedor_msg_id TEXT,                  -- ID del email/sms en Resend/Twilio
  error TEXT,
  enviado_at TIMESTAMPTZ,
  abierto_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_campana_envios_campana ON public.campana_envios(campana_id);

-- ------------------------------------------------------------
-- 6) Storage buckets para fotos de perfil y plantillas
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('fotos-perfil', 'fotos-perfil', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('plantillas-docs', 'plantillas-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Política storage abierta para fotos (son públicas) y autenticada para plantillas
DROP POLICY IF EXISTS "fotos_perfil_read" ON storage.objects;
DROP POLICY IF EXISTS "fotos_perfil_write" ON storage.objects;
CREATE POLICY "fotos_perfil_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'fotos-perfil');
CREATE POLICY "fotos_perfil_write" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'fotos-perfil');

-- ------------------------------------------------------------
-- 7) RLS dev abierto en tablas nuevas (en prod afinar por rol)
-- ------------------------------------------------------------
ALTER TABLE public.presupuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liquidaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plantillas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campana_envios ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['presupuestos','liquidaciones','plantillas','campanas','campana_envios']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_iud"    ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s_select" ON public.%I FOR SELECT USING (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_iud"    ON public.%I FOR ALL    USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- Audit triggers en tablas nuevas
SELECT public.fn_install_audit('presupuestos');
SELECT public.fn_install_audit('liquidaciones');
SELECT public.fn_install_audit('plantillas');
SELECT public.fn_install_audit('campanas');

GRANT ALL ON public.presupuestos, public.liquidaciones, public.plantillas, public.campanas, public.campana_envios TO anon, authenticated;
