-- ============================================================
-- FASE A: Roles jerárquicos + Zonas + RLS real
-- ============================================================
-- Roles soportados:
--   root         — Diego (admin total)
--   jefe_zona    — Jefe regional con su equipo de comerciales
--   comercial    — Vendedor, solo ve lo suyo
--   secretaria   — Vista operativa, sin financiero
--   (admin queda como alias deprecated)

-- ------------------------------------------------------------
-- 1) Tabla de zonas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zonas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  jefe_id UUID,  -- FK opcional; se rellena cuando se asigna jefe_zona
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------
-- 2) Ampliar tabla usuarios
-- ------------------------------------------------------------
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS zona_id UUID REFERENCES public.zonas(id) ON DELETE SET NULL;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS jefe_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS telefono TEXT;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS foto_url TEXT;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS iban_cifrado TEXT;  -- IBAN guardado tal cual (recomendable cifrar a nivel app)
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE NOT NULL;

-- Ampliar rol para aceptar nuevos valores
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('root', 'admin', 'jefe_zona', 'comercial', 'secretaria', 'backoffice'));

-- FK jefe de zona (después de añadir columna jefe_id)
ALTER TABLE public.zonas DROP CONSTRAINT IF EXISTS zonas_jefe_id_fkey;
ALTER TABLE public.zonas ADD CONSTRAINT zonas_jefe_id_fkey
  FOREIGN KEY (jefe_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 3) Helpers SQL (functions) para reusar en policies
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mi_rol() RETURNS TEXT AS $$
  SELECT rol FROM public.usuarios WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.mi_zona() RETURNS UUID AS $$
  SELECT zona_id FROM public.usuarios WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.es_root() RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT rol IN ('root','admin') FROM public.usuarios WHERE id = auth.uid()), FALSE)
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.es_secretaria() RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT rol = 'secretaria' FROM public.usuarios WHERE id = auth.uid()), FALSE)
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.es_jefe_zona() RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT rol = 'jefe_zona' FROM public.usuarios WHERE id = auth.uid()), FALSE)
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.es_comercial() RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT rol = 'comercial' FROM public.usuarios WHERE id = auth.uid()), FALSE)
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Devuelve los IDs de comerciales bajo el mando del usuario actual (incluyendo el propio si es comercial)
CREATE OR REPLACE FUNCTION public.mis_comerciales_ids() RETURNS SETOF UUID AS $$
  WITH base AS (
    SELECT u.id, u.rol, u.zona_id FROM public.usuarios u WHERE u.id = auth.uid()
  )
  SELECT u.id FROM public.usuarios u, base
  WHERE
    -- root / secretaria: todos
    base.rol IN ('root','admin','secretaria')
    -- jefe zona: comerciales de su zona
    OR (base.rol = 'jefe_zona' AND u.zona_id = base.zona_id)
    -- comercial: solo él mismo
    OR (base.rol = 'comercial' AND u.id = base.id)
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ------------------------------------------------------------
-- 4) RLS real en clientes (sustituir las dev abiertas)
-- ------------------------------------------------------------
DO $$
DECLARE p text;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='clientes' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.clientes', p);
  END LOOP;
END $$;

-- SELECT clientes
CREATE POLICY "clientes_select" ON public.clientes FOR SELECT USING (
  public.es_root()
  OR public.es_secretaria()
  OR (public.es_jefe_zona() AND comercial_asignado_id IN (SELECT public.mis_comerciales_ids()))
  OR (public.es_comercial() AND comercial_asignado_id = auth.uid())
  -- Fallback dev: si no hay sesión, permite (modo demo). Eliminar en prod estricta.
  OR auth.uid() IS NULL
);

-- INSERT clientes
CREATE POLICY "clientes_insert" ON public.clientes FOR INSERT WITH CHECK (
  public.es_root()
  OR public.es_secretaria()
  OR public.es_jefe_zona()
  -- Comerciales solo pueden crear clientes asignados a sí mismos (o sin asignar)
  OR (public.es_comercial() AND (comercial_asignado_id = auth.uid() OR comercial_asignado_id IS NULL))
  OR auth.uid() IS NULL
);

-- UPDATE clientes
CREATE POLICY "clientes_update" ON public.clientes FOR UPDATE USING (
  public.es_root()
  OR public.es_secretaria()
  OR (public.es_jefe_zona() AND comercial_asignado_id IN (SELECT public.mis_comerciales_ids()))
  OR (public.es_comercial() AND comercial_asignado_id = auth.uid())
  OR auth.uid() IS NULL
);

-- DELETE clientes — solo root
CREATE POLICY "clientes_delete" ON public.clientes FOR DELETE USING (
  public.es_root() OR auth.uid() IS NULL
);

-- ------------------------------------------------------------
-- 5) RLS en polizas (delegan a la regla de su cliente)
-- ------------------------------------------------------------
DO $$
DECLARE p text;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='polizas' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.polizas', p);
  END LOOP;
END $$;

CREATE POLICY "polizas_select" ON public.polizas FOR SELECT USING (
  public.es_root()
  OR public.es_secretaria()
  OR EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = cliente_id AND (
       (public.es_jefe_zona() AND c.comercial_asignado_id IN (SELECT public.mis_comerciales_ids()))
       OR (public.es_comercial() AND c.comercial_asignado_id = auth.uid())
     ))
  OR auth.uid() IS NULL
);

CREATE POLICY "polizas_insert" ON public.polizas FOR INSERT WITH CHECK (
  public.es_root()
  OR public.es_secretaria()
  OR public.es_jefe_zona()
  OR public.es_comercial()
  OR auth.uid() IS NULL
);

CREATE POLICY "polizas_update" ON public.polizas FOR UPDATE USING (
  public.es_root()
  OR public.es_secretaria()
  OR EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = cliente_id AND (
       (public.es_jefe_zona() AND c.comercial_asignado_id IN (SELECT public.mis_comerciales_ids()))
       OR (public.es_comercial() AND c.comercial_asignado_id = auth.uid())
     ))
  OR auth.uid() IS NULL
);

CREATE POLICY "polizas_delete" ON public.polizas FOR DELETE USING (
  public.es_root() OR auth.uid() IS NULL
);

-- ------------------------------------------------------------
-- 6) RLS facturas — secretaria NO VE financiero
-- ------------------------------------------------------------
DO $$
DECLARE p text;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='facturas' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.facturas', p);
  END LOOP;
END $$;

CREATE POLICY "facturas_select" ON public.facturas FOR SELECT USING (
  public.es_root()
  OR EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = cliente_id AND (
       (public.es_jefe_zona() AND c.comercial_asignado_id IN (SELECT public.mis_comerciales_ids()))
       OR (public.es_comercial() AND c.comercial_asignado_id = auth.uid())
     ))
  OR auth.uid() IS NULL
);
CREATE POLICY "facturas_insert" ON public.facturas FOR INSERT WITH CHECK (
  public.es_root() OR public.es_jefe_zona() OR public.es_comercial() OR auth.uid() IS NULL
);
CREATE POLICY "facturas_update" ON public.facturas FOR UPDATE USING (
  public.es_root() OR public.es_jefe_zona() OR auth.uid() IS NULL
);
CREATE POLICY "facturas_delete" ON public.facturas FOR DELETE USING (
  public.es_root() OR auth.uid() IS NULL
);

-- ------------------------------------------------------------
-- 7) RLS comisiones_reportes — solo ROOT modifica
-- ------------------------------------------------------------
DO $$
DECLARE p text;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='comisiones_reportes' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.comisiones_reportes', p);
  END LOOP;
END $$;

CREATE POLICY "comisiones_reportes_select" ON public.comisiones_reportes FOR SELECT USING (
  public.es_root() OR public.es_jefe_zona() OR public.es_comercial() OR auth.uid() IS NULL
);
CREATE POLICY "comisiones_reportes_insert" ON public.comisiones_reportes FOR INSERT WITH CHECK (
  public.es_root() OR auth.uid() IS NULL
);
CREATE POLICY "comisiones_reportes_update" ON public.comisiones_reportes FOR UPDATE USING (
  public.es_root() OR auth.uid() IS NULL
);
CREATE POLICY "comisiones_reportes_delete" ON public.comisiones_reportes FOR DELETE USING (
  public.es_root() OR auth.uid() IS NULL
);

-- ------------------------------------------------------------
-- 8) RLS leads (parecido a clientes)
-- ------------------------------------------------------------
DO $$
DECLARE p text;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='leads' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.leads', p);
  END LOOP;
END $$;

CREATE POLICY "leads_select" ON public.leads FOR SELECT USING (
  public.es_root()
  OR public.es_secretaria()
  OR (public.es_jefe_zona() AND comercial_asignado_id IN (SELECT public.mis_comerciales_ids()))
  OR (public.es_comercial() AND comercial_asignado_id = auth.uid())
  OR auth.uid() IS NULL
);
CREATE POLICY "leads_insert" ON public.leads FOR INSERT WITH CHECK (
  public.es_root() OR public.es_secretaria() OR public.es_jefe_zona() OR public.es_comercial() OR auth.uid() IS NULL
);
CREATE POLICY "leads_update" ON public.leads FOR UPDATE USING (
  public.es_root() OR public.es_secretaria()
  OR (public.es_jefe_zona() AND comercial_asignado_id IN (SELECT public.mis_comerciales_ids()))
  OR (public.es_comercial() AND comercial_asignado_id = auth.uid())
  OR auth.uid() IS NULL
);
CREATE POLICY "leads_delete" ON public.leads FOR DELETE USING (
  public.es_root() OR auth.uid() IS NULL
);

-- ------------------------------------------------------------
-- 9) Vencimientos — heredan póliza (los policies de polizas ya filtran)
--    Mantenemos abiertos a select porque siempre se consultan junto a póliza
-- ------------------------------------------------------------
DO $$
DECLARE p text;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='vencimientos' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.vencimientos', p);
  END LOOP;
END $$;
CREATE POLICY "vencimientos_select" ON public.vencimientos FOR SELECT USING (
  public.es_root() OR public.es_secretaria()
  OR EXISTS (SELECT 1 FROM public.polizas p JOIN public.clientes c ON c.id = p.cliente_id WHERE p.id = poliza_id AND (
       (public.es_jefe_zona() AND c.comercial_asignado_id IN (SELECT public.mis_comerciales_ids()))
       OR (public.es_comercial() AND c.comercial_asignado_id = auth.uid())
     ))
  OR auth.uid() IS NULL
);
CREATE POLICY "vencimientos_iud" ON public.vencimientos FOR ALL USING (
  public.es_root() OR public.es_secretaria() OR public.es_jefe_zona() OR public.es_comercial() OR auth.uid() IS NULL
) WITH CHECK (
  public.es_root() OR public.es_secretaria() OR public.es_jefe_zona() OR public.es_comercial() OR auth.uid() IS NULL
);

-- ------------------------------------------------------------
-- 10) usuarios: ver según rol; solo root crea/modifica
-- ------------------------------------------------------------
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE p text;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='usuarios' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.usuarios', p);
  END LOOP;
END $$;
CREATE POLICY "usuarios_select" ON public.usuarios FOR SELECT USING (
  public.es_root() OR public.es_secretaria() OR public.es_jefe_zona()
  OR id = auth.uid()
  OR auth.uid() IS NULL
);
CREATE POLICY "usuarios_insert" ON public.usuarios FOR INSERT WITH CHECK (
  public.es_root() OR auth.uid() IS NULL
);
CREATE POLICY "usuarios_update" ON public.usuarios FOR UPDATE USING (
  public.es_root() OR id = auth.uid() OR auth.uid() IS NULL
);
CREATE POLICY "usuarios_delete" ON public.usuarios FOR DELETE USING (
  public.es_root() OR auth.uid() IS NULL
);

-- ------------------------------------------------------------
-- 11) Zonas — RLS
-- ------------------------------------------------------------
ALTER TABLE public.zonas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "zonas_select" ON public.zonas;
DROP POLICY IF EXISTS "zonas_iud" ON public.zonas;
CREATE POLICY "zonas_select" ON public.zonas FOR SELECT USING (TRUE);
CREATE POLICY "zonas_iud" ON public.zonas FOR ALL USING (
  public.es_root() OR auth.uid() IS NULL
) WITH CHECK (
  public.es_root() OR auth.uid() IS NULL
);

-- Audit trigger
SELECT public.fn_install_audit('zonas');

-- ------------------------------------------------------------
-- 12) Promover usuario semilla (makeflowia@gmail.com) a ROOT si existe
-- ------------------------------------------------------------
UPDATE public.usuarios SET rol = 'root' WHERE email = 'makeflowia@gmail.com';
UPDATE public.usuarios SET rol = 'root' WHERE email = 'rubentoledano@multiatlas.net';

GRANT ALL ON public.zonas TO anon, authenticated;
