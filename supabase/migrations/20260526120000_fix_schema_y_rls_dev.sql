-- ============================================================
-- FIX: alineación de esquema con la app + RLS modo desarrollo
-- ============================================================
-- Esta migración:
--  1) Relaja RLS para todos los flujos (modo dev / sin auth)
--  2) Hace columnas obligatorias opcionales donde el frontend
--     todavía no las pide (nif_cif, concepto en facturas)
--  3) Renombra/alinea columnas que el código usaba con otro nombre
--  4) Agrega trigger que auto-crea fila en vencimientos cuando
--     se inserta una póliza
--  5) Agrega columna `estado` a clientes (la app la envía)

-- ------------------------------------------------------------
-- 1) RLS en modo desarrollo: permisivo para anon + authenticated
-- ------------------------------------------------------------
-- Borrar políticas anteriores que bloquean SELECT/INSERT sin auth
DROP POLICY IF EXISTS "Usuarios ven sus clientes o todos si son admin" ON public.clientes;
DROP POLICY IF EXISTS "Usuarios pueden insertar clientes" ON public.clientes;
DROP POLICY IF EXISTS "Usuarios ven pólizas de sus clientes o todas si admin" ON public.polizas;
DROP POLICY IF EXISTS "Usuarios pueden insertar pólizas" ON public.polizas;
DROP POLICY IF EXISTS "Usuarios ven facturas de sus clientes o todas si admin" ON public.facturas;
DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar facturas" ON public.facturas;
DROP POLICY IF EXISTS "Usuarios ven sus leads o todos si admin" ON public.leads;
DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar leads" ON public.leads;

-- Habilitar RLS en tablas que faltaban
ALTER TABLE public.vencimientos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comisiones_reportes ENABLE ROW LEVEL SECURITY;

-- Políticas DEV: full acceso para anon y authenticated
-- (en producción, sustituir por políticas reales)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clientes','polizas','vencimientos','comisiones_reportes','facturas','leads']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "dev_all_select_%s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "dev_all_insert_%s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "dev_all_update_%s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "dev_all_delete_%s" ON public.%I', t, t);

    EXECUTE format('CREATE POLICY "dev_all_select_%s" ON public.%I FOR SELECT USING (true)', t, t);
    EXECUTE format('CREATE POLICY "dev_all_insert_%s" ON public.%I FOR INSERT WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "dev_all_update_%s" ON public.%I FOR UPDATE USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "dev_all_delete_%s" ON public.%I FOR DELETE USING (true)', t, t);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 2) Clientes: nif_cif opcional, estado opcional, tipo default
-- ------------------------------------------------------------
ALTER TABLE public.clientes ALTER COLUMN nif_cif DROP NOT NULL;
ALTER TABLE public.clientes ALTER COLUMN tipo SET DEFAULT 'particular';

-- columna estado que la app envía (no estaba en el esquema)
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'Activo';

-- Aceptar Particular/Empresa además de particular/empresa
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_tipo_check;
ALTER TABLE public.clientes ADD CONSTRAINT clientes_tipo_check
  CHECK (lower(tipo) IN ('particular','empresa'));

-- ------------------------------------------------------------
-- 3) Facturas: alinear con código (importe_total, concepto opcional)
-- ------------------------------------------------------------
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

-- Aceptar estados en minúscula (lo que envía la app)
ALTER TABLE public.facturas DROP CONSTRAINT IF EXISTS facturas_estado_check;
ALTER TABLE public.facturas ADD CONSTRAINT facturas_estado_check
  CHECK (lower(estado) IN ('emitida','vencida','pagada','anulada'));

-- ------------------------------------------------------------
-- 4) Comisiones_reportes: alinear con app
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='comisiones_reportes' AND column_name='periodo')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='comisiones_reportes' AND column_name='mes_reportado') THEN
    ALTER TABLE public.comisiones_reportes RENAME COLUMN periodo TO mes_reportado;
  END IF;
END $$;
ALTER TABLE public.comisiones_reportes ALTER COLUMN mes_reportado DROP NOT NULL;
ALTER TABLE public.comisiones_reportes ALTER COLUMN mes_reportado SET DEFAULT 'Mes actual';
ALTER TABLE public.comisiones_reportes ALTER COLUMN estado SET DEFAULT 'Pendiente subir';

-- ------------------------------------------------------------
-- 5) Trigger: al insertar una póliza, crear su vencimiento
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
-- 6) Permisos GRANT explícitos para anon/authenticated
-- ------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
