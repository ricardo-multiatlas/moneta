# Bitácora de trabajo — Correduría OS (Moneta)

Narrativa directa de lo que se fue haciendo, en orden cronológico, en mi voz.
No documenta peticiones, solo decisiones y entregas.

---

## Fase 1 — Auditoría inicial y fix de esquema

Auditando los seis routes (`clientes`, `polizas`, `vencimientos`, `comisiones`, `facturacion`, `captacion`) y comparándolos con las dos migraciones SQL existentes, detecté ~10 bugs críticos que impedían que cualquier botón guardara nada:

**Mismatches esquema ↔ código:**
- `facturas`: la columna real era `importe`, el código mandaba `importe_total`. Además `concepto NOT NULL` no se enviaba.
- `comisiones_reportes`: columna `periodo`, código mandaba `mes_reportado`. Faltaba enviar `estado` que es NOT NULL.
- `clientes`: `nif_cif NOT NULL` rompía los inserts embebidos desde póliza/factura. El form mandaba `tipo: "Particular"` pero el CHECK exigía minúscula. Mandaba `estado` que no existía como columna.
- `vencimientos`: no se insertaba nada al crear póliza → módulo siempre vacío.

**RLS bloqueante:** las políticas exigían `auth.uid()` pero no había login. Resultado: SELECT devolvía 0 filas y INSERT fallaba.

Generé migración correctiva (`20260526120000_fix_schema_y_rls_dev.sql`):
- Alineé columnas y CHECKs con lo que el código realmente envía.
- Trigger `trg_crear_vencimiento` que auto-inserta vencimiento al crear póliza, con backfill para las existentes.
- Policies modo dev (acceso total para anon + authenticated) para desarrollo sin auth.
- GRANTs explícitos al schema `public`.

Reescribí los inserts del frontend con un helper `ensureCliente()` reutilizable (busca por nombre, lo crea si no existe) para que los flows póliza/factura no rompan al embeber el cliente.

Arreglé también la `createServerFn` de la extracción IA en `polizas.tsx`: la firma del SDK actual exige `.inputValidator()` (no `.handler` directo) y `mediaType` en lugar de `mimeType`. Typecheck pasó limpio.

## Fase 2 — Detección de tablas no migradas

El usuario reportó errores tipo `Could not find the table 'public.comisiones_reportes' in the schema cache` y `public.leads`. Las migraciones nunca se habían aplicado en Supabase.

Intenté `supabase db push` por CLI: timeout TCP al puerto 5432 (firewall local lo bloquea), solo el 443/REST está abierto.

Generé `supabase/APLICAR_EN_SQL_EDITOR.sql` — un único archivo idempotente con TODO el esquema + trigger + RLS dev + GRANTs, listo para pegar en el SQL Editor del dashboard.

Aproveché para hacer otros arreglos detectados:
- Eliminé los badges hardcoded del sidebar ("1.284" clientes, "42" vencimientos).
- `AISuggestionBanner` ahora recibe `criticosSinAviso` calculado del loader, navega a `/vencimientos`, se oculta si no hay críticos.
- Gráfica "Captación esta semana" del dashboard convertida en "Leads esta semana" con datos reales de los últimos 7 días.
- Link "Configuración" del sidebar ahora navega a una ruta real `/configuracion` que creé con conteos reales por tabla, botón **Seed demo** (3 clientes + 3 pólizas + 2 leads de un click) y botón **Vaciar tablas**.

## Fase 3 — Auditoría módulo por módulo y limpieza de KPIs falsos

Comparé el código actual contra los 6 módulos prometidos en la propuesta comercial. Encontré varios KPIs hardcoded engañosos que mentían al cliente:

- `"Conciliación automática 92% (+14% vs Q1) con IA"` — no existía IA en comisiones.
- `"Conciliación bancaria 84% semi-auto con extracto BBVA"` — no existía conciliación bancaria.
- `"Coste por lead 38€ -12%"` — inventado.
- `canalesCaptacion` con un mock de 4 entradas falsas.
- `"Módulos activos 6 / 100% operativos"` — decoración.

Sustituí cada KPI por una métrica real calculada de los datos en DB. Donde no había métrica real útil, quité el KPI y lo reemplacé por uno honesto (por ejemplo "Total facturas" en lugar de "Conciliación bancaria 84%").

ROI por canal en captación: lo recalculé en el loader desde los leads reales (groupBy origen, conversión = ganados/total, valor medio = totalGanado/ganados). Si no hay leads, muestro mensaje en vez de barras vacías.

Hice funcional el botón "Exportar A3/Contasol" que antes era un `alert("Descargando...")` falso. Ahora genera CSV con cabecera contable: Fecha, Numero, Cliente, Concepto, Base, IVA%, Cuota_IVA, Total, Cuenta_Cliente (430000), Cuenta_Venta (705000).

Conversión lead→cliente: añadí función `avanzarLead` en captación. Click sobre una card del pipeline avanza a la siguiente etapa (Nuevo → Cualificado → Propuesta → Negociación → Ganado). Al llegar a "Ganado" pregunta si crear ficha de cliente.

Creé la **ficha 360°** del cliente en `/clientes/$id`: datos personales, comercial asignado, pólizas con vencimiento y prima, facturas, resumen económico (prima anual total, pólizas activas, facturas emitidas), próximos vencimientos y acciones rápidas (crear póliza, crear factura). Conecté las filas de la tabla de clientes para que naveguen a la ficha.

## Fase 6 — Matriz de permisos por rol (Diego)

Diego (cliente) entregó una matriz completa de permisos: 4 roles jerárquicos (root, jefe_zona, comercial, secretaria), filtrado de datos por zona geográfica, y ~15 features asociadas (workflow comisiones, liquidaciones, presupuestos, perfil con foto + IBAN, 2FA, plantillas, campañas masivas, tarificador, firma electrónica, integraciones aseguradoras). Pidió implementar "sin tocar lo que existe".

Hice análisis honesto del alcance antes de programar: la matriz son tres tipos de trabajo distintos — A) infraestructura de roles + RLS (la fundación bloqueante), B) dashboards diferenciados por rol, C) ~10 features nuevas. Algunas de C requieren terceros (claves de aseguradoras, dominio verificado en Resend, Twilio para WhatsApp, DocuSign para firma). Le ofrecí tres caminos: solo A, A+B, o A+B+C entero. Pidió **A+B+C entero**.

### Fase A: Fundación

Migración `20260527140000_roles_zonas_rls.sql`:
- Tabla `zonas` con jefe_id (FK a usuarios).
- `usuarios` ampliado: `zona_id`, `jefe_id`, `telefono`, `foto_url`, `iban_cifrado`, `activo`.
- CHECK de `rol` ampliado a los 4 nuevos (manteniendo `admin` como alias).
- 6 funciones SQL helper SECURITY DEFINER STABLE: `mi_rol()`, `mi_zona()`, `es_root()`, `es_jefe_zona()`, `es_comercial()`, `es_secretaria()`, `mis_comerciales_ids()`. Esta última devuelve SETOF UUID dependiendo del rol: root/secretaria ven todos, jefe_zona ve su zona, comercial solo a sí mismo. Es la pieza clave de los policies.
- **RLS reales** sustituyendo las dev abiertas en 8 tablas: clientes, polizas, vencimientos, facturas, leads, comisiones_reportes, usuarios, zonas. Cada policy usa los helpers. Mantengo fallback `OR auth.uid() IS NULL` para que el modo dev sin login siga funcionando durante pruebas.
- Promoción automática de `makeflowia@gmail.com` y `rubentoledano@multiatlas.net` a rol `root` al aplicar.

Hook `usePermissions()` y `<RoleGate>`:
- El hook lee el perfil completo del usuario logueado y expone un objeto con flags booleanos: `puedeVerComisiones`, `puedeModificarComisiones`, `puedeGestionarUsuarios`, `puedeVerFinanciero`, `puedeVerAuditoria`, `puedeEnviarMasivo`, `puedeConfigurarSistema`. También expone `scopeClientes: "all"|"zone"|"self"|"none"` para que las queries sepan filtrar.
- `<RoleGate allow={["root","jefe_zona"]}>` es declarativo: si el usuario no tiene un rol permitido, no renderiza el children. Útil para esconder botones y secciones enteras.

Páginas administrativas (`/configuracion/usuarios`, `/configuracion/zonas`):
- Lista de usuarios con email, rol (badge tonal), zona, teléfono, estado. Filas con RowActions estándar (ver/editar/imprimir/descargar). Modal de alta crea cuenta vía `supabase.auth.signUp` y upsert en `usuarios`. Edición separada (no toca password — para eso está reset de password aparte). Botón activar/desactivar usuario.
- Zonas: alta con nombre + descripción + asignación opcional de jefe. Conteo en vivo de comerciales por zona.

### Fase B: Dashboards diferenciados

Sidebar ahora tiene array `nav` con campo opcional `allow: Rol[]`. La función `visibleNav` filtra antes de renderizar. Comerciales tienen su entrada nueva "Mi panel", jefes y root ven "Mi equipo", secretaria pierde Comisiones/Facturación/Liquidaciones.

`/mi-panel` (comercial privado):
- Calcula desde DB: comisiones del mes (1/12 de la comisión de cada póliza activa asignada), prima total cartera, conteo de clientes propios, posición en ranking de la zona (consulta todos los comerciales de su zona, suma prima de cada uno, ordena, encuentra su posición).
- Top 5 mejores clientes propios por prima anual.
- Top 3 próximos vencimientos a 30 días.
- Bloque "Mi perfil" con link a `/configuracion/perfil`.
- Card de accesos rápidos a mis clientes, mis pólizas, pipeline, mis comisiones.

`/equipo`:
- Si es root: lista todos los comerciales con su zona.
- Si es jefe_zona: filtra a `zona_id = mi_zona_id`.
- Ranking ordenado por prima total de cartera (trofeo en el primero).
- KPIs agregados: total comerciales, total clientes bajo el equipo, total pólizas activas, prima total.

### Fase C: Workflows nuevos

Migración `20260527150000_fase_c_workflows.sql`:
- `presupuestos` con `numero` único, FK a `clientes` y `leads`, `coberturas JSONB`, `fecha_validez`, estado `borrador → enviado → aceptado/rechazado/expirado → convertido`, `poliza_convertida_id` para cerrar el lazo.
- `liquidaciones` con `UNIQUE(comercial_id, periodo)`, importe bruto/neto, retención, detalle JSONB con desglose de cada póliza que aporta, `pdf_url` para el justificante.
- `plantillas` con tipo (contrato/recordatorio/presupuesto_email/renovacion/bienvenida/otro), asunto, contenido con `{{placeholders}}`, lista de variables disponibles.
- `campanas` con tipo (email/sms/whatsapp), FK a plantilla, segmento JSONB (filtro tipo `{"ramo":"auto","zona_id":"..."}`), contadores `total_destinatarios/enviados/fallidos/aperturas/clicks`, programación temporal.
- `campana_envios` para detalle individual con `proveedor_msg_id` (para webhook de Resend/Twilio actualizar estado).
- Ampliación de `comisiones_reportes`: nuevos estados `Aprobado` y `Liquidado`, columnas `aprobado_por`, `aprobado_at`, `notas`.
- Buckets Storage `fotos-perfil` (público) y `plantillas-docs` (privado).

`/presupuestos`:
- Tabla con badges por estado, RowActions con acción contextual: si está en `borrador` el icono "edit" lo pasa a `enviado`, si está en `enviado` lo pasa a `aceptado`, si está en `aceptado` lo convierte en póliza (creando registro en `polizas` y guardando `poliza_convertida_id`). El workflow completo se navega con un solo click por etapa.
- Modal de alta acepta cliente existente o nombre nuevo (para leads sin convertir).
- PDF descargable con `generarFichaPDF`.

`/tarificador`:
- Form con ramo, valor asegurado, edad tomador.
- `simularCotizaciones()` devuelve 5 aseguradoras ordenadas por prima usando una fórmula heurística (`base × factor`) más coberturas tipo según ramo. Marca la primera como "Mejor precio".
- Banner amarillo arriba avisa explícitamente que es modo demostración y que el integrador real reemplaza `simularCotizaciones()` por llamadas a Mapfre Connect / Allianz Direct / Axa Conecta sin tocar el resto. Honestidad > mock invisible.
- Botón "Elegir" sugiere al usuario crear el presupuesto en `/presupuestos` con los datos cotizados (no automatizo el flow porque añadiría más cruces sin valor real hasta tener las APIs).

`/liquidaciones`:
- "Generar liquidaciones de YYYY-MM": itera comerciales activos, para cada uno suma `comision_importe || prima_anual * 0.1` de sus pólizas activas dividido entre 12, aplica retención IRPF 15%, hace upsert (UNIQUE comercial+periodo evita duplicados al regenerar el mismo mes).
- Cada fila: ver/aprobar, cancelar, descargar justificante PDF con desglose para el comercial.
- Exportar todas a Excel con columnas estándar de nómina (Periodo, Comercial, Email, IBAN, Bruto, Retención, Neto, Estado) — listo para meter en A3/gestoría.

`/comunicaciones`:
- Tabs Campañas / Plantillas.
- Crear campaña: nombre, canal (email/SMS/WhatsApp), asunto, cuerpo con `{{placeholders}}`. Cuenta destinatarios automáticamente contra `clientes`.
- "Enviar ahora" marca como enviada y deja la cola para que una Edge Function de Resend procese realmente. Por ahora simulamos en DB para que se vea el flow. Cuando esté la Edge Function, lee `campanas WHERE estado='enviando'` y trabaja con `campana_envios`.
- Plantillas reutilizables con tipos predefinidos.

`/configuracion/perfil`:
- Foto de perfil con upload directo a bucket `fotos-perfil` (público). Si no hay, muestra iniciales.
- Edición de nombre, teléfono, IBAN. El IBAN se guarda tal cual en `iban_cifrado` (con RLS que lo restringe a root + self); para cifrado real con KMS hay que añadir capa antes de insertar — lo dejo como nota en docs.
- Cambio de password vía `supabase.auth.updateUser`.
- **2FA TOTP real** con `supabase.auth.mfa.enroll({factorType:"totp"})` → recibe `qr_code` (data URL del QR) → renderiza imagen → user escanea con Google Authenticator/Authy → introduce 6 dígitos → `mfa.challenge` + `mfa.verify` → activado. Supabase pedirá el código en cada login a partir de ahí.

### Decisiones honestas sobre features que no se hacen "del todo"

- **Tarificador**: cotizaciones simuladas. La integración real necesita contratos comerciales con cada aseguradora y certificación de sandbox. Lo dejé explícito en el banner del UI y en docs.
- **WhatsApp / SMS masivo**: tabla y UI funcionando, pero falta proveedor pagado (Twilio o similar) y la Edge Function que procesa la cola. Si Diego confirma proveedor, son ~2 horas de wiring.
- **Email masivo real**: el `RESEND_API_KEY` ya está. Falta la Edge Function que lee `campanas` con estado `enviando` y procesa `campana_envios` con la plantilla. La estructura está lista, solo falta el código que dispara.
- **Firma electrónica**: no implementada. Requiere DocuSign (~150€/mes) o Signaturit. No tiene sentido hacer stub porque la integración es completamente externa.
- **Cifrado IBAN con KMS**: hoy texto plano + RLS. Para PCI-grade hay que añadir capa de cifrado a nivel app.
- **Histórico de cambios en comisiones**: los `audit_logs` ya graban todo gracias a los triggers genéricos instalados en v0.2.

### Deploy

Las 2 migraciones aplicadas con `supabase db push --linked` (solo NOTICES de "skipping" porque drop policy no existía aún, sin errores). Build pasó (TanStack Start regenera `routeTree.gen.ts` automáticamente para las 13 rutas nuevas). Después de regenerar el tree, el `tsc --noEmit` quedó limpio. `wrangler deploy` subió 46 archivos a Cloudflare. Versión `8d4c75c8-d3b5-4b9c-b346-1b775907d1a4`.

Duración total de esta fase: ~15 minutos de codificación + ~5 minutos de aplicación de migración y deploy.

---

## Fase 5 — Deploy a producción

Después de aplicar la migración v2 en local, faltaba: aplicarla en la DB remota, refactorizar la UI con los iconos pedidos (ver/editar/imprimir/descargar) y desplegar.

### Aplicar v2 en producción remota

El user no había podido aplicar el SQL en el editor del dashboard. Probamos `supabase db push` con la password que tenía en `.env` y rebotó con `SQLSTATE 28P01 password authentication failed`. Cuatro variantes (`moneta2026`, `moneta2026@`, `moneta2026@@`, `moneta2026@@@`) — todas rechazadas. Confirmado con verify del service_role key (HTTP 200): el proyecto está vivo, solo la password está rota.

Le guié paso a paso a resetear la password desde `Dashboard → Settings → Database` a `monetaTemporal123` (sin caracteres especiales para descartar líos de escape). Con esa funcionó. Apliqué dos migraciones:

- `20260526120000_fix_schema_y_rls_dev.sql` — la v1. Falló inicialmente porque ya estaba aplicada parcialmente (la columna `importe` ya estaba renombrada). Hice idempotentes los `RENAME COLUMN` con `DO $$ IF EXISTS ... END $$` y reintentamos. Pasó con NOTICES pero sin errores.
- `20260526130000_audit_y_extensiones.sql` — la v2 con audit_logs, siniestros, anexos, comunicaciones, etc. Aplicó limpia.

Verifiqué las 11 tablas operativas con `curl` REST devolviendo HTTP 200 cada una. Después borré el helper defensivo `safe()` de los loaders de ficha (`clientes.$id.tsx`, `polizas.$id.tsx`) — ya no hace falta tolerar tablas faltantes, existen de verdad.

### "Ver ficha" no funcionaba (segundo round)

El user reportó que `Ver ficha` no abría. Verifiqué la query del loader con `curl` directo — devolvía el cliente con todos los datos. La query era correcta. El problema era el patrón `<tr onClick={navigate}> + <Link onClick={stopPropagation}>` dentro: en algunos navegadores la propagación se traga el Link de TanStack. Lo eliminé. Ahora cada acción es independiente.

### Iconos en todas las filas (ver/editar/imprimir/descargar)

Pidió que cada registro tuviera esos cuatro iconos obligatoriamente. Creé `components/app/row-actions.tsx` — componente reutilizable que recibe un array de actions con `to` (Link) u `onClick` (button). Soporta `disabled` y `tone` (neutral/brand/danger).

Para los PDFs creé `lib/generic-pdf.ts` con `generarFichaPDF({ titulo, subtitulo, bloques, tablas })` que produce PDFs uniformes con cabecera Moneta. Lo usan cliente, factura, lead y vencimiento.

Instalé `xlsx` y `jspdf`. Hice helper `lib/exportar.ts` con `exportarExcel(filename, hoja, rows)`. El exportador A3/Contasol que era CSV pasó a Excel real con columnas tipadas (números reales, no strings).

Integré RowActions en las 5 tablas (clientes, pólizas, facturas, leads, vencimientos). En vencimientos tuve que reorganizar el grid (col-span: 1+3+2+1+2+3 = 12) porque al añadir las acciones a la columna de 1, los botones Email/WhatsApp/Renovar se encimaban con el texto del estado.

### Ver = abrir modal, no navegar

El user volvió a observar: el icono de ojo no debería navegar a página, debería mostrar los datos en una ventana emergente. Tiene razón — el icono Eye implica "ver aquí mismo", no "ir a otra página".

Creé `components/app/detail-modal.tsx`: modal compacto con título, subtítulo, una `<dl>` con filas clave-valor y botón opcional "Abrir ficha completa →" abajo para los módulos que tienen ruta detalle propia (clientes, pólizas, vencimientos→póliza). Integrado en los 5 módulos. Cada icono Eye ahora hace `setViewing(item)`, el modal se renderiza con los datos.

### Cards encimadas

Otra observación visual: las cards "Estado de comisiones" del dashboard y "Madrid · ES-CENT-01 · Soberanía de datos" del sidebar eran demasiado grandes. Las reduje: padding `p-5 → p-3.5`, eliminé texto redundante, el chip de Madrid pasó de bloque de 2 líneas a una sola línea con tooltip.

### Deploy

El user pidió deploy a Vercel. Verifiqué la config: el proyecto está hecho para Cloudflare Workers (`@cloudflare/vite-plugin` viene hardcoded en `@lovable.dev/vite-tanstack-config`, `wrangler.jsonc` apunta a `src/server.ts`). Para Vercel habría que reescribir el preset o renunciar al SSR/server functions de IA.

Le presenté tres opciones claras (Vercel SPA-only, Cloudflare nativo, reescribir todo para Vercel). Eligió Cloudflare — la elección correcta porque el proyecto ya está hecho para eso.

Login OAuth de Cloudflare → secrets subidos (Supabase URL, anon key, service role key) → primer `wrangler deploy` falló porque la cuenta no tenía subdominio `workers.dev` registrado.

Le pasé URLs alternativas para registrarlo manualmente pero le daban 404 (la UI de Cloudflare cambió hace poco). Le ofrecí registrarlo yo vía Management API, me dio un Cloudflare API Token (`cfut_...`). Verifiqué el token, descubrí que el subdominio `makeflowia` ya estaba registrado (probablemente por el intento previo de wrangler). Habilité el flag `enabled:true` en el subdomain del Worker vía API y reintenté `wrangler deploy`.

Esta vez subió OK pero la primera carga en navegador rebotó con `ERR_SSL_VERSION_OR_CIPHER_MISMATCH`. Verifiqué el cert con `openssl s_client`: `subject=CN=makeflowia.workers.dev`, SAN `*.makeflowia.workers.dev`, emitido por Let's Encrypt E7, TLS 1.2 y 1.3 ambos OK, return code 0. El cert del servidor estaba perfecto. El error venía del navegador del user (cache HSTS, antivirus haciendo MITM, o similar). Le di pasos para diagnosticar lado cliente. Probó en modo incógnito y abrió.

### Estado final del deploy

URL pública: **https://tanstack-start-app.makeflowia.workers.dev**

Funciona: login, todo el CRUD, Storage, exportación Excel, PDFs generados en cliente, auditoría, dashboard. Pendientes en producción:

- `GOOGLE_GENERATIVE_AI_API_KEY` como secret del Worker (para extracción IA de PDF, comisiones IA, búsqueda NL).
- `supabase functions deploy enviar-aviso-vencimiento` + `RESEND_API_KEY` como secret (para email real de vencimientos).

Le pedí que borre el Cloudflare API Token desde el dashboard de profile (ya cumplió su trabajo).

---

## Fase 4 — Lo que faltaba grande

A partir de aquí el trabajo grande: auditoría inmutable (RGPD), auth real, comisiones con IA, búsqueda en lenguaje natural, ficha de póliza, comunicaciones, emails reales.

### Migración v2 — `APLICAR_EN_SQL_EDITOR_v2.sql`

Diseñé una capa de auditoría que cumple la promesa de la propuesta sobre RGPD ("quién modificó qué y cuándo") y la condición de "tablas inmutables" que pidió el usuario:

- Tabla `audit_logs` con `occurred_at`, `table_name`, `record_id`, `action`, `actor_id`, `actor_email`, `actor_role`, `old_data`, `new_data` y `diff`.
- `BIGSERIAL` como PK por volumen esperado.
- Función `fn_audit_trigger()` SECURITY DEFINER que extrae el actor del JWT (`auth.uid()` + claim `email` + claim `role`), genera el diff con `jsonb_each` filtrando solo los campos cambiados, y persiste el log.
- Helper `fn_install_audit(tabla)` para instalar el trigger en cualquier tabla con un `SELECT`.
- Triggers instalados en las 6 tablas operativas + las 4 nuevas (siniestros, anexos, comunicaciones, líneas de comisiones).
- Privilegios: REVOKE UPDATE/DELETE → `audit_logs` es append-only a nivel de motor, no solo a nivel de aplicación.

Añadí también las tablas que faltaban para cumplir el resto de la propuesta:
- `siniestros` por póliza (fecha ocurrencia, descripción, importe estimado/pagado, estado, referencia aseguradora).
- `polizas_anexos` (tipo, nombre, file_url) — para "anexos, garantías, siniestros" prometidos.
- `comunicaciones` por cliente (nota, llamada, email, whatsapp, reunión, sms) — para la "memoria de la relación" que la propuesta promete que no se pierde con cada persona que cambia.
- `comisiones_lineas` — detalle línea-por-línea del informe de aseguradora con match a la póliza.
- `leads.cliente_convertido_id` (FK) — para cerrar la trazabilidad lead→cliente→póliza→factura.
- Buckets Storage `polizas-pdf` y `comisiones-reportes` con políticas dev.

### Autenticación

Hook `useAuth()` en `src/hooks/use-auth.tsx` con `signIn`, `signUp` (que también crea la fila en `usuarios` con rol admin) y `signOut`. Listener `onAuthStateChange` para mantener la sesión sincronizada.

Página `/login` con tabs Entrar / Crear cuenta, branding Moneta, estado de error inline, redirige a `/` al loguearse.

`AuthGate` en `PageShell`: si `!loading && !user && pathname !== "/login"` redirige a `/login`. Render condicional: loading muestra "Cargando…", sin user no renderiza nada (mientras redirige).

Sidebar conectado: muestra nombre desde `user.user_metadata.nombre` o fallback al email, iniciales calculadas, email completo, botón LogOut funcional.

### Búsqueda en lenguaje natural

Aquí el diseño importa: nunca dejar que un modelo escriba SQL libre contra una DB de producción. Lo resolví así:

`src/lib/ai-search.ts` — server function que pasa la pregunta del usuario a Gemini junto con un schema Zod que NO es "SQL", sino una **intención estructurada**:

```ts
{
  entidad: "clientes" | "polizas" | "vencimientos" | "facturas" | "leads",
  filtros: { texto?, ramo?, aseguradora?, estado?, ciudad?, tipo?, vence_antes_de?, vence_despues_de? },
  limite: 25,
  explicacion: string
}
```

El handler interpreta esa intención y construye la query Supabase con builder fluent (`.from().select().ilike().lte()...`) — el modelo no toca strings SQL. Cualquier intento de prompt injection se desinfla porque el peor caso es un filtro `ilike` con texto raro.

`topbar.tsx` reescrito: la barra `<input>` ahora es un `<form>` que dispara `naturalSearchFn`. Spinner en el icono mientras carga, popover con resultados clickables (cada resultado navega a la entidad correcta), pie con explicación del modelo en español ("Estoy mostrando clientes de Sevilla con póliza de auto que vence antes de 2026-09-01").

### Comisiones con IA real

Lo que antes era un form manual (`aseguradora` + `importe`) es ahora un flujo de upload + IA + cruce automático:

`src/lib/ai-comisiones.ts` — server function con prompt específico para informes de comisiones de aseguradoras españolas. Schema Zod pide aseguradora, periodo, líneas (numero_poliza, tomador, importe_declarado) e importe total. Acepta PDF, Excel, CSV o imagen vía `mediaType`.

`comisiones.tsx` rehecho:
1. Upload del archivo (input file con accept multi-formato).
2. Pasa a base64, llama `extractComisionFn`.
3. Busca pólizas de esa aseguradora en DB.
4. Crea el reporte con aseguradora/periodo/importe_declarado.
5. Por cada línea extraída, hace lookup por `numero_poliza`, calcula esperado (10% de prima o `comision_importe` si está), marca match exacto o sin póliza.
6. Inserta todas las líneas + actualiza el reporte con calculado total, diferencia y estado (Conciliado si |diff| < 1, Discrepancia si no).
7. Modal "Ver detalle" muestra la tabla completa.

Indicador de paso ("Leyendo archivo…", "Analizando con IA…", "Cruzando con tus pólizas…") en el botón mientras corre.

### Ficha póliza `/polizas/$id`

Vista con datos completos (número, ramo, aseguradora, estado, fechas, prima, comisión), sección **Anexos** con upload a Storage bucket `polizas-pdf` y botón añadir (tipo + nombre + descripción + archivo opcional), sección **Siniestros** (tabla con fecha, descripción, estimado, pagado, estado) con modal de alta, y aside con bloque **Historial** que lee de `audit_logs` filtrado por `table_name='polizas'` y `record_id=<id>` para mostrar quién cambió qué y cuándo.

Conecté la tabla de pólizas (`polizas.tsx`) para que cada fila navegue a su ficha.

### Comunicaciones en ficha cliente

Añadí sección Comunicaciones a `/clientes/$id` con modal de creación (tipo nota/llamada/email/whatsapp/reunión/sms, asunto, contenido). Cada comunicación se renderiza con su icono correspondiente y timestamp completo.

También añadí bloque "Origen del cliente" que aparece solo si existe un lead con `cliente_convertido_id` apuntando a este cliente — cierra el círculo de trazabilidad mostrando canal de captación, valor estimado y fecha del primer contacto.

### Trazabilidad lead → cliente

Refactoricé `avanzarLead`: cuando el lead ya está en Ganado y se convierte, ahora:
1. Si ya tiene `cliente_convertido_id`, navega a esa ficha.
2. Si existe cliente con ese nombre, lo reusa.
3. Si no, crea cliente nuevo.
4. **Siempre actualiza `leads.cliente_convertido_id`** para que la trazabilidad quede registrada (y la ficha del cliente lo muestre).

### Edge Function Resend

`supabase/functions/enviar-aviso-vencimiento/index.ts`:
- Acepta `vencimiento_id` único o `ids: [...]` para lote.
- Carga los vencimientos con join completo (póliza + cliente).
- HTML responsive con branding Moneta, datos de la póliza, fecha, días restantes, prima.
- Envía vía Resend API.
- Marca el vencimiento como `avisado`.
- Inserta fila en `comunicaciones` ("Email enviado a X sobre vencimiento del Y") — la auditoría ve el envío.

UI de vencimientos: los botones email/lote llaman a `supabase.functions.invoke("enviar-aviso-vencimiento", ...)`. Si la función no está desplegada (error de invoke), fallback con prompt para marcar como avisado de todas formas. WhatsApp queda como plantilla preparada con aviso al usuario de que WhatsApp Business no está conectado todavía (honestidad > mock).

### Pantalla de auditoría

En `/configuracion` añadí tabs Sistema / Auditoría. La pestaña Auditoría muestra los últimos 40 cambios con cuándo (timestamp completo), tabla, acción (INSERT/UPDATE/DELETE con icono y color), por (email + rol del actor), record_id (truncado, full en tooltip), y campos modificados (lista de claves del diff). Botón Actualizar invalida el loader.

Limpié el panel Sistema: "Autenticación pendiente" → "Autenticación activa". Añadí bloque "Auditoría inmutable" explicando que es append-only por RLS + REVOKE. Añadí bloque "Servicios externos" con estado de Resend (Edge Function preparada + comandos de deploy) y Gemini (activo).

### Cierre

Typecheck final pasa limpio. Quedan warnings de accesibilidad (labels sibling en vez de htmlFor, button sin type) que son patrón preexistente del proyecto, no afectan funcionalidad. La auditoría final de los 6 módulos vs propuesta queda:

| Módulo | Estado |
|---|---|
| 1. CRM Clientes | 95% — ficha 360, comunicaciones, búsqueda NL, trazabilidad origen |
| 2. Pólizas | 95% — alta IA, ficha con anexos, siniestros, historial auditado |
| 3. Vencimientos | 85% — trigger auto, Edge Function email (pendiente deploy), WhatsApp como siguiente paso |
| 4. Comisiones | 90% — upload + IA + cruce línea×póliza + reporte detalle |
| 5. Facturación | 60% — exportación A3 real, falta flow "póliza firmada → factura" automática y conciliación bancaria |
| 6. Captación | 90% — pipeline interactivo, ROI real, trazabilidad lead→cliente |
| Bonus | Auth completa, auditoría inmutable RGPD, búsqueda NL, fichas detalle |

Lo que queda pendiente sin tocar:
- Cron real para vencimientos (ahora solo se calcula al abrir la página).
- WhatsApp Business API.
- Conciliación bancaria semi-automática (necesita lectura de extracto).
- Flow automático "póliza firmada → factura emitida".
- Histórico/anexos en cliente (hoy solo en póliza).
- Permisos por rol real (admin/comercial/backoffice) en RLS de producción — hoy todo es dev open.
