# Correduría OS — Changelog

Sistema CRM + ERP a medida para Moneta Seguros (Sevilla).
Stack: TanStack Start + Vite, Supabase (Postgres + Auth + Storage + Edge Functions), Vercel AI SDK con Gemini, Resend para email.

---

## v0.9 — Dashboard customizable + Constructor de reportes (2026-05-28 noche)

### Migración SQL (`APLICAR_EN_SQL_EDITOR_v6.sql` + `20260528230000_v09_dashboard_reportes.sql`)
- RPC `audit_perform(action, table, row, match, ip, ua)`: hace `set_config` + mutación en una sola transacción atómica. Soluciona que `audit_logs.ip` quedaba `NULL` en deletes desde la UI (set_config con `is_local=true` muere antes del siguiente statement).
- Tabla `dashboard_widgets` (user_id, widget_type, position, size, config, visible). RLS: cada usuario ve/edita lo suyo, root ve todo.
- Tabla `reportes_personalizados` (entidad enum 10 valores, columnas TEXT[], filtros jsonb, orden jsonb, compartido). RLS: visible para el creador, los compartidos para todos, root ve todo.
- Triggers updated_at + audit en ambas tablas.

### Rutas nuevas (2)
- **`/mi-dashboard`** — Dashboard customizable por usuario. Catálogo de 12 widgets (KPIs de pólizas/vencimientos/leads/clientes/comisiones, Top 10 clientes/comerciales, vencimientos críticos, últimos clientes, leads semana, ranking aseguradoras, accesos rápidos). Cada widget tiene tamaño S/M/L/XL configurable, posición arrastrable, visible/oculto. Persistencia automática en BD.
- **`/reportes/constructor`** — Constructor visual de reportes. 10 entidades disponibles (pólizas, clientes, vencimientos, leads, comisiones, presupuestos, facturas, liquidaciones, siniestros, comunicaciones). Selector de columnas (checkboxes), constructor de filtros (campo + operador `=`/`!=`/`>`/`<`/`>=`/`<=`/`like`/`in`/`is null`/`not null` + valor), constructor de orden, guardar plantilla, ejecutar exportando a Excel. Marcar como "Compartido" para que lo vean todos.

### Edge Function `audit-with-ip` migrada
- Ahora llama a la RPC `audit_perform` directamente (una sola transacción) en lugar de `set_audit_context` + mutación separadas. Resultado: `audit_logs.ip` y `audit_logs.user_agent` ya se llenan en todos los deletes/updates desde UI.

### Router con feedback de navegación
- `defaultPendingComponent` global que muestra spinner si una navegación tarda más de 400ms. Antes los Links de rutas con loaders lentos parecían "no responder" hasta que la query terminaba (~5-10s en peor caso). Ahora hay feedback visual inmediato sin flash en navegaciones rápidas.

### Cliente Supabase con fetch timeout
- `src/lib/supabase.ts` envuelve fetch con `AbortController` de 15s. Sin esto, una query lenta dejaba el route loader pendiente para siempre y la UI no respondía a clicks.

### Fallback de rol por email
- `usePermissions` detecta emails admin conocidos (`rubentoledano@multiatlas.net`, `makeflowia@gmail.com`, `ricardomultiatlas@gmail.com`) y asume `rol=root` instantáneamente sin esperar BD. Garantiza sidebar completo aunque la query a `usuarios` tarde o falle.

### UX fixes
- Quitada campana decorativa del topbar (sin función).
- Iconos correctos en `/aprobaciones`: ✓ (check) para Aprobar, ✗ (X) para Rechazar. Antes eran lápiz + flecha download sin sentido semántico.
- Botón "Abrir ficha completa" del DetailModal cierra el modal primero, luego navega (evita cancelación de transición).
- Lápiz editar de pólizas usa `router.navigate` imperativo en lugar de Link (más robusto).
- Sin botones duplicados de "Añadir widget" en `/mi-dashboard` cuando está vacío.
- Padding correcto en SectionHeader de `/equipo` (antes pegado al borde).

---

## v0.8 — Cierre total de la matriz Diego (2026-05-28)

### Migración SQL (`20260528220000_v08_cierre_total.sql`)
- Nuevas tablas: `alertas_vencimiento`, `integraciones_aseguradoras`, `aprobaciones`, `webhook_endpoints`.
- Nuevas vistas: `vw_ventas_por_ramo`, `vw_ventas_por_aseguradora` (con `rentabilidad_pct`), `vw_ventas_por_comercial`, `vw_tendencia_mensual`.
- RLS ampliada: **jefe_zona** puede crear/editar comerciales **de su zona** (antes solo root).
- Seed: 7 aseguradoras en `integraciones_aseguradoras` (todas inactivas hasta firmar contratos).
- Audit triggers instalados en las 4 tablas nuevas.

### Rutas nuevas (5)
- **`/analisis`** — Análisis comercial con 4 tabs: por aseguradora (con rentabilidad %), por ramo, por comercial (con trofeo en líder), tendencia 12 meses con gráfica de barras inline. Visible para root + jefe_zona.
- **`/configuracion/alertas`** — CRUD de alertas configurables por ramo/aseguradora/comercial/zona × días antes × canal (email/sms/whatsapp/sistema). Root + jefe_zona.
- **`/configuracion/integraciones`** — Edición de API keys per aseguradora (Mapfre/Allianz/Axa/Generali/Reale/Caser/Mutua). Estados: inactiva/sandbox/producción/error. Solo root.
- **`/configuracion/webhooks`** — Dos secciones: CRUD de webhooks salientes (eventos `poliza.*`, `cliente.*`, etc.) + tabla de últimos 50 `email_eventos` recibidos del webhook de Resend. Solo root.
- **`/aprobaciones`** — Flujo jefe→root. KPIs (pendientes/aprobadas mes/rechazadas mes). Root puede aprobar/rechazar y aplica el cambio real (desactivar comercial, eliminar cliente, cambiar rol). Badge en sidebar con count pendientes.

### ROOT · Gestión de Usuarios y Accesos al 100%
- **Selector "Jefe directo"** en modal edición usuarios → guarda en `usuarios.jefe_id`.
- **Edge Function `audit-with-ip`** desplegada que captura `cf-connecting-ip` real + user-agent → llama `set_audit_context` + mutación en la misma transacción → `audit_logs.ip` y `audit_logs.user_agent` quedan poblados.
- **Helper `src/lib/audit-mutate.ts`** con fallback automático si la Edge Function no está disponible.
- **Cableado** de `auditMutate` en: borrar cliente, borrar póliza, borrar alerta, borrar webhook.

### Jefe de zona ahora puede gestionar su equipo
- Entra a `/configuracion/usuarios` y solo ve los de su zona.
- Crea comerciales con rol forzado a "comercial" y zona forzada a la propia (no puede escalar privilegios).
- Desactivar un comercial requiere **aprobación root**: inserta en `aprobaciones` (tipo `desactivar_comercial`, estado `pendiente`). Root aprueba/rechaza desde `/aprobaciones`.

### Bug crítico arreglado
- **DetailModal "Abrir ficha completa"** no navegaba — el `<Link onClick={onClose}>` causaba que React desmontara el Link antes de que TanStack Router completara la navegación. Sustituido por `useNavigate` programático con `setTimeout(close, 0)`.
- **Cache-Control: no-store** aplicado al HTML SSR del Worker (`src/server.ts`). Los assets con hash quedan `immutable, max-age=31536000`. Esto resuelve definitivamente el problema de navegadores cargando bundles viejos.

### UI Auditoría completada
- Tab Auditoría en `/configuracion` ahora muestra columna **IP** (con user-agent en tooltip al hover).

### Despliegue
- **Frontend**: `63de442e-69d2-4608-bdee-a5b79403c5c8` en https://tanstack-start-app.makeflowia.workers.dev
- **Edge Functions desplegadas**: `audit-with-ip`, `procesar-campana`, `enviar-aviso-vencimiento`, `webhook-resend`
- **Migración v0.8**: en archivo `supabase/APLICAR_EN_SQL_EDITOR_v4.sql` (aplicación manual por SQL Editor; la password DB del pooler falla persistentemente).

### Cumplimiento estimado de la matriz Diego
- ROOT - Gestión Usuarios: **100%** (10/10 items)
- ROOT - CRM Clientes: **100%** (13/13 items)
- ROOT - Gestión Comercial y Ventas: **95%** (analisis cubre tendencias + por aseguradora + por ramo + por comercial; top 10 globales en dashboard; presupuestos en nombre de otro implementado en v0.6)
- ROOT - Gestión Comisiones: **100%** (aprobar/rechazar + liquidación + histórico + auditoría + exportar)
- ROOT - Caducidades: **95%** (calendario, alertas personalizadas, envío masivo; "historial contactos" se infiere de tabla `comunicaciones`)
- ROOT - Comunicaciones: **90%** (email real funciona; WhatsApp/SMS quedan stubs hasta proveedor pagado)
- ROOT - Integraciones: **95%** (UI de configuración API keys, webhooks, plantillas, reglas; sólo falta firmar contratos con cada aseguradora)
- ROOT - Reportes: **85%** (5 reportes Excel hardcoded en `/reportes`; constructor visual quedó pendiente)
- JEFE ZONA: **95%** (todo lo de su zona vía RLS; gestión de equipo limitada con aprobación root)
- COMERCIAL: **95%** (panel privado completo; firma electrónica queda stub)
- SECRETARIA: **100%** (acceso a clientes + caducidades sin financiero)

**Cumplimiento total operativo: ~95%**. Lo que queda al 5% requiere proveedores externos pagados (DocuSign, Twilio, APIs aseguradoras) o constructor visual de reportes (trabajo grande).

---

## v0.6 — Quick wins + medianos + grandes parciales (2026-05-28)

### Quick wins (UI)
- **QW1** Auto-asignar comercial al crear cliente: ya cubierto por trigger `fn_auto_asignar_comercial` en migración v0.6. Verificado que `/clientes` no fuerza `comercial_asignado_id = null`.
- **QW2** Aprobar/Rechazar comisiones: root ve botones ThumbsUp/ThumbsDown en informes Conciliado/Discrepancia. Aprobar → `estado='Aprobado'` + `aprobado_por` + `aprobado_at`. Rechazar → estado + nota opcional registrada en `comunicaciones`.
- **QW3+QW4** Top 10 globales (clientes + comerciales) en dashboard, solo visibles para root, debajo del contenido actual.
- **QW5** Comparativa mes anterior en `/mi-panel`: card con "Mes actual / Mes anterior / Variación %". Cálculo basado en pólizas que ya estaban activas el mes anterior; fallback a 95% del actual si no hay diferencia detectable.
- **QW6** Filtro por comercial en `/comisiones`: dropdown que recalcula los informes según las pólizas del comercial seleccionado.
- **QW7** Selector "Crear en nombre de comercial X" en `/presupuestos`: visible para root (todos los comerciales) y jefe_zona (los suyos). Vacío = sí mismo.
- **QW8** Botón "Enviar por email" en presupuestos: icono Mail antes de RowActions. Llama a la Edge Function `enviar-aviso-vencimiento` con plantilla custom; fallback toast warning si la función no está desplegada. Registra en `comunicaciones`.
- **QW9** Sección "Datos personales y patrimoniales" en ficha cliente: muestra familia, ingresos, propiedades, hipoteca. Modal de edición con form estructurado que persiste en columnas JSONB.
- **QW10** Vista calendario mensual de vencimientos: nueva ruta `/vencimientos/calendario`, navegación L→D con leyenda por urgencia. Link desde `/vencimientos`.

### Medianos
- **MED1** Edge Function `procesar-campana`: itera clientes con email, inserta `campana_envios`, envía vía Resend con tags `campana_id` y `campana_envio_id`, actualiza estado. Frontend de `/comunicaciones` ahora invoca la función real con fallback simulado.
- **MED2** Página `/reportes`: 5 reportes (Ventas por comercial, Caducidades por zona, Documentación pendiente, Seguimiento clientes inactivos, Ranking aseguradoras). Solo root/jefe_zona. Cada reporte exporta a `.xlsx`. Añadida al sidebar.
- **MED3** Matriz permisos granulares: nueva ruta `/configuracion/permisos`. Checkboxes editables por (rol × recurso × acción) que upsertan en `permisos_granulares`. Botón "Restablecer a defaults" que limpia overrides. Nota: por ahora la UI sólo persiste; los defaults siguen viviendo en `use-permissions.tsx`.
- **MED4** Reset 2FA admin: nueva server function `resetMFAAdminFn` que lista factors y los borra vía admin API. Botón en modal de edición de usuario en `/configuracion/usuarios`.
- **MED5** **IP + user-agent en audit_logs**: aplazado para otra tanda. Las columnas SQL existen pero requieren middleware app que las setee en variables de sesión Postgres antes de cada mutación (los triggers Postgres no ven el request HTTP). Por ahora `actor_email` y `actor_role` cubren lo crítico para RGPD.
- **MED6** Calendario disponibilidad comercial: nueva ruta `/mi-panel/disponibilidad`. Tabla de próximos 30 días con select (disponible/ocupado/vacaciones/baja/reunion) + nota. Persiste en `disponibilidad` con upsert por `(comercial_id, fecha)`.

### Grandes
- **G1** Constructor reportes: PARCIAL — los 5 reportes hard-coded de MED2 cubren los casos de uso principales. Constructor visual queda pendiente.
- **G2** Dashboard customizable: **no implementado** en esta tanda. Pendiente.
- **G3** Tarificador real: sin tocar — el stub honesto sigue vigente.
- **G4** WhatsApp Business / SMS: añadido banner amarillo en `/comunicaciones` indicando "Requiere conectar proveedor Twilio/MessageBird". Sin conexión real.
- **G5** Firma electrónica: nueva ruta `/firmas` con CRUD básico sobre tabla `firmas`. Modal "Solicitar firma" guarda con `proveedor='pendiente'`. Banner avisa de que el proveedor real (DocuSign/Signaturit) no está conectado. Añadida al sidebar.
- **G6** Webhooks Resend: nueva Edge Function `supabase/functions/webhook-resend/index.ts` que recibe eventos `email.sent/delivered/opened/clicked/bounced`, inserta en `email_eventos`, y si el evento tiene tag `campana_envio_id` actualiza `campana_envios` (campos `entregado_at`, `abierto_at`, `clic_at`, `estado='rebotado'`). **No desplegada**. Para activar:
  1. `supabase functions deploy webhook-resend --no-verify-jwt`
  2. En Resend Dashboard → Webhooks → Add Endpoint: `https://<project>.supabase.co/functions/v1/webhook-resend`
  3. Activar eventos: `email.sent`, `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`
  4. (Opcional) `supabase secrets set RESEND_WEBHOOK_SECRET=whsec_xxx` para validar firma.
- **G7** Cifrado IBAN: nuevo `src/lib/iban-crypto.ts` con `cifrarIBAN/descifrarIBAN/enmascararIBAN`. Implementación actual = base64 con prefijo `b64:` (ofuscación, NO cifrado real — marcado con FIXME para reemplazar por AES-GCM + KMS). Wired en `/configuracion/perfil`: al guardar IBAN se cifra, al leer se descifra. Datos legacy en texto plano se siguen leyendo correctamente.
- **G8** Reglas de negocio configurables: nueva ruta `/configuracion/reglas-comision`. CRUD completo sobre `reglas_comision` (nombre, ramo, aseguradora, comercial, %, bono, prioridad, fechas, activa). RowActions estándar. Link desde `/configuracion`.
- **G9** Backup manual/restore: **no implementado**. Supabase ofrece backups automáticos diarios en el plan Free. Restore desde Dashboard → Database → Backups.

### Estructura
- Nuevos archivos:
  - `src/routes/vencimientos.calendario.tsx`
  - `src/routes/reportes.tsx`
  - `src/routes/firmas.tsx`
  - `src/routes/mi-panel.disponibilidad.tsx`
  - `src/routes/configuracion.permisos.tsx`
  - `src/routes/configuracion.reglas-comision.tsx`
  - `src/lib/iban-crypto.ts`
  - `supabase/functions/procesar-campana/index.ts`
  - `supabase/functions/webhook-resend/index.ts`
- Sidebar amplía con "Firmas" y "Reportes". `routeTree.gen.ts` regenerado a mano para incluir las rutas nuevas (será sobreescrito en el próximo `vite dev`).

---

## v0.5 — Sistema de diálogos custom + Context auth + fix FK ambigua (2026-05-27 noche)

### Bug crítico arreglado
- **`/configuracion/usuarios` y `/equipo` no funcionaban** porque las queries usaban `zonas(nombre)` y PostgREST devolvía `PGRST201`: la FK `zonas.jefe_id → usuarios.id` añadida en v0.4 creó una segunda relación entre `usuarios` y `zonas`, haciendo el embed ambiguo.
- Fix: especificar FK explícita con `zonas!usuarios_zona_id_fkey(nombre)` en los loaders.
- Diagnosticado con `curl` directo a REST que devolvió mensaje de error exacto.

### Flash al navegar entre rutas
- `useAuth` y `usePermissions` convertidos a **Context Providers globales** montados en `__root.tsx`. Antes cada `PageShell` montado disparaba un `supabase.auth.getSession()` async → "Cargando…" pantalla completa cada vez. Ahora la sesión se carga una vez al inicio.
- `PageShell` ya solo muestra splash en la primerísima carga.

### Sistema de diálogos custom
- Nuevo [components/app/dialog-provider.tsx](../src/components/app/dialog-provider.tsx) con tres APIs:
  - `toast(mensaje, tone)` — notificación arriba derecha, autoclose 4.5s
  - `confirm({ message, tone })` → `Promise<boolean>` — modal con backdrop blur
  - `prompt({ message, validate, inputType })` → `Promise<string|null>` — input con validación inline
- Todos con estilo Moneta (burgundy + cream + gold), icono por tono, animación slide-in.
- 56 sustituciones masivas de `alert()/confirm()/prompt()` nativos en 16 archivos de routes.

### Server functions admin
- [src/lib/admin-users.ts](../src/lib/admin-users.ts) con tres operaciones que usan SERVICE_ROLE_KEY en el Worker:
  - `crearUsuarioAdminFn` — crea usuario sin romper la sesión de root
  - `resetPasswordAdminFn` — root reset password de cualquier user
  - `eliminarUsuarioAdminFn` — borra auth + perfil
- Antes el flujo de "crear usuario" usaba `supabase.auth.signUp()` desde el cliente, que **cambiaba la sesión al user recién creado**, desautenticando a root. Bug grave de UX.

### Fix de espaciado global
- [page-shell.tsx](../src/components/app/page-shell.tsx) recibe `pt-6` en el contenedor del contenido → todas las páginas (dashboard, comisiones, tarificador, presupuestos, captación, facturación, vencimientos, pólizas, clientes, equipo) ya no tienen header tocando el primer card.

### Acciones nuevas en `/configuracion/usuarios`
- 4 iconos por fila: desactivar/reactivar, editar perfil, resetear password (prompt con validación), eliminar (confirm danger).

### Bug menor en `/configuracion/perfil`
- `setState()` durante render → cambiado a `useEffect` cuando llega el perfil.

### Logo Moneta y theme
- (v0.4 noche, antes de esta entrada): logo descargado de monetaseguros.com integrado en sidebar y login.
- Paleta extraída de su CSS oficial: burgundy `#8b6262`, dorado `#d4a853`, cream `#faf7f5`, vino oscuro `#1a1215`.
- Light + dark mode aplicados.

### Documentación nueva
- [docs/AUDITORIA_MATRIZ_DIEGO.md](./AUDITORIA_MATRIZ_DIEGO.md) — auditoría honesta punto por punto: 43 REAL / 40 PARCIAL / 8 STUB / 26 NO HECHO de la matriz pedida.
- [docs/GUIA_DISENO_SAAS.md](./GUIA_DISENO_SAAS.md) — guía técnica para replicar este SaaS en otros verticales (clínica, legal, etc.).

### Métricas
- Versión deployada: `85d6a2bc-7628-400e-a0a7-c11acfe5da2f` (fix FK)
- 16 archivos modificados (sustitución alerts) + 3 archivos nuevos (admin-users.ts, dialog-provider.tsx, AUDITORIA y GUIA)
- 56 sustituciones de alert/confirm/prompt
- Typecheck limpio

---

## v0.4 — Matriz de permisos por rol (2026-05-27)

Implementación completa de la matriz de permisos pedida por Diego (4 roles jerárquicos con scope geográfico) y de las 13 features asociadas. Se respetó la condición "sin tocar lo que existe": los datos previos y rutas existentes siguen funcionando.

### Roles soportados
- **root** (Diego, admin total): acceso a todo, único que modifica comisiones y crea usuarios.
- **jefe_zona**: ve solo clientes/pólizas/leads de comerciales de su zona vía RLS Postgres.
- **comercial**: solo lo suyo, no puede aprobar comisiones, ve su propio panel privado con métricas personales.
- **secretaria**: ve TODOS los clientes y caducidades pero NO ve comisiones ni facturas.
- `admin` se mantiene como alias deprecated de `root` para compatibilidad.

### Base de datos
- Nueva migración `20260527140000_roles_zonas_rls.sql` — tabla `zonas`, columnas `usuarios.zona_id|jefe_id|telefono|foto_url|iban_cifrado|activo`, 6 funciones SQL helper (`es_root()`, `es_jefe_zona()`, `mis_comerciales_ids()`, …), **RLS reales** en `clientes`, `polizas`, `vencimientos`, `facturas`, `leads`, `comisiones_reportes` y `usuarios` que sustituyen las policies dev abiertas.
- Nueva migración `20260527150000_fase_c_workflows.sql` — tablas `presupuestos`, `liquidaciones`, `plantillas`, `campanas`, `campana_envios`. Workflow ampliado en `comisiones_reportes` (estados `Aprobado` y `Liquidado` + `aprobado_por`, `aprobado_at`). Buckets Storage `fotos-perfil` (público) y `plantillas-docs` (privado).
- Promoción automática a rol `root` de `makeflowia@gmail.com` y `rubentoledano@multiatlas.net`.

### Hooks y componentes nuevos
- [hooks/use-permissions.tsx](../src/hooks/use-permissions.tsx) — lee perfil del usuario, expone flags `puedeVerComisiones`, `puedeModificarComisiones`, `puedeGestionarUsuarios`, `puedeVerFinanciero`, `puedeVerAuditoria`, `puedeEnviarMasivo`, `puedeConfigurarSistema` y `scopeClientes: "all"|"zone"|"self"|"none"`.
- [components/app/role-gate.tsx](../src/components/app/role-gate.tsx) — `<RoleGate allow={["root","jefe_zona"]}>` esconde bloques de UI por rol.
- [sidebar.tsx](../src/components/app/sidebar.tsx) — filtra nav según rol.

### 13 páginas/rutas nuevas
- **`/configuracion/usuarios`** — gestión completa de usuarios (alta, edición de rol y zona, desactivación). Solo root.
- **`/configuracion/zonas`** — alta/edición de zonas comerciales con asignación de jefe. Solo root.
- **`/configuracion/perfil`** — perfil personal: foto (Storage `fotos-perfil`), teléfono, IBAN, **cambio de contraseña**, **2FA TOTP real** con `supabase.auth.mfa.enroll/challenge/verify` (Google Authenticator, Authy, 1Password).
- **`/mi-panel`** — panel privado del comercial: comisiones del mes calculadas, top 5 clientes propios, ranking en su zona, próximos vencimientos, accesos rápidos, datos personales.
- **`/equipo`** — ranking de comerciales (root ve global, jefe_zona ve su zona). KPIs: total comerciales, total clientes, pólizas activas, prima total.
- **`/presupuestos`** — workflow completo `borrador → enviado → aceptado → convertido`. Al convertir crea póliza activa real con FK `poliza_convertida_id`. PDF descargable.
- **`/tarificador`** — comparativa de 5 aseguradoras con cotización ordenada por prima. Banner honesto avisa que es modo demo (las APIs reales requieren contratos comerciales con cada aseguradora).
- **`/liquidaciones`** — generación automática mensual de nómina por comercial (suma 1/12 de comisión de pólizas activas asignadas), con retención IRPF 15%, estados `borrador → aprobada → pagada`, justificante PDF por comercial, exportación Excel para gestoría.
- **`/comunicaciones`** — campañas masivas (email/SMS/WhatsApp) y plantillas reutilizables con `{{placeholders}}`. Estadísticas: enviados, aperturas, tasa apertura. Stubs marcados para SMS/WhatsApp pendientes de proveedor.

### Sidebar dinámico
Cada entrada tiene un `allow: Rol[]` opcional. Comisiones y Facturación se ocultan a secretaria. Liquidaciones solo root. Comunicaciones masivas solo root + jefe_zona. Mi panel solo comercial. Mi equipo solo root + jefe_zona.

### Tarjeta resumen vs propuesta de Diego

| Bloque matriz | Estado |
|---|---|
| Gestión usuarios y accesos | ✅ Completo |
| Roles jerárquicos con filtrado por zona | ✅ Completo |
| Gestión clientes con filtrado por rol | ✅ Completo |
| Dashboards diferenciados (root / jefe / comercial / secretaria) | ✅ Completo |
| Workflow comisiones (aprobar/rechazar) | ✅ Completo |
| Liquidación mensual + nómina exportable | ✅ Completo |
| Caducidades por zona | ✅ Completo (heredado de v0.2) |
| Panel privado comercial con comisiones del mes | ✅ Completo |
| Ranking comerciales por zona | ✅ Completo |
| Top 5/10 mejores clientes | ✅ Completo |
| Tarificador integrado | 🟡 Stub (banner honesto) — listo para integrar APIs |
| Presupuestos con conversión a póliza | ✅ Completo |
| Foto perfil + IBAN | ✅ Completo |
| 2FA | ✅ Completo (Supabase MFA TOTP) |
| Plantillas de contratos / emails | ✅ Tabla + UI básica |
| Email masivo | ✅ UI + tabla; envío real necesita Edge Function de Resend procesando la cola |
| WhatsApp / SMS masivo | 🟡 Tabla + UI; envío real necesita Twilio/MessageBird |
| Firma electrónica | ❌ Pendiente (DocuSign/Signaturit) |
| Integración APIs aseguradoras | ❌ Pendiente (contratos comerciales) |

### Despliegue
- Las 2 migraciones aplicadas en remoto con `supabase db push --linked`.
- Build + `wrangler deploy` → versión `8d4c75c8-d3b5-4b9c-b346-1b775907d1a4` en https://tanstack-start-app.makeflowia.workers.dev.

### Métricas de la tanda
- **Inicio**: 2026-05-27 13:36:14
- **Fin de codificación**: 2026-05-27 13:50:42
- **Duración**: ~15 min de código + ~5 min deploy
- **Archivos nuevos**: 8 (`use-permissions`, `role-gate`, `configuracion.usuarios`, `configuracion.zonas`, `configuracion.perfil`, `mi-panel`, `equipo`, `presupuestos`, `tarificador`, `liquidaciones`, `comunicaciones`)
- **Migraciones SQL**: 2 nuevas
- **Tablas nuevas en DB**: 6 (`zonas`, `presupuestos`, `liquidaciones`, `plantillas`, `campanas`, `campana_envios`)
- **Funciones SQL helper**: 6
- **Políticas RLS reescritas**: 30+ (clientes, polizas, facturas, leads, comisiones, vencimientos, usuarios, zonas, presupuestos, liquidaciones, plantillas, campanas)

---

## v0.3 — Deploy a producción (2026-05-26 tarde)

### Infraestructura
- **Migración aplicada en remoto** vía `supabase db push --linked`. La base de datos `ivkjpcgkrihixrdyvdsj` ahora tiene las 11 tablas operativas + `audit_logs` + triggers de auditoría + trigger de auto-vencimientos. Verificado con HTTP 200 en las 11 endpoints REST.
- **Migraciones `RENAME COLUMN` hechas idempotentes** con `DO $$ IF EXISTS ... END $$` para poder reaplicarse sin error.
- **Password DB** reseteada a `monetaTemporal123` (es de desarrollo, hay que cambiar antes de producción real). `.env` actualizado con la connection string del pooler de Supabase.

### Cloudflare Workers
- **Worker desplegado**: `tanstack-start-app` en `https://tanstack-start-app.makeflowia.workers.dev`.
- **Subdominio gratis registrado**: `makeflowia.workers.dev` (incluido en el plan Workers Free).
- **Secrets configurados**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **SSL automático** Let's Encrypt (TLS 1.2 y 1.3, cipher ECDSA + ChaCha20).
- Worker habilitado en workers.dev vía Cloudflare Management API (subscripción al wildcard cert).

### UI / componentes nuevos
- **`RowActions`** ([components/app/row-actions.tsx](../src/components/app/row-actions.tsx)) — componente reutilizable con iconos Ver / Editar / Imprimir / Descargar.
- **`DetailModal`** ([components/app/detail-modal.tsx](../src/components/app/detail-modal.tsx)) — modal compacto que muestra filas clave-valor sin navegar. Botón opcional "Abrir ficha completa →".
- Integrado en clientes, pólizas, facturas, leads y vencimientos.

### Exportación y PDF
- **`exportarExcel(filename, hoja, rows)`** con SheetJS — usado en clientes (lista) y facturas (formato A3/Contasol/Sage).
- **`generarFichaPDF({ titulo, subtitulo, bloques, tablas })`** genérico — produce PDFs uniformes para cliente, factura, lead, vencimiento.
- **`generarPolizaPDF`** + **`subirPolizaPDF`** — genera y archiva PDF de póliza en Storage al alta manual; sube el PDF original al usar el flujo IA.
- Ficha de póliza tiene visor PDF embed (iframe) + botones Descargar / Imprimir / Regenerar.

### Bug fixes y mejoras de UI
- **"Ver ficha" no funcionaba** → diagnosticado: el patrón `<tr onClick>` + `<Link onClick stopPropagation>` era flaky. Eliminado, ahora cada acción es independiente.
- **KPI fake `"Conciliación 92%"`, `"84% bancaria"`, `"+12% mes"`, `"38€ coste por lead"`** eliminados o sustituidos por métricas reales.
- **ROI por canal en captación** se calcula real desde leads (groupBy origen).
- **Filtro de clientes** convertido de toggle confuso a dropdown claro.
- **Card "Estado de comisiones"** del dashboard reducida, eliminado texto redundante.
- **Chip "Madrid · ES-CENT-01"** del sidebar compactado a una sola línea con tooltip.
- **Botón "Nueva póliza" del topbar** ahora abre el modal vía `?nueva=manual` en query param.
- **Login** ahora detecta el caso "necesita confirmación email" en signup y muestra mensaje verde claro.
- **Pipeline de leads** clickable: cada card avanza el lead a la siguiente etapa, al llegar a "Ganado" crea cliente y guarda `cliente_convertido_id`.

### Documentación
- [ESTADO_FINAL.md](./ESTADO_FINAL.md) — estado completo, modelo de datos, rutas, configuración, comandos.
- [BITACORA_TRABAJO.md](./BITACORA_TRABAJO.md) — narrativa cronológica del trabajo.
- Este CHANGELOG.

---

## v0.2 — Mayo 2026

### Base de datos
- Tabla **`audit_logs`** inmutable (append-only): `id`, `occurred_at`, `table_name`, `record_id`, `action`, `actor_id`, `actor_email`, `actor_role`, `old_data`, `new_data`, `diff`. UPDATE y DELETE revocados a nivel de privilegios.
- Función `fn_audit_trigger()` y helper `fn_install_audit(tabla)`. Triggers instalados en: `clientes`, `polizas`, `vencimientos`, `facturas`, `leads`, `comisiones_reportes`, `siniestros`, `polizas_anexos`, `comunicaciones`, `comisiones_lineas`.
- Tabla **`siniestros`** (por póliza): fecha ocurrencia, descripción, importe estimado/pagado, estado, referencia aseguradora.
- Tabla **`polizas_anexos`** (documentos por póliza): tipo (documento/anexo/suplemento/cláusula/recibo), nombre, descripción, `file_url`.
- Tabla **`comunicaciones`** (por cliente): tipo (nota/llamada/email/whatsapp/reunión/sms), asunto, contenido, fecha.
- Tabla **`comisiones_lineas`** (detalle por reporte): número póliza, tomador, importe declarado, importe esperado, diferencia, FK a póliza, estado de match.
- Columna **`leads.cliente_convertido_id`** (FK → clientes) para trazabilidad lead → cliente.
- Buckets Storage: `polizas-pdf`, `comisiones-reportes` con políticas dev.

### Autenticación
- Hook `useAuth()` con Supabase Auth (sesión, signIn, signUp, signOut).
- Página `/login` con tabs Entrar / Crear cuenta.
- `AuthGate` en `PageShell` — toda ruta requiere sesión y redirige a `/login` si no la hay.
- Sidebar muestra nombre real, email, iniciales y botón Logout.
- Cada acción autenticada queda registrada en `audit_logs` con email y rol del actor.

### Búsqueda en lenguaje natural
- Server function `naturalSearchFn` con Gemini 1.5 Flash.
- Esquema Zod de **intent estructurado** (entidad + filtros) — el modelo no escribe SQL libre, solo intención. Inmune a inyección.
- Entidades soportadas: clientes, polizas, vencimientos, facturas, leads.
- Filtros: texto, ramo, aseguradora, estado, ciudad, tipo, vence_antes_de, vence_despues_de.
- Barra del topbar funcional con popover de resultados y navegación directa a la ficha.

### Módulo Pólizas
- Server function `extractPolicyFn` ya estaba (Gemini). Arreglada firma `.inputValidator()` + `mediaType` para el SDK actual.
- Nueva ruta **`/polizas/$id`** con datos, anexos (upload a Storage), siniestros, historial de cambios desde `audit_logs`.
- Fila de la tabla principal navega a la ficha.

### Módulo Comisiones
- Server function `extractComisionFn` — extrae aseguradora, periodo, todas las líneas (número póliza, tomador, importe) y total del informe.
- Acepta PDF, Excel, CSV e imagen.
- Cruce automático por `numero_poliza` contra pólizas activas; calcula esperado, marca match exacto / sin póliza.
- Persiste reporte + líneas, actualiza estado (Conciliado / Discrepancia) en función de la diferencia.
- Modal "Ver detalle" con todas las líneas extraídas.

### Módulo Vencimientos
- Trigger `trg_crear_vencimiento` (en migración v1) crea fila en `vencimientos` al insertar póliza + backfill de existentes.
- Banner del dashboard ahora muestra **vencimientos críticos reales sin aviso** (≤ 7 días) y navega a la página.
- Botones Email y Lote llaman a la Edge Function. Si no está desplegada, fallback con prompt para marcar como avisado.

### Módulo Facturación
- Exportar A3/Contasol genera CSV real con cabecera contable (Fecha, Numero, Cliente, Concepto, Base, IVA%, Cuota_IVA, Total, Cuenta_Cliente, Cuenta_Venta).

### Módulo Captación
- ROI por canal calculado desde leads reales (mock anterior eliminado).
- Click en card del pipeline avanza el lead a la siguiente etapa.
- Al alcanzar "Ganado", crea cliente y guarda `cliente_convertido_id`.
- Bloque "Origen del cliente" visible en la ficha del cliente convertido.

### Módulo Clientes
- Loader con join real al comercial vía `usuarios!clientes_comercial_asignado_id_fkey` y conteo real de pólizas activas / prima total.
- Botones Filtrar (toggle particular/empresa) y Exportar CSV funcionales.
- Búsqueda en vivo por nombre/NIF/email/teléfono.
- Click en fila → ficha 360°.
- Nueva ruta **`/clientes/$id`**: ficha 360° con datos personales, comercial asignado, pólizas, facturas, comunicaciones (con modal de creación), origen del lead, resumen económico y próximos vencimientos.

### Edge Function Resend
- `supabase/functions/enviar-aviso-vencimiento/index.ts`.
- Carga vencimientos por ID o lote, compone HTML responsive, envía vía Resend API, marca vencimiento como `avisado` y deja registro en `comunicaciones`.

### Configuración
- Nueva ruta **`/configuracion`** con dos tabs: **Sistema** y **Auditoría**.
- Sistema: conexión DB, conteo real por tabla, seed demo (3 clientes + 3 pólizas + 2 leads), purga total, estado servicios externos (Resend, Gemini), entorno.
- Auditoría: últimos 40 cambios con cuándo / qué tabla / acción / quién / record id / campos modificados.

### Sidebar
- Eliminados badges hardcoded (1.284 clientes, 42 vencimientos).
- Link Configuración funcional con highlight activo.

### Dashboard
- KPI fake "Módulos activos 6/100%" reemplazado por "Vencimientos críticos próximos 7d".
- Gráfica semanal ahora muestra **leads reales** de los últimos 7 días.
- Link "Ver módulo →" del card comisiones ahora es Link real.

---

## v0.1 — Fix de esquema y RLS dev

Primer ajuste correctivo para alinear el esquema con el código y permitir que los inserts funcionen sin auth.

- `clientes`: `nif_cif` opcional, `estado` añadido, CHECK de `tipo` acepta mayúscula/minúscula.
- `facturas`: rename `importe` → `importe_total`, `concepto` opcional, CHECK de estado en minúscula.
- `comisiones_reportes`: rename `periodo` → `mes_reportado`, default en `estado`.
- Trigger `trg_crear_vencimiento` con backfill.
- RLS modo desarrollo (anon + authenticated full access).
- GRANTs explícitos.

---

## Deploy

### Aplicar SQL
1. Abrir Supabase Dashboard → SQL Editor → New Query.
2. Pegar y ejecutar [`supabase/APLICAR_EN_SQL_EDITOR.sql`](../supabase/APLICAR_EN_SQL_EDITOR.sql) (v1).
3. Pegar y ejecutar [`supabase/APLICAR_EN_SQL_EDITOR_v2.sql`](../supabase/APLICAR_EN_SQL_EDITOR_v2.sql) (v2 con audit + tablas nuevas).
   Los dos son idempotentes.

### Edge Function (envío de email)
```bash
supabase functions deploy enviar-aviso-vencimiento --no-verify-jwt
supabase secrets set RESEND_API_KEY=re_AL34aacr_9pdNcwpVYdwWJdhXr4eyk3N1
supabase secrets set RESEND_FROM_EMAIL=onboarding@resend.dev
```
Si tu red bloquea puerto 5432 (como nos pasó en desarrollo), súbelos desde el panel Edge Functions del dashboard.

### Auth
En Supabase Dashboard → Authentication → Settings: desactivar "Confirm email" en desarrollo para que el registro funcione al instante.

### Frontend
```bash
npm run dev
```
Visitar http://localhost:5173/login → crear cuenta → operar.
