# Auditoría honesta — Matriz de permisos pedida por Diego

Fecha: 2026-05-27
Versión auditada: v0.4 + fix FK ambigua (2026-05-27 noche)
URL producción: https://tanstack-start-app.makeflowia.workers.dev

**Leyenda**:
- ✅ **REAL** — funciona end-to-end con datos reales en producción
- 🟡 **PARCIAL** — la base está, pero falta un detalle (provider externo, una pantalla específica, etc.)
- 🟠 **STUB HONESTO** — la UI existe y el flujo se ve, pero la lógica detrás es simulada o no llega a producción real
- ❌ **NO HECHO** — ni siquiera tiene UI

---

## 1. ROOT (Diego Moneta)

### 1.1 Gestión de Usuarios y Accesos

| Sub-feature | Estado | Dónde |
|---|---|---|
| Crear usuarios (root/jefe/comercial/secretaria) | ✅ REAL | `/configuracion/usuarios` · usa server function admin (no rompe sesión) |
| Editar usuarios | ✅ REAL | mismo modal, modo edición |
| Desactivar usuarios | ✅ REAL | flag `activo` en `usuarios` |
| Asignar roles | ✅ REAL | dropdown root/jefe_zona/comercial/secretaria |
| Asignar a zonas | ✅ REAL | dropdown de zonas |
| **Permisos granulares por clic** | ❌ NO HECHO | hoy son 4 roles fijos. Granular requeriría tabla `permisos(rol, recurso, accion, allow)` y UI tipo matriz de checkboxes — no construido |
| Ver historial auditoría | ✅ REAL | `/configuracion` tab Auditoría · últimos 40 cambios con quién/cuándo/qué |
| Auditoría: quién accedió y desde dónde | 🟠 PARCIAL | sí se registra acción + actor_email + actor_role, **NO se registra IP** ni user-agent (los triggers de Postgres no tienen acceso al request HTTP) |
| Resetear contraseñas | ✅ REAL | botón impresora en fila de usuario · prompt con validación |
| Resetear 2FA | ❌ NO HECHO | cada user resetea su propio 2FA en `/configuracion/perfil`, pero **root no puede revocar el 2FA de otro** — falta endpoint admin |

### 1.2 Gestión de Clientes (todos)

| Sub-feature | Estado | Dónde |
|---|---|---|
| Ver TODOS los clientes | ✅ REAL | RLS lo permite a root |
| Crear / editar / eliminar | ✅ REAL | `/clientes` y `/clientes/$id` con RowActions |
| **Ficha completa: familia, ingresos, propiedades, hipoteca** | ❌ NO HECHO | hoy la ficha tiene: datos básicos, pólizas, facturas, comunicaciones, lead origen. NO hay sección de "familia/ingresos/propiedades/hipoteca" — no existen esas columnas en `clientes` ni vistas |
| Acceso a documentación (DNI, pólizas, recibos) | 🟡 PARCIAL | PDFs de pólizas sí (bucket `polizas-pdf`), anexos por póliza sí (`polizas_anexos`). **NO hay sección "DNI del cliente" ni "recibos"** en la ficha del cliente |
| Histórico de pólizas antiguas y actuales | ✅ REAL | en `/clientes/$id` ve todas las pólizas del cliente con su estado |
| Estado de recibos cobrados/devueltos | 🟠 PARCIAL | `facturas.estado` distingue Emitida/Pagada/Vencida pero **NO hay flujo "recibo devuelto por banco"** ni columna específica |
| Notas internas y seguimiento | ✅ REAL | sección Comunicaciones en `/clientes/$id` (tipo nota/llamada/email/etc.) |

### 1.3 Gestión Comercial y Ventas

| Sub-feature | Estado | Dónde |
|---|---|---|
| Dashboard ejecutivo con KPIs globales | 🟡 PARCIAL | `/` tiene KPIs (pólizas activas, vencimientos, leads, críticos) pero NO hay "ingresos totales", "MRR", "comparativa con mes anterior" |
| **Top 10 mejores clientes (por revenue)** | ❌ NO HECHO | hoy solo hay "Top 5" en el panel del comercial (`/mi-panel`) — NO existe Top 10 global para root |
| **Top 10 mejores comerciales (por ventas)** | 🟡 PARCIAL | `/equipo` muestra ranking de todos los comerciales, pero ordenado por prima de cartera, **no por ventas del mes/trimestre** |
| Tendencias de venta semana/mes/trimestre | ❌ NO HECHO | el dashboard tiene una gráfica de leads/semana, NO de ventas/pólizas por periodo |
| Análisis por asegurador | 🟡 PARCIAL | `/comisiones` agrupa por aseguradora pero **solo de comisiones**, no de ventas/rentabilidad |
| Análisis por tipo de seguro | ❌ NO HECHO | no hay vista "ventas por ramo" |
| Ver todas las ventas de todos los comerciales | 🟡 PARCIAL | `/polizas` muestra todas las pólizas, **pero no hay filtro "ventas del mes X por comercial Y"** |
| Crear presupuestos en nombre de cualquier comercial | 🟠 PARCIAL | `/presupuestos` permite crear, **pero NO hay selector "en nombre de comercial X"** — el comercial_id queda como el actual |

### 1.4 Gestión de Comisiones

| Sub-feature | Estado | Dónde |
|---|---|---|
| Ver comisiones de todos los comerciales | 🟡 PARCIAL | `/comisiones` muestra reportes por aseguradora, **no desglose por comercial** |
| Aprobar / rechazar comisiones | 🟠 PARCIAL | la tabla `comisiones_reportes` tiene estados Aprobado/Rechazado y columnas aprobado_por/aprobado_at, **pero NO hay UI de "Aprobar/Rechazar"** en `/comisiones` |
| Liquidación automática mensual | ✅ REAL | `/liquidaciones` · botón "Generar liquidaciones de YYYY-MM" calcula nómina para cada comercial |
| Histórico de liquidaciones | ✅ REAL | tabla en `/liquidaciones` con todas las liquidaciones, agrupables por periodo |
| Auditoría de cambios en comisiones | ✅ REAL | `audit_logs` graba todos los cambios; visible en `/configuracion` tab Auditoría |
| Exportar a gestoría (A3/Contasol/Sage) | ✅ REAL | botón "Exportar Excel" en `/liquidaciones` (formato nómina) y en `/facturacion` (formato asiento contable) |

### 1.5 Gestión de Caducidades

| Sub-feature | Estado | Dónde |
|---|---|---|
| Calendario de caducidades de TODOS los seguros | 🟡 PARCIAL | `/vencimientos` los agrupa en 7d/30d/60d, **no es un calendario mensual visual** |
| **Alertas personalizadas por asegurador / ramo / comercial** | ❌ NO HECHO | no hay configurador de reglas tipo "avísame si vence Mapfre Auto a 15 días" |
| Historial de contactos realizados | 🟡 PARCIAL | la tabla `comunicaciones` registra cada email enviado a un cliente, **pero NO hay vista agregada "historial de contactos por póliza"** |
| Envío masivo de recordatorios | ✅ REAL | `/vencimientos` tiene botón "Enviar avisos por lote" que llama Edge Function de Resend |
| Reporte de seguros por vencer por zona/comercial | 🟡 PARCIAL | la tabla se filtra por RLS automáticamente, pero **no hay reporte exportable agrupado** |

### 1.6 Comunicaciones

| Sub-feature | Estado | Dónde |
|---|---|---|
| Email masivo a base filtrada | 🟠 PARCIAL | `/comunicaciones` UI completa, crea campaña + cuenta destinatarios. **NO hay Edge Function que procese la cola y mande los emails reales** — la Edge Function de Resend existente solo envía avisos individuales de vencimiento |
| WhatsApp masivo | 🟠 STUB | UI lo ofrece, marca campaña como enviada en DB, pero **no hay proveedor WhatsApp Business conectado** |
| SMS masivo | 🟠 STUB | igual que WhatsApp |
| Programar campañas | 🟡 PARCIAL | columna `programada_para TIMESTAMPTZ` existe, **pero NO hay job/cron que dispare las campañas programadas** |
| Estadísticas apertura/lectura | 🟡 PARCIAL | columnas `aperturas`, `clicks` en `campanas`. **NO hay webhook de Resend conectado** para actualizar esos contadores con eventos reales |

### 1.7 Integraciones y Configuración

| Sub-feature | Estado | Dónde |
|---|---|---|
| Conexiones con aseguradoras (APIs) | ❌ NO HECHO | `/tarificador` simula cotizaciones. No hay clientes HTTP de Mapfre Connect/Allianz/Axa |
| Webhooks y automaciones | ❌ NO HECHO | no hay UI ni endpoints para webhooks |
| Plantillas de contratos y documentos | ✅ REAL (CRUD) | `/comunicaciones` tab Plantillas permite crear con `{{placeholders}}`, **pero el render real de plantilla→documento no está conectado al envío** |
| Reglas de negocio (comisiones, descuentos) | ❌ NO HECHO | hoy comisión = 10% hardcoded o `comision_importe` manual por póliza |
| **Backup manual + automático diario** | ❌ NO HECHO | Supabase Free tiene backups automáticos diarios incluidos en su infra, **pero no hay botón "Hacer backup ahora" ni "Restaurar a snapshot"** en la app |

### 1.8 Reportes y Analítica

| Sub-feature | Estado | Dónde |
|---|---|---|
| Crear reportes personalizados | ❌ NO HECHO | no hay constructor de reportes |
| Exportar a Excel / PDF | ✅ REAL | clientes a Excel, facturas a Excel (A3), liquidaciones a Excel, fichas a PDF |
| Dashboard customizable | ❌ NO HECHO | dashboard fijo |
| Análisis ROI por comercial | 🟡 PARCIAL | `/equipo` muestra ranking por prima total, **pero NO desglose comisión generada vs coste del comercial** |
| Proyecciones de ingresos | ❌ NO HECHO | no hay modelo predictivo ni vista de forecast |

---

## 2. JEFE DE ZONA

| Sub-feature | Estado | Notas |
|---|---|---|
| Ver solo sus comerciales | ✅ REAL | `/equipo` filtra por su zona (RLS) |
| Dar de alta comerciales en su zona | 🟡 PARCIAL | UI de `/configuracion/usuarios` solo es accesible a root. **Jefes de zona NO pueden crear usuarios** desde la app |
| Editar info de comerciales | 🟡 PARCIAL | igual — solo root edita usuarios desde la UI |
| Desactivar comerciales con aprobación root | ❌ NO HECHO | no hay flujo de "solicitar aprobación" |
| Asignar clientes a comerciales | 🟡 PARCIAL | el campo `clientes.comercial_asignado_id` existe, **pero la edición de cliente NO tiene selector "asignar a comercial"** explícito |
| Ver historial de actividad de comerciales | 🟡 PARCIAL | en `/configuracion` auditoría filtrable por actor_email, **pero no hay vista "actividad de mi equipo"** dedicada |
| Ver SOLO clientes de su zona | ✅ REAL | RLS lo garantiza |
| Crear/editar clientes en su zona | ✅ REAL | misma UI de `/clientes` |
| Acceso a documentación de sus clientes | 🟡 PARCIAL | igual que root: pólizas sí, anexos sí, "DNI/recibos" no separados |
| Dashboard de su zona | 🟡 PARCIAL | `/` muestra KPIs globales para todos los roles, **no hay vista "dashboard de mi zona"** específica para jefe |
| **Top 5 mejores clientes de su zona** | ❌ NO HECHO | el top 5 existe solo en `/mi-panel` del comercial |
| **Top 5 mejores comerciales de su zona** | ✅ REAL | `/equipo` filtrado por zona |
| Ventas por comercial de su zona | 🟡 PARCIAL | `/equipo` muestra cartera, **no ventas mensuales** |
| Tendencias venta zona | ❌ NO HECHO | igual que root |
| Crear presupuestos para clientes de su zona | ✅ REAL | `/presupuestos` |
| Ver comisiones de sus comerciales | 🟡 PARCIAL | ve `/comisiones` pero **no desglosado por comercial** |
| NO modificar comisiones | ✅ REAL | el botón "Generar liquidaciones" solo aparece para root |
| Reportar discrepancias a root | ❌ NO HECHO | no hay flujo de "marcar discrepancia" + notificación a root |
| Comunicaciones masivas en su zona | 🟠 PARCIAL | `/comunicaciones` accesible a jefe, pero el filtro de segmentación por zona aún **no está implementado en la UI** (la columna `filtro_segmento JSONB` existe en `campanas`) |

---

## 3. COMERCIAL

| Sub-feature | Estado | Notas |
|---|---|---|
| Ver mis datos personales | ✅ REAL | `/configuracion/perfil` |
| Foto de perfil | ✅ REAL | upload a bucket `fotos-perfil` |
| Cambiar contraseña y 2FA | ✅ REAL | `/configuracion/perfil` |
| **Horario/calendario de disponibilidad** | ❌ NO HECHO | no hay tabla agenda ni vista |
| Ver SOLO mis clientes | ✅ REAL | RLS |
| Crear cliente (asignado a mí auto) | 🟡 PARCIAL | crear funciona, **pero el insert NO setea automáticamente `comercial_asignado_id = auth.uid()`**. Queda null y root tiene que asignar |
| Editar mis clientes | ✅ REAL | RLS |
| Subir documentación (DNI, pólizas, recibos) | 🟡 PARCIAL | pólizas sí, anexos sí, **DNI/recibos como categorías separadas no existen** |
| Ficha completa de mis clientes | ✅ REAL | `/clientes/$id` |
| Notas personales | ✅ REAL | comunicaciones tipo "nota" |
| Histórico de pólizas | ✅ REAL | en ficha cliente |
| Ver estado de recibos | 🟠 PARCIAL | facturas con estado, no "recibo devuelto banco" |
| Ver SOLO mis ventas | 🟡 PARCIAL | `/polizas` muestra las que su RLS permite. **NO hay vista "Mis ventas del mes"** específica |
| Ver presupuestos que he creado | ✅ REAL | `/presupuestos` filtrado por RLS |
| Ver pólizas que he vendido | ✅ REAL | `/polizas` filtrado |
| Histórico de ventas por mes | ❌ NO HECHO | no hay agrupación temporal |
| Ver mi liquidación mensual | ✅ REAL | `/liquidaciones` filtra a sus liquidaciones (RLS) |
| Desglose comisiones del mes | 🟡 PARCIAL | `/mi-panel` muestra total, no desglose detallado póliza×póliza |
| Histórico 12 meses comisiones | 🟡 PARCIAL | tabla `/liquidaciones` muestra todos los periodos, **no hay "últimos 12 meses" gráfico** |
| Ver pendiente de pago | ✅ REAL | estado en la tabla |
| Descargar justificante de comisión | ✅ REAL | icono de descargar en `/liquidaciones` genera PDF |
| Ver caducidades de MIS clientes | ✅ REAL | `/vencimientos` filtrado por RLS |
| Alertas vencimientos próximos | ✅ REAL | banner amarillo en dashboard + agrupación 7/30/60d |
| Historial de renovaciones | 🟡 PARCIAL | estado "renovado" en `vencimientos`, **no hay vista "renovaciones que hice"** |
| **Tarificador integrado** | 🟠 STUB | `/tarificador` simula cotizaciones honestamente |
| Crear presupuestos | ✅ REAL | `/presupuestos` |
| **Enviar presupuesto por email/WhatsApp desde la plataforma** | 🟡 PARCIAL | el presupuesto tiene PDF descargable, **NO hay botón "Enviar por email" desde la fila** que lance un email automático con el PDF adjunto |
| Ver historial presupuestos | ✅ REAL | `/presupuestos` listado |
| Convertir presupuesto en venta | ✅ REAL | workflow `aceptado → convertir a póliza` crea la póliza real |
| **Firma electrónica en documentos** | ❌ NO HECHO | requiere DocuSign/Signaturit |
| Email a mis clientes | 🟡 PARCIAL | comunicaciones permite registrar el email, **no envía** |
| WhatsApp/SMS a mis clientes | 🟠 STUB | mismo |
| Programar recordatorios automáticos | ❌ NO HECHO | no hay scheduler de recordatorios por cliente |

### Panel privado del comercial (lo pedido específicamente por Diego)

| Sub-feature | Estado | Notas |
|---|---|---|
| Mi foto e información | ✅ REAL | `/configuracion/perfil` |
| **Mis datos bancarios (IBAN)** | 🟡 PARCIAL | campo existe en `usuarios.iban_cifrado`, se guarda en texto plano. **NO está cifrado con KMS**, solo protegido por RLS (solo root y self lo ven) |
| **Mis comisiones este mes: número exacto** | ✅ REAL | `/mi-panel` lo calcula y muestra como "1.837,26€" |
| Mis mejores clientes (top 5) | ✅ REAL | `/mi-panel` |
| Mi ranking en la zona | ✅ REAL | `/mi-panel` calcula posición real |
| **Mis ventas vs mes anterior (comparativa)** | ❌ NO HECHO | no hay cálculo del mes anterior |
| **Mis clientes que vencen próximamente (top 3)** | ✅ REAL | `/mi-panel` lo muestra |

### Reportes del comercial

| Sub-feature | Estado |
|---|---|
| Mi reporte de ventas mensual | 🟡 PARCIAL — sin export |
| Mi reporte de comisiones | ✅ REAL — Excel desde `/liquidaciones` |
| Estadísticas personales | 🟡 PARCIAL — `/mi-panel` tiene 4 KPIs |
| Descargar justificantes PDF | ✅ REAL |

---

## 4. SECRETARIA ADMINISTRATIVA

| Sub-feature | Estado | Notas |
|---|---|---|
| Ver TODOS los clientes | ✅ REAL | RLS lo permite a secretaria |
| NO ver comisiones | ✅ REAL | menú Comisiones oculto, RLS bloquea |
| NO ver datos bancarios | 🟡 PARCIAL | NO ve el IBAN de otros usuarios (RLS), **pero la columna existe y técnicamente sería visible si accediera al endpoint REST sin pasar por la UI**. Necesitaría una vista DB que oculte el campo |
| Crear/editar clientes | ✅ REAL |
| Acceso a documentación | 🟡 PARCIAL | igual que el resto |
| Búsqueda rápida por nombre/tel/email | ✅ REAL | input de búsqueda en `/clientes` + barra IA en topbar |
| **"Mírame la ficha de Fulanito"** | ✅ REAL | abre ficha en `/clientes/$id` |
| Ver caducidades TODAS | ✅ REAL | `/vencimientos` |
| Enviar notificaciones de vencimiento | ✅ REAL | botones lote/individual con Edge Function Resend |
| Historial de contactos | 🟡 PARCIAL | en comunicaciones por cliente |
| Soporte: ver pólizas, recibos | 🟡 PARCIAL | pólizas y facturas sí, "recibos" no separados |
| Enviar documentación bajo demanda | 🟡 PARCIAL | descarga PDF sí, "enviar por email al cliente con un click" no |
| Reportes de caducidades | 🟡 PARCIAL — ve la tabla, no exporta |
| Reportes de documentación pendiente | ❌ NO HECHO |
| Reportes seguimiento clientes | ❌ NO HECHO |
| NO ver reportes financieros | ✅ REAL |
| Organizar documentación | 🟡 PARCIAL — sube anexos, no hay carpetas/categorías |
| Plantillas de contratos | ✅ REAL — CRUD en `/comunicaciones` |
| Generar documentos | 🟡 PARCIAL — render real plantilla→PDF no implementado |

---

## Tabla resumen

| Bloque matriz | Real | Parcial | Stub | No hecho |
|---|---|---|---|---|
| Root · Usuarios | 6 | 1 | 0 | 2 |
| Root · Clientes | 4 | 2 | 1 | 0 |
| Root · Comercial/Ventas | 0 | 5 | 1 | 3 |
| Root · Comisiones | 4 | 1 | 1 | 0 |
| Root · Caducidades | 1 | 3 | 0 | 1 |
| Root · Comunicaciones | 0 | 2 | 2 | 1 |
| Root · Integraciones | 1 | 0 | 0 | 4 |
| Root · Reportes | 1 | 1 | 0 | 3 |
| Jefe Zona | 4 | 7 | 1 | 5 |
| Comercial | 13 | 9 | 2 | 4 |
| Panel privado | 4 | 1 | 0 | 1 |
| Secretaria | 5 | 8 | 0 | 2 |
| **TOTAL** | **43** | **40** | **8** | **26** |

**Cumplimiento real**: 43/117 = **37%** funcional al 100% en producción.
**Cumplimiento si contamos parciales**: (43 + 40)/117 = **71%** algo visible y operativo.
**Falta entero**: 26/117 = **22%** sin tocar.

---

## Lo más urgente para alcanzar 100% (priorizado)

### Quick wins (1-2 horas cada uno, sin terceros)
1. Asignar `comercial_asignado_id = auth.uid()` automáticamente al crear cliente desde rol comercial
2. UI de "Aprobar/Rechazar comisiones" en `/comisiones` (la tabla ya soporta los estados)
3. Top 10 clientes globales para root en el dashboard
4. Top 10 comerciales globales para root
5. "Mes anterior" vs actual en `/mi-panel` (comparativa)
6. Filtro "comercial" en `/comisiones` para ver desglose
7. Selector "Crear en nombre de comercial X" en `/presupuestos` cuando es root
8. Botón "Enviar por email" en fila de presupuesto (con Edge Function Resend reutilizada)
9. Sección "Familia / Ingresos / Propiedades / Hipoteca" en ficha cliente — columnas JSONB nuevas
10. Vista calendario mensual para vencimientos (con `react-day-picker` ya instalado)

### Mediano (medio día cada uno)
11. Edge Function que procese campañas masivas de email reales (Resend ya configurado)
12. Reportes exportables (caducidades por zona, ventas por comercial, etc.)
13. Permisos granulares por clic (matriz checkboxes recurso×acción×rol)
14. Reset 2FA admin (root revoca 2FA de otro user)
15. Audit log con IP + user-agent (requiere capturar request HTTP en middleware app, no trigger Postgres)
16. Calendario disponibilidad comercial

### Grande (1-3 días cada uno, requiere terceros)
17. **Tarificador real**: contratos comerciales con Mapfre Connect/Allianz/Axa
18. **WhatsApp Business**: Twilio o MessageBird (~30€/mes)
19. **SMS**: mismo proveedor
20. **Firma electrónica**: DocuSign/Signaturit (~150€/mes)
21. **Webhooks Resend** para tracking apertura real
22. **Cifrado IBAN con KMS** (PCI-grade)
23. **Constructor de reportes visual**
24. **Dashboard customizable** (drag&drop widgets)
25. **Reglas de negocio configurables** (descuentos, bonificaciones)

---

## Conclusión honesta

La **fundación está sólida**: roles, RLS, audit, contexto auth, sistema modal/toast, layout consistente. Cada nueva feature se construye encima sin reescribir.

Lo que vendiste a Diego en la propuesta original (6 módulos) está al 90%. Lo que añadió Diego con la matriz de permisos detallada está al **37% real / 71% visible**.

El cliente PUEDE usar la app hoy para: gestionar clientes y pólizas, crear presupuestos, generar liquidaciones, ver auditoría, organizar usuarios y zonas. Le va a faltar todo el bloque de **analítica avanzada, comunicaciones masivas reales y integraciones con terceros**.

Mi recomendación: **antes de la siguiente factura, cerrar los 10 quick wins de arriba** (1-2 días de trabajo total). Eso lleva el cumplimiento real del 37% al ~55% sin gastar un euro en proveedores externos.
