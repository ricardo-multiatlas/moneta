# Bug: botones de `/configuracion` no responden al click

Contexto técnico completo para resolver este bug recurrente con otro modelo / par de ojos frescos.

## Síntoma

En la ruta `/configuracion` (ver captura adjunta), hay 8 botones que deberían navegar a sub-rutas:

- Usuarios y equipo → `/configuracion/usuarios`
- Zonas comerciales → `/configuracion/zonas`
- Permisos granulares → `/configuracion/permisos`
- Reglas comisión → `/configuracion/reglas-comision`
- Backups y restore → `/configuracion/backup`
- Alertas vencimientos → `/configuracion/alertas`
- Integraciones aseguradoras → `/configuracion/integraciones`
- Webhooks → `/configuracion/webhooks`

**Comportamiento observado**: al hacer click en cualquiera de los 8 botones, NADA pasa. Ni la URL cambia, ni aparece spinner, ni hay error en consola visible. Pulsar repetidamente tampoco hace nada.

**Comportamiento esperado**: navegar a la sub-ruta correspondiente y ver la página con el listado/form para crear usuarios, zonas, etc.

## Stack y arquitectura

- TanStack Start (SSR) + Vite + React 19 + Tailwind 4
- TanStack Router file-based en `src/routes/`
- Supabase (Postgres + Auth) — cliente JS
- Deploy: Cloudflare Workers (`tanstack-start-app.makeflowia.workers.dev`)
- Sesión: `useAuth` con `supabase.auth.getSession` + `onAuthStateChange`
- Permisos: `usePermissions` consulta tabla `usuarios` por `auth.uid()` con fallback por email para 3 admins conocidos
- Render: cada ruta tiene un `loader: async` que pre-carga datos via `supabase.from(...)`

## Lo que funciona (control negativo)

- `/tarificador` y `/reportes` navegan bien — **no tienen `loader: async` con queries**
- `/` (dashboard) renderiza con datos — porque su loader corrió en SSR, no en cliente
- Login funciona
- Sidebar muestra menú completo (gracias al fallback de rol por email)

## Lo que falla

- `/clientes`, `/polizas`, `/vencimientos`, `/equipo`, `/configuracion/usuarios`, etc. — **todas las rutas con `loader: async` que consultan Supabase desde el cliente**

## Causa raíz que sospecho

Las queries de Supabase desde el cliente del navegador del usuario (Edge en Windows 11) se cuelgan o tardan >>15s. TanStack Router espera al loader antes de transicionar → el usuario percibe "click no funciona".

Evidencia:
- En la primera sesión de debug vi en su consola: `[Permissions] watchdog 10s — liberando loadingPerfil` (la query a `usuarios` no respondió en 10s)
- Edge Functions y SSR sí responden rápido — el problema es específico del cliente Supabase JS desde su navegador
- Otros usuarios podrían no tener el problema (no he podido testear)

## Lo que ya probé (NO repetir, NO funcionó)

1. **Watchdog 6s en `useAuth`** con flag `settled` — rompió login (`SIGNED_IN` posterior ignorado)
2. **Timeout agresivo 4s** en queries de perfil — mataba queries legítimas
3. **fetch wrapper con AbortSignal.any** — bug en merging
4. **AbortController 15s en cliente Supabase** (`src/lib/supabase.ts`) — instalado y mantiene, pero no es suficiente
5. **`defaultPendingMs: 0`** en TanStack Router — provocaba flash feo en navegaciones rápidas
6. **`defaultPendingMs: 400`** + `defaultPendingComponent` — instalado actualmente; el spinner sí aparece tras 400ms pero la query sigue colgándose y al final el usuario ve "Cargando…" eterno
7. **Service Worker auto-desinstalable** — limpiado, no era el problema
8. **Limpieza de Windows Credential Manager** — no relacionado
9. **Fallback de rol por email** — ayuda al sidebar, no a los loaders

## Pistas que NO he explorado

1. **¿Las queries de los loaders fallan por RLS?** Las helpers `es_root()`, `es_jefe_zona()` son `SECURITY DEFINER STABLE` y consultan `usuarios` internamente. La policy SELECT de `usuarios` usa `es_root()` que vuelve a consultar `usuarios`. ¿Hay recursión en evaluación? PG normalmente lo evita con SECURITY DEFINER, pero vale la pena verificarlo con `EXPLAIN ANALYZE` en SQL Editor.
2. **¿El JWT del usuario es válido?** Verificar si tiene claims correctos. Decodificar con jwt.io.
3. **¿Hay un quota/throttle de Supabase?** Su proyecto muestra `EXCEEDING USAGE LIMITS` en el dashboard. ¿Podría ser que está rate-limited?
4. **¿Funciona en otro navegador?** ¿En incógnito? ¿En otro dispositivo del mismo usuario?
5. **¿El loader podría omitirse?** Convertir loaders a `useEffect` dentro del componente — la página renderiza inmediatamente con skeleton, datos llegan después. Es invasivo (18 rutas a modificar) pero elimina la dependencia.
6. **¿TanStack Router está esperando un loader anterior?** Si el loader de `/configuracion` quedó colgado de una visita previa, podría bloquear futuras navegaciones. Reset del router con `router.invalidate()`.

## Archivos clave

- `src/router.tsx` — config del router
- `src/lib/supabase.ts` — cliente Supabase con fetch timeout 15s
- `src/hooks/use-auth.tsx` — auth state
- `src/hooks/use-permissions.tsx` — rol + fallback por email
- `src/routes/configuracion.tsx` — página con los 8 botones (líneas 131-163)
- `src/routes/configuracion.usuarios.tsx` — destino del primer botón con su `loader`
- `src/components/app/page-shell.tsx` — wrapper con spinner inicial
- `src/components/app/sidebar.tsx` — menú lateral

## Credenciales (ya pegadas en .git/config local)

- **App URL**: https://tanstack-start-app.makeflowia.workers.dev
- **Login admin**: `rubentoledano@multiatlas.net` / `moneta_seguros`
- **Supabase URL**: https://ivkjpcgkrihixrdyvdsj.supabase.co
- **Worker version actual**: `5f833bc2-5f92-4582-af7e-8d1c82aaf4c5`
- **Repo GitHub**: https://github.com/makeflowia-lab/moneta-unified-hub
- **Tag respaldo**: `monetav1-2026-05-28`

## Recomendación para el siguiente intento

**Antes de tocar código**, abrir DevTools → Network del navegador del usuario REAL, hacer click en "Usuarios y equipo", capturar lista de peticiones:

- ¿Salen peticiones a `ivkjpcgkrihixrdyvdsj.supabase.co/rest/v1/usuarios`?
- ¿Responden 200 OK con datos? ¿O quedan en "Pending"? ¿O timeout? ¿O 429?

Las 3 respuestas son bugs distintos con fixes distintos. Sin esa info estamos adivinando.

Si las peticiones nunca salen → bug en JS cliente / hidratación.
Si quedan pending → bug en Supabase o red del usuario.
Si responden 200 OK pero la UI sigue colgada → bug en cómo el componente procesa la respuesta.
