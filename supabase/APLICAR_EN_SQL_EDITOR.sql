-- ============================================================
-- APLICAR EN: Supabase Dashboard → SQL Editor → New Query → Pegar y Run
-- Proyecto: ivkjpcgkrihixrdyvdsj
-- ============================================================
-- Este archivo es 100% idempotente: se puede ejecutar varias veces
-- sin romper nada. Crea todas las tablas, índices, trigger de
-- vencimientos automáticos y políticas RLS modo desarrollo.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- TABLAS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.usuarios (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('admin', 'comercial', 'backoffice')),
    oficina TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipo TEXT NOT NULL DEFAULT 'particular',
    nombre_razon_social TEXT NOT NULL,
    nif_cif TEXT,
    email TEXT,
    telefono TEXT,
    direccion JSONB,
    estado TEXT DEFAULT 'Activo',
    comercial_asignado_id UUID REFERENCES public.usuarios(id),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Asegurar que columnas que se añadieron luego existan
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'Activo';
ALTER TABLE public.clientes ALTER COLUMN nif_cif DROP NOT NULL;
ALTER TABLE public.clientes ALTER COLUMN tipo SET DEFAULT 'particular';
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_tipo_check;
ALTER TABLE public.clientes ADD CONSTRAINT clientes_tipo_check
  CHECK (lower(tipo) IN ('particular','empresa'));

CREATE TABLE IF NOT EXISTS public.polizas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    numero_poliza TEXT NOT NULL,
    aseguradora TEXT NOT NULL,
    ramo TEXT NOT NULL,
    fecha_emision DATE,
    fecha_inicio DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    prima_anual DECIMAL(10,2) NOT NULL,
    comision_porcentaje DECIMAL(5,2),
    comision_importe DECIMAL(10,2),
    estado TEXT NOT NULL CHECK (estado IN ('activa', 'cancelada', 'renovada')),
    pdf_url TEXT,
    datos_extraidos JSONB,
    comercial_id UUID REFERENCES public.usuarios(id),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.vencimientos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    poliza_id UUID NOT NULL REFERENCES public.polizas(id) ON DELETE CASCADE,
    fecha_vencimiento DATE NOT NULL,
    estado TEXT NOT NULL CHECK (estado IN ('pendiente', 'avisado', 'renovado')),
    dias_aviso INTEGER DEFAULT 60,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.comisiones_reportes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aseguradora TEXT NOT NULL,
    mes_reportado TEXT DEFAULT 'Mes actual',
    polizas_count INTEGER DEFAULT 0,
    importe_calculado DECIMAL(10,2) DEFAULT 0,
    importe_declarado DECIMAL(10,2) DEFAULT 0,
    diferencia DECIMAL(10,2) DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'Pendiente subir'
        CHECK (estado IN ('Pendiente subir', 'Conciliado', 'Discrepancia', 'Reclamado')),
    pdf_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Si existía la columna `periodo`, renombrarla a mes_reportado
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='comisiones_reportes' AND column_name='periodo') THEN
    ALTER TABLE public.comisiones_reportes RENAME COLUMN periodo TO mes_reportado;
  END IF;
END $$;
ALTER TABLE public.comisiones_reportes ALTER COLUMN mes_reportado DROP NOT NULL;
ALTER TABLE public.comisiones_reportes ALTER COLUMN mes_reportado SET DEFAULT 'Mes actual';

CREATE TABLE IF NOT EXISTS public.facturas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero_factura TEXT UNIQUE NOT NULL,
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    poliza_id UUID REFERENCES public.polizas(id) ON DELETE SET NULL,
    concepto TEXT DEFAULT 'Factura general',
    fecha_emision DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    importe_total DECIMAL(10,2) NOT NULL,
    estado TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Si existía la columna `importe` legacy, renombrarla
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='facturas' AND column_name='importe')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='facturas' AND column_name='importe_total') THEN
    ALTER TABLE public.facturas RENAME COLUMN importe TO importe_total;
  END IF;
END $$;
ALTER TABLE public.facturas ALTER COLUMN concepto DROP NOT NULL;
ALTER TABLE public.facturas ALTER COLUMN concepto SET DEFAULT 'Factura general';
ALTER TABLE public.facturas DROP CONSTRAINT IF EXISTS facturas_estado_check;
ALTER TABLE public.facturas ADD CONSTRAINT facturas_estado_check
  CHECK (lower(estado) IN ('emitida','vencida','pagada','anulada'));

CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre TEXT NOT NULL,
    origen TEXT NOT NULL,
    interes TEXT NOT NULL,
    comercial_asignado_id UUID REFERENCES public.usuarios(id),
    valor_estimado DECIMAL(10,2) DEFAULT 0,
    fecha_contacto DATE,
    estado TEXT NOT NULL CHECK (estado IN ('Nuevo', 'Cualificado', 'Propuesta', 'Negociación', 'Ganado', 'Perdido')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------
-- TRIGGER: auto-crear vencimiento al insertar póliza
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_crear_vencimiento()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.vencimientos (poliza_id, fecha_vencimiento, estado, dias_aviso)
  VALUES (NEW.id, NEW.fecha_vencimiento, 'pendiente', 60);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crear_vencimiento ON public.polizas;
CREATE TRIGGER trg_crear_vencimiento
  AFTER INSERT ON public.polizas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_crear_vencimiento();

-- Backfill: crear vencimientos para pólizas ya existentes sin él
INSERT INTO public.vencimientos (poliza_id, fecha_vencimiento, estado, dias_aviso)
SELECT p.id, p.fecha_vencimiento, 'pendiente', 60
FROM public.polizas p
LEFT JOIN public.vencimientos v ON v.poliza_id = p.id
WHERE v.id IS NULL;

-- ------------------------------------------------------------
-- RLS modo DESARROLLO: acceso total para anon + authenticated
-- (en producción, sustituir por políticas reales basadas en auth.uid())
-- ------------------------------------------------------------
ALTER TABLE public.usuarios            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polizas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vencimientos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comisiones_reportes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facturas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads               ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas viejas restrictivas
DO $$
DECLARE t text; p text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clientes','polizas','vencimientos','comisiones_reportes','facturas','leads','usuarios']
  LOOP
    FOR p IN
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename=t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p, t);
    END LOOP;

    EXECUTE format('CREATE POLICY "dev_select_%s"  ON public.%I FOR SELECT USING (true)', t, t);
    EXECUTE format('CREATE POLICY "dev_insert_%s"  ON public.%I FOR INSERT WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "dev_update_%s"  ON public.%I FOR UPDATE USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "dev_delete_%s"  ON public.%I FOR DELETE USING (true)', t, t);
  END LOOP;
END $$;

-- GRANTs explícitos
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
