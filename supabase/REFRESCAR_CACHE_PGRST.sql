-- ============================================================
-- Refrescar caché de esquema de PostgREST
-- ============================================================
-- Tras crear tablas nuevas (dashboard_widgets, reportes_personalizados),
-- PostgREST puede tardar en verlas porque cachea el esquema.
-- Esto fuerza un reload inmediato.
-- Solo hace falta ejecutarlo si la app dice:
--   "Could not find the table 'public.X' in the schema cache"

NOTIFY pgrst, 'reload schema';

-- También refresca los permisos por si acaso
NOTIFY pgrst, 'reload config';

-- Verificación: las dos tablas deberían existir
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('dashboard_widgets', 'reportes_personalizados');
-- Deberías ver 2 filas. Si ves 0, el v6 SQL no se aplicó completo.
