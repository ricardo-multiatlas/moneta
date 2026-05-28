-- ============================================================
-- v0.9 — Dashboard customizable + Constructor visual de reportes
-- + (incluye también el audit_perform RPC pendiente del v5)
-- Idempotente: se puede ejecutar varias veces sin romper nada.
-- ============================================================

-- ------------------------------------------------------------
-- PARTE 1: audit_perform RPC (del v5 pendiente)
-- set_config(..., true) solo vive en una transacción. Necesitamos
-- una RPC que haga set_config + mutación en la MISMA transacción.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_perform(
  p_action TEXT,
  p_table  TEXT,
  p_row    JSONB,
  p_match  JSONB,
  p_ip     TEXT,
  p_ua     TEXT
) RETURNS JSONB AS $$
DECLARE
  v_sql TEXT;
  v_where TEXT := '';
  v_result JSONB;
  v_key TEXT;
  v_val TEXT;
  v_first BOOLEAN := TRUE;
BEGIN
  PERFORM set_config('app.audit_ip', COALESCE(p_ip, ''), true);
  PERFORM set_config('app.audit_ua', COALESCE(p_ua, ''), true);

  IF p_action = 'insert' THEN
    v_sql := format(
      'INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1) RETURNING to_jsonb(public.%I.*)',
      p_table, p_table, p_table
    );
    EXECUTE v_sql USING p_row INTO v_result;
    RETURN v_result;

  ELSIF p_action = 'update' OR p_action = 'delete' THEN
    FOR v_key, v_val IN SELECT * FROM jsonb_each_text(p_match) LOOP
      IF v_first THEN v_first := FALSE; ELSE v_where := v_where || ' AND '; END IF;
      v_where := v_where || quote_ident(v_key) || ' = ' || quote_literal(v_val);
    END LOOP;
    IF v_where = '' THEN
      RAISE EXCEPTION 'p_match no puede estar vacío para %', p_action;
    END IF;

    IF p_action = 'update' THEN
      v_sql := 'UPDATE public.' || quote_ident(p_table) || ' SET ';
      v_first := TRUE;
      FOR v_key, v_val IN SELECT * FROM jsonb_each_text(p_row) LOOP
        IF v_first THEN v_first := FALSE; ELSE v_sql := v_sql || ', '; END IF;
        IF v_val IS NULL THEN
          v_sql := v_sql || quote_ident(v_key) || ' = NULL';
        ELSE
          v_sql := v_sql || quote_ident(v_key) || ' = ' || quote_literal(v_val);
        END IF;
      END LOOP;
      v_sql := v_sql || ' WHERE ' || v_where || ' RETURNING to_jsonb(' || quote_ident(p_table) || '.*)';
      EXECUTE v_sql INTO v_result;
      RETURN v_result;
    ELSE
      v_sql := format('DELETE FROM public.%I WHERE %s', p_table, v_where);
      EXECUTE v_sql;
      RETURN jsonb_build_object('deleted', true);
    END IF;

  ELSE
    RAISE EXCEPTION 'action inválido: %', p_action;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.audit_perform(TEXT, TEXT, JSONB, JSONB, TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------
-- PARTE 2: dashboard_widgets (layout por usuario)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  widget_type TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  size TEXT NOT NULL DEFAULT 'medium' CHECK (size IN ('small','medium','large','full')),
  config JSONB DEFAULT '{}'::jsonb,
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
-- PARTE 3: reportes_personalizados (constructor visual)
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
  columnas TEXT[] NOT NULL,
  filtros JSONB DEFAULT '[]'::jsonb,
  orden JSONB DEFAULT '[]'::jsonb,
  compartido BOOLEAN DEFAULT FALSE NOT NULL,
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
-- PARTE 4: triggers updated_at + audit
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_dashboard_widgets_updated ON public.dashboard_widgets;
CREATE TRIGGER trg_dashboard_widgets_updated
  BEFORE UPDATE ON public.dashboard_widgets
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_reportes_updated ON public.reportes_personalizados;
CREATE TRIGGER trg_reportes_updated
  BEFORE UPDATE ON public.reportes_personalizados
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_dashboard_widgets ON public.dashboard_widgets;
CREATE TRIGGER trg_audit_dashboard_widgets
  AFTER INSERT OR UPDATE OR DELETE ON public.dashboard_widgets
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_reportes ON public.reportes_personalizados;
CREATE TRIGGER trg_audit_reportes
  AFTER INSERT OR UPDATE OR DELETE ON public.reportes_personalizados
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
