-- ============================================================
-- v0.11: Conciliacion bancaria semi-automatica (Norma 43 / CSB-43)
-- - Tabla movimientos_n43 (movimientos importados del extracto)
-- - Tabla movimientos_n43_match (match propuesto / confirmado contra recibos)
-- ============================================================

-- Idempotencia
DROP TABLE IF EXISTS public.movimientos_n43_match CASCADE;
DROP TABLE IF EXISTS public.movimientos_n43 CASCADE;

-- ------------------------------------------------------------
-- 1) movimientos_n43
-- ------------------------------------------------------------
CREATE TABLE public.movimientos_n43 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL,
  hash_idem TEXT UNIQUE NOT NULL,
  fecha_operacion DATE NOT NULL,
  fecha_valor DATE NOT NULL,
  signo TEXT NOT NULL CHECK (signo IN ('D','H')),
  importe NUMERIC(12,2) NOT NULL,
  codigo_comun INT,
  concepto TEXT,
  referencia1 TEXT,
  referencia2 TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movn43_fecha_operacion ON public.movimientos_n43(fecha_operacion);
CREATE INDEX IF NOT EXISTS idx_movn43_hash_idem       ON public.movimientos_n43(hash_idem);
CREATE INDEX IF NOT EXISTS idx_movn43_import          ON public.movimientos_n43(import_id);

ALTER TABLE public.movimientos_n43 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS movn43_select ON public.movimientos_n43;
CREATE POLICY movn43_select ON public.movimientos_n43 FOR SELECT USING (
  public.es_root() OR public.es_jefe_zona() OR auth.uid() IS NULL
);

DROP POLICY IF EXISTS movn43_insert ON public.movimientos_n43;
CREATE POLICY movn43_insert ON public.movimientos_n43 FOR INSERT WITH CHECK (
  public.es_root() OR public.es_jefe_zona() OR auth.uid() IS NULL
);

DROP POLICY IF EXISTS movn43_update ON public.movimientos_n43;
CREATE POLICY movn43_update ON public.movimientos_n43 FOR UPDATE USING (
  public.es_root() OR public.es_jefe_zona() OR auth.uid() IS NULL
) WITH CHECK (
  public.es_root() OR public.es_jefe_zona() OR auth.uid() IS NULL
);

GRANT ALL ON public.movimientos_n43 TO anon, authenticated;

-- Audit trigger (usa fn_install_audit definida en 20260526130000)
SELECT public.fn_install_audit('movimientos_n43');

-- ------------------------------------------------------------
-- 2) movimientos_n43_match
-- ------------------------------------------------------------
CREATE TABLE public.movimientos_n43_match (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movimiento_id UUID NOT NULL REFERENCES public.movimientos_n43(id) ON DELETE CASCADE,
  recibo_id UUID NOT NULL REFERENCES public.recibos(id) ON DELETE CASCADE,
  score INT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'propuesto'
    CHECK (estado IN ('propuesto','confirmado','rechazado')),
  confirmado_por UUID REFERENCES public.usuarios(id),
  confirmado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (movimiento_id, recibo_id)
);

CREATE INDEX IF NOT EXISTS idx_movn43match_estado    ON public.movimientos_n43_match(estado);
CREATE INDEX IF NOT EXISTS idx_movn43match_recibo    ON public.movimientos_n43_match(recibo_id);
CREATE INDEX IF NOT EXISTS idx_movn43match_movim     ON public.movimientos_n43_match(movimiento_id);

ALTER TABLE public.movimientos_n43_match ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS movn43match_select ON public.movimientos_n43_match;
CREATE POLICY movn43match_select ON public.movimientos_n43_match FOR SELECT USING (
  public.es_root() OR public.es_jefe_zona() OR auth.uid() IS NULL
);

DROP POLICY IF EXISTS movn43match_insert ON public.movimientos_n43_match;
CREATE POLICY movn43match_insert ON public.movimientos_n43_match FOR INSERT WITH CHECK (
  public.es_root() OR public.es_jefe_zona() OR auth.uid() IS NULL
);

DROP POLICY IF EXISTS movn43match_update ON public.movimientos_n43_match;
CREATE POLICY movn43match_update ON public.movimientos_n43_match FOR UPDATE USING (
  public.es_root() OR public.es_jefe_zona() OR auth.uid() IS NULL
) WITH CHECK (
  public.es_root() OR public.es_jefe_zona() OR auth.uid() IS NULL
);

GRANT ALL ON public.movimientos_n43_match TO anon, authenticated;

-- Audit trigger
SELECT public.fn_install_audit('movimientos_n43_match');
