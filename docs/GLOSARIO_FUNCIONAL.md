# Glosario funcional · Correduría OS

Definición de cada pantalla, módulo y concepto del SaaS. Para usuarios finales (no técnicos) y para nuevos desarrolladores que necesitan entender qué hace cada parte sin leer código.

---

## Conceptos generales

**Correduría OS**
Nombre comercial del producto. CRM + ERP a medida para corredurías de seguros, vendido por MultiAtlas. Cliente piloto: Moneta Seguros (Sevilla).

**Matriz de permisos por rol**
Documento maestro que define qué puede hacer cada rol (root, jefe de zona, comercial, secretaria). El sistema aplica esta matriz a nivel de base de datos (RLS) y de interfaz (UI gates).

**RLS (Row Level Security)**
Característica de PostgreSQL/Supabase que filtra filas a nivel de base de datos según el usuario que pregunta. Significa que un comercial no puede ver clientes ajenos aunque pegue la URL directa: la base de datos le devuelve 0 filas porque sus políticas RLS no se cumplen para esa fila.

**SSR (Server-Side Rendering)**
La primera versión del HTML la genera el servidor (Cloudflare Worker), no el navegador. Beneficio: la página llega lista para ver, sin tener que esperar a que JavaScript construya el DOM. Implementado con TanStack Start.

**SPA (Single Page Application)**
Tras la carga inicial, las navegaciones entre rutas no recargan la página entera, solo el contenido. Implementado con TanStack Router.

**PWA (Progressive Web App)**
La aplicación se puede instalar como una app nativa en escritorio y móvil. Funciona offline para assets estáticos. Implementado con manifest.webmanifest + sw.js.

**Audit log**
Registro inmutable de cada operación que modifica datos. Quién, qué, cuándo, desde qué IP, y qué cambió. Solo el Root ve la auditoría.

---

## Roles

**Root (Diego Moneta)**
Administrador total. Ve y modifica todo. Único que gestiona usuarios, modifica comisiones y ve auditoría.

**Jefe de zona**
Gestiona su equipo de comerciales y los clientes de esos comerciales. Cada zona tiene un jefe único. No ve datos de otras zonas.

**Comercial / Vendedor**
Trabaja con sus propios clientes. Crea pólizas, presupuestos, gestiona vencimientos. Solo ve lo suyo.

**Secretaria administrativa**
Rol de soporte. Ve todos los clientes para apoyar a comerciales por teléfono, pero no ve datos financieros (comisiones, IBAN). Rol pedido específicamente por Diego.

---

## Pantallas del menú lateral

### `/` — Panel general
**Qué es**: Dashboard ejecutivo de la correduría completa.
**Qué hace**: Muestra KPIs globales (pólizas activas, vencimientos 60d, leads activos, vencimientos críticos). Lista próximos vencimientos críticos. Últimos clientes registrados. Para Root: Top 10 clientes globales y Top 10 comerciales por prima total.
**Para qué sirve**: Visión rápida del estado del negocio sin meterse en cada módulo.
**Quién la usa**: Root y secretaria principalmente. Comercial y jefe ven versiones específicas.

### `/mi-dashboard` — Mi dashboard personalizado
**Qué es**: Dashboard que el propio usuario configura con los widgets que más le interesan.
**Qué hace**: 12 widgets disponibles en catálogo (KPIs, Top X, vencimientos críticos, etc.). El usuario añade los que quiere, los reordena, cambia tamaño (S/M/L/XL), oculta los que no usa. Cambios persisten en BD por usuario.
**Para qué sirve**: Cada rol ve la información que le importa sin ruido del resto.
**Quién la usa**: Todos.

### `/mi-panel` — Panel privado del comercial
**Qué es**: Pantalla principal del comercial (su "home").
**Qué hace**: Muestra su foto, datos de contacto, IBAN para domiciliación, comisiones del mes con importe exacto, top 5 mejores clientes, ranking en su zona, comparativa de ventas vs mes anterior, top 3 clientes que vencen.
**Para qué sirve**: Que el comercial vea su negocio personal de un vistazo. Feature pedida específicamente por Diego.
**Quién la usa**: Comercial.

### `/dashboard-zona` — Dashboard del jefe de zona
**Qué es**: Dashboard limitado al alcance de la zona.
**Qué hace**: KPIs de la zona (total comerciales, clientes, pólizas activas, prima total). Ranking de los comerciales bajo su mando. Top 5 mejores clientes de la zona.
**Para qué sirve**: El jefe ve cómo va su zona sin contaminar con datos de otras.
**Quién la usa**: Jefe de zona.

### `/equipo` — Mi equipo
**Qué es**: Lista de comerciales activos con sus métricas.
**Qué hace**: Tabla con cada comercial, su zona, su número de clientes, pólizas activas, prima total anual. El Root ve todos; el jefe solo los de su zona.
**Para qué sirve**: Comparar rendimiento, identificar quién necesita ayuda, quién es el top.
**Quién la usa**: Root, jefe de zona.

### `/clientes` — Cartera de clientes
**Qué es**: Listado paginado de clientes con filtros y búsqueda.
**Qué hace**: Muestra nombre, NIF/CIF, comercial asignado, número de pólizas activas, prima total, estado. Permite crear, editar, ver ficha 360°, eliminar (Root). Búsqueda por nombre/NIF/email, filtro por tipo (particular/empresa). Paginación de 50 filas (configurable hasta 250).
**Para qué sirve**: El núcleo del CRM. Toda la cartera viva.
**Quién la usa**: Todos según RLS.

### `/clientes/$id` — Ficha 360° del cliente
**Qué es**: Toda la información del cliente en una pantalla.
**Qué hace**: Datos básicos + familia (cónyuge, hijos), ingresos, propiedades, hipoteca, notas internas, lista de pólizas (antiguas y actuales), historial de comunicaciones, documentos subidos (DNI, contratos), historial de auditoría (solo Root).
**Para qué sirve**: Tener TODO sobre el cliente sin abrir 5 pantallas.
**Quién la usa**: Root, jefe (su zona), comercial (sus clientes), secretaria.

### `/polizas` — Pólizas
**Qué es**: Listado paginado de pólizas.
**Qué hace**: Muestra número póliza, cliente, ramo (Auto/Hogar/Vida/etc), aseguradora, prima, comisión, vencimiento, estado. Permite alta manual o alta con IA (subir PDF → Gemini extrae datos). Imprimir póliza, descargar PDF.
**Para qué sirve**: Gestionar el portfolio de pólizas.
**Quién la usa**: Todos según RLS.

### `/polizas/$id` — Detalle de póliza
**Qué es**: Ficha completa de una póliza.
**Qué hace**: PDF original (visor), anexos, siniestros declarados, historial de cambios (auditoría), comunicaciones relacionadas con esta póliza.
**Para qué sirve**: Trazabilidad completa de la póliza.
**Quién la usa**: Todos según RLS.

### `/vencimientos` — Vencimientos próximos
**Qué es**: Pólizas que vencen en los próximos 60 días.
**Qué hace**: Lista agrupada por urgencia (≤7 días = críticos, ≤30, ≤60). Acciones: renovar (precarga datos), enviar aviso por email al cliente, marcar como contactado.
**Para qué sirve**: Que ninguna póliza venza sin que la correduría haya intentado renovarla. Retención de cliente.
**Quién la usa**: Todos según RLS.

### `/vencimientos/calendario` — Calendario visual
**Qué es**: Vista de calendario mensual con los vencimientos como eventos.
**Qué hace**: Click en un día → ves todos los vencimientos de ese día. Útil para planificación semanal.
**Para qué sirve**: Visualización temporal en lugar de tabular.
**Quién la usa**: Todos según RLS.

### `/comisiones` — Comisiones
**Qué es**: Gestión de comisiones por póliza y reportes mensuales por aseguradora.
**Qué hace**:
- Tab "Por póliza": cada póliza activa muestra su comisión calculada por el sistema.
- Tab "Reportes mensuales": el Root sube el PDF/Excel que la aseguradora le manda con el detalle de comisiones. IA cruza con las pólizas del sistema y detecta discrepancias.
- El Root aprueba/rechaza cada reporte.
**Para qué sirve**: Auditar que la aseguradora paga lo que corresponde y trazar las diferencias.
**Quién la usa**: Root (todas), jefe (su zona), comercial (las suyas).

### `/facturacion` — Facturación
**Qué es**: Listado paginado de facturas emitidas por la correduría.
**Qué hace**: Muestra número factura, cliente, concepto, fecha emisión, fecha vencimiento, importe, estado. Exportar Excel formato A3/Contasol. Imprimir y descargar PDF.
**Para qué sirve**: Llevar la facturación interna de la correduría a sus clientes.
**Quién la usa**: Root, jefe de zona.

### `/captacion` — Pipeline de leads
**Qué es**: Embudo de captación de nuevos clientes.
**Qué hace**: Estados: Nuevo → Cualificado → Presupuesto → Cliente. ROI por fuente de lead. Conversión lead → cliente con un click.
**Para qué sirve**: Trackear de dónde vienen los nuevos clientes y cuál es el coste de adquisición.
**Quién la usa**: Todos.

### `/analisis` — Análisis comercial
**Qué es**: Dashboard analítico para tomar decisiones de negocio.
**Qué hace**: 4 tabs:
- **Por aseguradora**: cuál vende más, rentabilidad por compañía.
- **Por ramo**: Auto vs Hogar vs Vida vs Salud, etc.
- **Por comercial**: ranking con trofeo al líder.
- **Tendencia mensual**: gráfica de barras de los últimos 12 meses.
**Para qué sirve**: Saber qué línea de negocio escalar y qué comerciales necesitan ayuda.
**Quién la usa**: Root, jefe de zona (limitado a su zona).

### `/presupuestos` — Presupuestos
**Qué es**: Flujo borrador → enviado → aceptado → convertido en póliza.
**Qué hace**: Crear presupuesto para un cliente, enviar por email/WhatsApp, hacer seguimiento, convertirlo en póliza con un click si el cliente acepta.
**Para qué sirve**: Pre-venta organizada. Histórico de qué se ofertó.
**Quién la usa**: Root, jefe de zona, comercial.

### `/tarificador` — Tarificador
**Qué es**: Comparador multi-aseguradora.
**Qué hace**: El comercial introduce datos del riesgo a asegurar (auto, hogar, etc.). El sistema consulta las APIs de las aseguradoras configuradas en `/configuracion/integraciones` y devuelve precios reales. Hoy es **stub honesto** hasta que se firmen contratos comerciales.
**Para qué sirve**: Que el comercial dé un precio en el momento sin tener que llamar a cada aseguradora.
**Quién la usa**: Root, jefe de zona, comercial.

### `/comunicaciones` — Campañas masivas
**Qué es**: Centro de envío de emails / WhatsApp / SMS.
**Qué hace**: Plantillas reutilizables. Filtrado de destinatarios. Programación. Estadísticas de apertura/click vía webhook de Resend. Email funciona con Resend (real). WhatsApp/SMS son stubs hasta integrar Twilio.
**Para qué sirve**: Comunicación masiva con la base de datos sin salir del sistema.
**Quién la usa**: Root, jefe de zona.

### `/liquidaciones` — Liquidaciones mensuales
**Qué es**: Generación de nóminas/liquidaciones a comerciales.
**Qué hace**: Cierra el mes y calcula cuánto se le debe a cada comercial según las reglas de comisión y las pólizas activas. Exporta Excel para la gestoría.
**Para qué sirve**: Automatizar el cálculo de lo que cobra cada comercial.
**Quién la usa**: Root.

### `/firmas` — Firmas electrónicas
**Qué es**: Gestión de documentos enviados a firmar (presupuestos aceptados, pólizas, anexos).
**Qué hace**: Estado del documento (enviado, visto, firmado, expirado). Hoy es **stub** hasta integrar DocuSign o Signaturit.
**Para qué sirve**: Cerrar contratos sin papel.
**Quién la usa**: Root, jefe, comercial.

### `/reportes` — Reportes predefinidos
**Qué es**: 5 reportes de uso frecuente listos para exportar a Excel.
**Qué hace**:
- Ventas por comercial (mes filtrable).
- Caducidades por zona (60 días).
- Documentación pendiente (clientes sin DNI o email).
- Seguimiento de clientes (>60 días sin actividad).
- Ranking de aseguradoras (por prima total).
**Para qué sirve**: Reportes operativos sin tener que pensar en cómo construirlos.
**Quién la usa**: Root, jefe (su zona), secretaria (solo operativos, no financieros).

### `/reportes/constructor` — Constructor visual de reportes
**Qué es**: Herramienta para hacer reportes personalizados sin programar.
**Qué hace**: Eliges entidad (pólizas, clientes, leads, etc.), columnas, filtros (operadores: =, !=, >, <, like, in, is null, etc.), orden. Guardas el reporte como plantilla. Ejecutas → exporta a Excel. Opcionalmente compartes la plantilla con el resto del equipo.
**Para qué sirve**: Que el Root o jefe de zona pueda responder a preguntas ad-hoc ("dame todos los clientes empresa con pólizas Auto que vencen antes de septiembre") sin pedírselo a un técnico.
**Quién la usa**: Root, jefe de zona.

### `/aprobaciones` — Aprobaciones pendientes
**Qué es**: Flujo de solicitudes jefe → root.
**Qué hace**: Cuando un jefe quiere desactivar un comercial o eliminar un cliente, en lugar de hacerlo directamente crea una solicitud. El Root la ve aquí con motivo, aprueba o rechaza con comentario. Si aprueba, el cambio se aplica automáticamente.
**Para qué sirve**: Control jerárquico. Operaciones sensibles requieren visto bueno del Root.
**Quién la usa**: Root (aprobador), jefe zona (solicitante), secretaria (lectura).

### `/configuracion` — Centro de configuración
**Qué es**: Panel principal de configuración con 8 atajos.
**Qué hace**: Acceso a:
1. Usuarios y equipo
2. Zonas comerciales
3. Permisos granulares
4. Reglas comisión
5. Backups y restore
6. Alertas vencimientos
7. Integraciones aseguradoras
8. Webhooks
Además, tab de **Auditoría** con últimas 40 operaciones registradas.
**Para qué sirve**: Single point para todos los ajustes del sistema.
**Quién la usa**: Principalmente Root.

### `/configuracion/usuarios` — Usuarios y equipo
**Qué es**: Gestión de los usuarios del sistema.
**Qué hace**: Listar, crear, editar usuarios. Asignar rol, zona, jefe directo. Reset password. Reset 2FA. Desactivar (root directo, jefe vía aprobación).
**Para qué sirve**: Onboarding y offboarding del equipo.
**Quién la usa**: Root, jefe de zona (limitado a su zona).

### `/configuracion/zonas` — Zonas comerciales
**Qué es**: Definición de las zonas geográficas o de mercado.
**Qué hace**: CRUD de zonas. Cada zona tiene un nombre, descripción y un jefe asignado.
**Para qué sirve**: Estructurar el equipo. La RLS usa la zona para filtrar lo que ve cada jefe.
**Quién la usa**: Root.

### `/configuracion/permisos` — Permisos granulares
**Qué es**: Override del comportamiento por defecto de cada rol.
**Qué hace**: Matriz rol × recurso × acción × permitido (true/false). Permite excepciones (ej. "que esta secretaria SÍ pueda ver comisiones").
**Para qué sirve**: Flexibilidad cuando los 4 roles base no son suficientes.
**Quién la usa**: Root.

### `/configuracion/reglas-comision` — Reglas de comisión
**Qué es**: Definición de los porcentajes que la correduría paga por póliza.
**Qué hace**: Lista de reglas con prioridad. Cada regla aplica a un ramo, aseguradora, comercial específicos (o vacío = todos). Define porcentaje + bono fijo + fechas de vigencia.
**Para qué sirve**: Calcular comisiones automáticamente. Permite reglas excepcionales temporales.
**Quién la usa**: Root.

### `/configuracion/backup` — Backups
**Qué es**: Estado de los backups automáticos + utilidad para backup manual.
**Qué hace**: Muestra cuándo fue el último backup automático de Supabase. Botón para generar backup manual (parcial — vamos a completar). Restaurar desde backup (pendiente).
**Para qué sirve**: Seguridad y compliance RGPD.
**Quién la usa**: Root.

### `/configuracion/alertas` — Alertas de vencimiento
**Qué es**: Configurador de avisos automáticos pre-vencimiento.
**Qué hace**: CRUD de alertas. Cada alerta: ramo + aseguradora + comercial/zona + días antes + canal (email/SMS/WhatsApp/sistema) + destinatarios extra. El cron diario lee esta tabla y dispara los avisos.
**Para qué sirve**: Que ninguna póliza venza sin que alguien (cliente, comercial, jefe) haya sido avisado.
**Quién la usa**: Root, jefe de zona.

### `/configuracion/integraciones` — Integraciones aseguradoras
**Qué es**: Repositorio de credenciales API para las aseguradoras.
**Qué hace**: Lista de aseguradoras (Mapfre, Allianz, Axa, Generali, Reale, Caser, Mutua). Para cada una: API key, endpoint, estado (inactiva/sandbox/producción). El tarificador y otros módulos las consultan.
**Para qué sirve**: Que el sistema se conecte a las aseguradoras para precios reales y emisión directa.
**Quién la usa**: Root.

### `/configuracion/webhooks` — Webhooks
**Qué es**: Dos secciones distintas en una pantalla.
**Qué hace**:
- **Salientes**: el sistema envía POST a una URL externa cuando ocurre un evento (`poliza.creada`, `cliente.actualizado`, etc.). Útil para sincronizar con gestoría, ERP, etc.
- **Email events**: tabla con los últimos 50 eventos recibidos del webhook de Resend (envíos, aperturas, clicks, rebotes).
**Para qué sirve**: Integración con el ecosistema del cliente sin programar puntos a medida.
**Quién la usa**: Root.

### `/configuracion/perfil` — Mi perfil
**Qué es**: Editor de los datos personales del usuario logueado.
**Qué hace**: Foto, teléfono, IBAN (para comerciales — domiciliación de comisiones). Cambio de contraseña. Activación de 2FA.
**Para qué sirve**: Que cada usuario mantenga sus datos sin necesidad de admin.
**Quién la usa**: Todos.

### `/login` — Inicio de sesión
**Qué es**: Pantalla de login + signup.
**Qué hace**: Formulario email + password. Si tiene 2FA activo, pide código TOTP. Modo signup desactivado en producción (los usuarios solo se crean desde `/configuracion/usuarios`).
**Para qué sirve**: Autenticación.
**Quién la usa**: Todos (no autenticados).

---

## Conceptos técnicos del sistema

**Edge Function**
Pequeñas funciones backend que corren en Supabase Edge Runtime (Deno). En Moneta hay 4:
- `procesar-campana` — envía emails masivos de una campaña.
- `enviar-aviso-vencimiento` — el cron diario llama a esta para mandar los avisos.
- `webhook-resend` — recibe eventos de Resend (aperturas, clicks, rebotes).
- `audit-with-ip` — envuelve mutaciones (delete/update) para capturar IP del cliente y registrarla en audit_logs.

**Cron job (pg_cron)**
Tarea programada que corre en la base de datos. `avisar_vencimientos_diario` corre todos los días a las 08:00 UTC e invoca la edge function de avisos.

**Service Worker (sw.js)**
Script del navegador que cachea assets para la PWA. Solo cachea archivos hash-versionados de `/assets/`. No toca navegación ni peticiones a Supabase.

**Manifest (manifest.webmanifest)**
Archivo JSON que describe la app para que el navegador la pueda instalar como PWA. Define nombre, icono, color, shortcuts a rutas frecuentes.

**Worker (Cloudflare Workers)**
Donde corre el SSR de Moneta. URL `https://tanstack-start-app.makeflowia.workers.dev`. Compilado desde `src/server.ts`. Cada request entra aquí, ejecuta el loader de la ruta, renderiza HTML, lo devuelve al navegador.

**JWT (JSON Web Token)**
Token que prueba quién eres ante Supabase. Lo emite el endpoint `/auth/v1/token` tras login válido. El cliente lo guarda en localStorage y lo envía en cada petición como `Authorization: Bearer ...`. PostgreSQL lee el claim `sub` (id del usuario) y eso es lo que devuelve `auth.uid()` en las RLS.

**Supabase**
La plataforma backend (BaaS) que usamos. Proporciona PostgreSQL + Auth + Storage + Edge Functions + Realtime. Proyecto principal `ivkjpcgkrihixrdyvdsj` en `us-east-1` (en migración a `eu-west-3`).

**Service role key**
Credencial que bypasea las RLS (acceso de admin). Solo se usa en el servidor (Cloudflare Worker) para operaciones administrativas como crear usuarios. NUNCA en el cliente.

**Anon key**
Credencial pública. Permite operaciones según RLS del usuario autenticado. Es la que el navegador del usuario tiene.

**RoleGate**
Componente React que envuelve UI y solo la muestra si el rol del usuario actual está en la lista permitida. Sirve para ocultar botones/secciones que no aplican al rol. La seguridad de verdad la da la RLS; RoleGate es UX para no enseñar lo que el usuario no va a poder usar.

---

Versión: **v1.0 · 2026-05-28**
Sistema: **Correduría OS · Moneta Seguros · v0.9**
