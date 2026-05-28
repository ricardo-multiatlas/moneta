-- ============================================================
-- v0.8.1 — Fix audit con IP/user-agent
-- set_config(..., true) solo vive en una transacción. El INSERT
-- siguiente desde el cliente va en OTRA transacción y pierde las
-- variables. Solución: una RPC PL/pgSQL que haga AMBAS cosas en
-- una sola transacción atómica.
-- ============================================================

CREATE OR REPLACE FUNCTION public.audit_perform(
  p_action TEXT,         -- 'insert' | 'update' | 'delete'
  p_table  TEXT,         -- nombre de tabla
  p_row    JSONB,        -- datos a insertar/actualizar (null para delete)
  p_match  JSONB,        -- {"id": "uuid"} para update/delete
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
  -- 1. Setear variables de sesión EN ESTA MISMA TRANSACCIÓN
  PERFORM set_config('app.audit_ip', COALESCE(p_ip, ''), true);
  PERFORM set_config('app.audit_ua', COALESCE(p_ua, ''), true);

  -- 2. Construir y ejecutar la mutación según action
  IF p_action = 'insert' THEN
    v_sql := format(
      'INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1) RETURNING to_jsonb(public.%I.*)',
      p_table, p_table, p_table
    );
    EXECUTE v_sql USING p_row INTO v_result;
    RETURN v_result;

  ELSIF p_action = 'update' OR p_action = 'delete' THEN
    -- Construir WHERE desde p_match
    FOR v_key, v_val IN SELECT * FROM jsonb_each_text(p_match) LOOP
      IF v_first THEN v_first := FALSE; ELSE v_where := v_where || ' AND '; END IF;
      v_where := v_where || quote_ident(v_key) || ' = ' || quote_literal(v_val);
    END LOOP;
    IF v_where = '' THEN
      RAISE EXCEPTION 'p_match no puede estar vacío para %', p_action;
    END IF;

    IF p_action = 'update' THEN
      v_sql := format(
        'UPDATE public.%I SET (%s) = (SELECT * FROM jsonb_populate_record(NULL::public.%I, $1)) WHERE %s RETURNING to_jsonb(public.%I.*)',
        p_table,
        -- columnas a actualizar = keys de p_row
        (SELECT string_agg(quote_ident(k), ', ') FROM jsonb_object_keys(p_row) k),
        p_table,
        v_where,
        p_table
      );
      -- Versión más simple: hacer UPDATE genérico con jsonb_each
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
