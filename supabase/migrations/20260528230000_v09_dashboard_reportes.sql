-- ============================================================
-- v0.9: Dashboard customizable + Constructor visual de reportes
-- - Tabla dashboard_widgets (layout por usuario)
-- - Tabla reportes_personalizados (definiciones guardadas)
-- - RLS: cada usuario ve/edita solo lo suyo (root puede ver/editar todo)
-- - Helper fn_set_dashboard_default para nuevos usuarios
-- ============================================================

-- ------------------------------------------------------------
-- 1) Dashboard widgets por usuario
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  widget_type TEXT NOT NULL,             -- 'kpi_polizas', 'kpi_vencimientos', 'top_clientes', 'leads_semana', 'criticos', 'accesos_rapidos', 'comisiones_mes', 'tendencia_ventas', 'ranking_aseguradoras', 'mis_clientes'
  position INTEGER NOT NULL DEFAULT 0,   -- orden en la grilla
  size TEXT NOT NULL DEFAULT 'medium' CHECK (size IN ('small','medium','large','full')),
  config JSONB DEFAULT '{}'::jsonb,      -- parámetros extra: limite, filtros, etc.
  visible BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_user ON public.dashboard_widgets(user_id, position);

ALTER TABLE public.dashboard_widgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dashboard_widgets_select ON public.dashboard_widgets;
CREATE POLICY dashboard_widgets_select ON public.dashboard_widgets FOR SELECT USING (
  user_id = auth.uid() OR public.es_root()
);

DROP POLICY IF EXISTS dashboard_widgets_insert ON public.dashboard_widgets;
CREATE POLICY dashboard_widgets_insert ON public.dashboard_widgets FOR INSERT WITH CHECK (
  user_id = auth.uid() OR public.es_root()
);

DROP POLICY IF EXISTS dashboard_widgets_update ON public.dashboard_widgets;
CREATE POLICY dashboard_widgets_update ON public.dashboard_widgets FOR UPDATE USING (
  user_id = auth.uid() OR public.es_root()
);

DROP POLICY IF EXISTS dashboard_widgets_delete ON public.dashboard_widgets;
CREATE POLICY dashboard_widgets_delete ON public.dashboard_widgets FOR DELETE USING (
  user_id = auth.uid() OR public.es_root()
);

-- ------------------------------------------------------------
-- 2) Reportes personalizados (constructor visual)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reportes_personalizados (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  entidad TEXT NOT NULL CHECK (entidad IN (
    'polizas','clientes','vencimientos','leads','comisiones',
    'presupuestos','facturas','liquidaciones','siniestros','comunicaciones'
  )),
  columnas TEXT[] NOT NULL,              -- ['numero_poliza','ramo','prima_anual', ...]
  filtros JSONB DEFAULT '[]'::jsonb,     -- [{ campo, operador, valor }]
  orden JSONB DEFAULT '[]'::jsonb,       -- [{ campo, direccion }]
  compartido BOOLEAN DEFAULT FALSE NOT NULL, -- si es false solo lo ve el creador
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  ultima_ejecucion TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_reportes_user ON public.reportes_personalizados(user_id);
CREATE INDEX IF NOT EXISTS idx_reportes_compartido ON public.reportes_personalizados(compartido) WHERE compartido = TRUE;

ALTER TABLE public.reportes_personalizados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reportes_select ON public.reportes_personalizados;
CREATE POLICY reportes_select ON public.reportes_personalizados FOR SELECT USING (
  user_id = auth.uid() OR compartido = TRUE OR public.es_root()
);

DROP POLICY IF EXISTS reportes_insert ON public.reportes_personalizados;
CREATE POLICY reportes_insert ON public.reportes_personalizados FOR INSERT WITH CHECK (
  user_id = auth.uid()
);

DROP POLICY IF EXISTS reportes_update ON public.reportes_personalizados;
CREATE POLICY reportes_update ON public.reportes_personalizados FOR UPDATE USING (
  user_id = auth.uid() OR public.es_root()
);

DROP POLICY IF EXISTS reportes_delete ON public.reportes_personalizados;
CREATE POLICY reportes_delete ON public.reportes_personalizados FOR DELETE USING (
  user_id = auth.uid() OR public.es_root()
);

-- ------------------------------------------------------------
-- 3) Trigger updated_at en ambas tablas
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_dashboard_widgets_updated ON public.dashboard_widgets;
CREATE TRIGGER trg_dashboard_widgets_updated
  BEFORE UPDATE ON public.dashboard_widgets
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_reportes_updated ON public.reportes_personalizados;
CREATE TRIGGER trg_reportes_updated
  BEFORE UPDATE ON public.reportes_personalizados
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ------------------------------------------------------------
-- 4) Audit en ambas (append-only, IP via app.audit_*)
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_dashboard_widgets ON public.dashboard_widgets;
CREATE TRIGGER trg_audit_dashboard_widgets
  AFTER INSERT OR UPDATE OR DELETE ON public.dashboard_widgets
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_reportes ON public.reportes_personalizados;
CREATE TRIGGER trg_audit_reportes
  AFTER INSERT OR UPDATE OR DELETE ON public.reportes_personalizados
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
