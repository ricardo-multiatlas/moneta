# Correduría OS — Estado Final del Proyecto

Cliente: **Moneta Seguros (Sevilla)**
Inicio: 2026-05-25 10:46 · Última actualización: 2026-05-27 (noche)
Duración: ~55 horas calendario · 3 jornadas
Proveedor: MultiAtlas

> **Auditoría completa**: ver [AUDITORIA_MATRIZ_DIEGO.md](./AUDITORIA_MATRIZ_DIEGO.md) para evaluación honesta de los 117 items de la matriz pedida por Diego (43 REAL / 40 PARCIAL / 8 STUB / 26 NO HECHO).
> **Replicar en otro SaaS**: ver [GUIA_DISENO_SAAS.md](./GUIA_DISENO_SAAS.md) — instrucciones para clonar este stack en otros verticales (clínica, legal, etc.).

## 🌐 Producción

**URL pública:** https://tanstack-start-app.makeflowia.workers.dev
**Proveedor:** Cloudflare Workers (plan Free)
**Subdominio:** `makeflowia.workers.dev` (gratis, ilimitado)
**SSL:** Let's Encrypt (TLS 1.2 / 1.3, ECDSA)
**Worker name:** `tanstack-start-app`
**Account ID:** `e36907f271781c7a4a4a7c5fd77cacaa`

---

## 1. Stack técnico

| Capa | Tecnología | Notas |
|---|---|---|
| Framework | TanStack Start (Vite 7) | SSR + file-based routing |
| UI | React 19 + Tailwind 4 + shadcn/ui | + lucide-react |
| Base de datos | Supabase Postgres (proyecto `ivkjpcgkrihixrdyvdsj`, región us-east-1) | Migrar a eu-west para cumplir RGPD literal |
| Auth | Supabase Auth (email + password) | Hook `useAuth` + AuthGate |
| Storage | Supabase Storage | Buckets `polizas-pdf`, `comisiones-reportes` |
| IA | Vercel AI SDK + Google Gemini 1.5 Flash | Vía OpenRouter / Google AI Studio |
| Email | Resend | Edge Function `enviar-aviso-vencimiento` |
| Exportación | xlsx (SheetJS) + jspdf | Excel y PDF en cliente |
| Despliegue | Vercel (pendiente) | `vercel.json` ya configurado |

---

## 2. Modelo de datos (Supabase Postgres)

### Tablas operativas

| Tabla | Filas-clave |
|---|---|
| `usuarios` | id (FK auth.users), email, nombre, **rol**, **zona_id**, **jefe_id**, **telefono**, **foto_url**, **iban_cifrado**, **activo**, oficina |
| `zonas` | id, nombre, descripcion, jefe_id (FK usuarios) |
| `clientes` | id, tipo, nombre_razon_social, nif_cif, email, telefono, direccion, estado, **comercial_asignado_id** |
| `polizas` | id, cliente_id, numero_poliza, aseguradora, ramo, fechas, prima_anual, comision_*, estado, pdf_url, datos_extraidos |
| `vencimientos` | id, poliza_id, fecha_vencimiento, estado (pendiente/avisado/renovado), dias_aviso |
| `comisiones_reportes` | id, aseguradora, mes_reportado, importes, diferencia, estado (+ Aprobado, Liquidado, Rechazado), **aprobado_por**, **aprobado_at**, notas, pdf_url |
| `comisiones_lineas` | id, reporte_id, numero_poliza, tomador, importe_declarado, importe_esperado, diferencia, poliza_id, estado_match |
| `facturas` | id, numero_factura, cliente_id, poliza_id, concepto, fechas, importe_total, estado |
| `leads` | id, nombre, origen, interes, comercial_asignado_id, valor_estimado, fecha_contacto, estado, **cliente_convertido_id** |
| `siniestros` | id, poliza_id, fechas, descripcion, importe_estimado, importe_pagado, estado, referencia_aseguradora |
| `polizas_anexos` | id, poliza_id, tipo, nombre, descripcion, file_url |
| `comunicaciones` | id, cliente_id, poliza_id, tipo (nota/llamada/email/whatsapp/reunion/sms), asunto, contenido, fecha |
| `presupuestos` | id, numero, cliente_id, cliente_nombre, lead_id, comercial_id, ramo, aseguradora, prima_anual, coberturas, fecha_validez, estado (borrador→enviado→aceptado→convertido), **poliza_convertida_id**, pdf_url |
| `liquidaciones` | id, comercial_id, periodo, importe_bruto, importe_neto, retencion, detalle JSONB, estado (borrador→aprobada→pagada), pdf_url, UNIQUE(comercial+periodo) |
| `plantillas` | id, nombre, tipo (contrato/recordatorio/presupuesto_email/renovacion/bienvenida), asunto, contenido con `{{placeholders}}`, variables[] |
| `campanas` | id, nombre, tipo (email/sms/whatsapp), plantilla_id, asunto, contenido, filtro_segmento JSONB, programada_para, estado, contadores enviados/aperturas/clicks |
| `campana_envios` | id, campana_id, cliente_id, destinatario, estado, proveedor_msg_id, enviado_at, abierto_at |

### Funciones SQL helper (RLS)

| Función | Devuelve | Usada por |
|---|---|---|
| `mi_rol()` | TEXT del rol del usuario actual | Helpers |
| `mi_zona()` | UUID de zona | Helpers |
| `es_root()` | BOOLEAN (root o admin) | Policies de todas las tablas |
| `es_jefe_zona()` | BOOLEAN | Policies con filtrado por zona |
| `es_comercial()` | BOOLEAN | Policies de scope individual |
| `es_secretaria()` | BOOLEAN | Policies que excluyen financiero |
| `mis_comerciales_ids()` | SETOF UUID con todos los IDs que puede ver el usuario | Filtrado de clientes por jerarquía |

### Tabla de auditoría inmutable

| Tabla | Propósito |
|---|---|
| `audit_logs` | Append-only. Cada INSERT/UPDATE/DELETE en las 11 tablas operativas inserta un registro con `actor_id`, `actor_email`, `actor_role`, `old_data`, `new_data`, `diff`. UPDATE y DELETE **revocados a nivel motor** (privilegios). Cumplimiento RGPD. |

### Trigger automático

- `trg_crear_vencimiento` — al insertar una póliza, crea su `vencimiento` con fecha y estado "pendiente".
- `fn_audit_trigger()` — instalado en las 11 tablas operativas vía helper `fn_install_audit(tabla)`.

### Storage

- Bucket `polizas-pdf` — PDFs de pólizas (originales subidos por IA y generados manualmente).
- Bucket `comisiones-reportes` — informes de aseguradoras subidos para conciliación.

### RLS (modo desarrollo)

Políticas abiertas (`USING true`) para anon + authenticated. **En producción** hay que sustituir por reglas basadas en `auth.uid()` + rol.

### Migraciones aplicadas

```
20260525120000_esquema_inicial.sql       → tablas base
20260525123000_fase3_fase4.sql           → comisiones, facturas, leads
20260526120000_fix_schema_y_rls_dev.sql  → alineación con código
20260526130000_audit_y_extensiones.sql   → audit_logs, siniestros, anexos, etc.
20260527140000_roles_zonas_rls.sql       → roles + zonas + RLS reales
20260527150000_fase_c_workflows.sql      → presupuestos, liquidaciones, plantillas, campañas
```

Todas aplicadas en la DB real.

### Matriz de roles y permisos (v0.4)

| Feature | root | jefe_zona | comercial | secretaria |
|---|---|---|---|---|
| Ver clientes | TODOS | su zona | suyos | TODOS |
| Crear clientes | ✅ | su zona | suyos | ✅ |
| Ver comisiones | ✅ | su zona | suyas | ❌ |
| Modificar comisiones | ✅ | ❌ | ❌ | ❌ |
| Gestionar usuarios | ✅ | ❌ | ❌ | ❌ |
| Gestionar zonas | ✅ | ❌ | ❌ | ❌ |
| Liquidaciones nómina | ✅ | ❌ | ❌ | ❌ |
| Dashboard ejecutivo | ✅ | su zona | personal | ❌ |
| Mi panel privado | — | — | ✅ | — |
| Mi equipo (ranking) | global | su zona | ❌ | ❌ |
| Tarificador / Presupuestos | ✅ | su zona | sus clientes | ❌ |
| Comunicaciones masivas | ✅ | su zona | ❌ | ❌ |
| Caducidades / Vencimientos | TODAS | su zona | suyas | TODAS |
| Facturación | ✅ | ✅ | ✅ | ❌ |
| Auditoría inmutable | ✅ | ❌ | ❌ | ❌ |
| 2FA TOTP | ✅ | ✅ | ✅ | ✅ |
| Foto perfil + IBAN | ✅ | ✅ | ✅ | ✅ |

---

## 3. Rutas de la aplicación

| Ruta | Función | Quién la ve | Estado |
|---|---|---|---|
| `/login` | Login / signup con Supabase Auth + 2FA TOTP | público | ✅ |
| `/` | Dashboard general: KPIs, vencimientos críticos, banner IA, gráfica leads semana | todos | ✅ |
| `/mi-panel` | Panel privado comercial: comisiones del mes, top 5 clientes, ranking en zona | **comercial** | ✅ |
| `/equipo` | Ranking comerciales con prima total. Root global, jefe filtrado a su zona | **root + jefe_zona** | ✅ |
| `/clientes` | Listado filtrado por RLS, filtro dropdown, búsqueda, Excel, RowActions | todos (filtrado) | ✅ |
| `/clientes/$id` | Ficha 360°: datos, pólizas, facturas, comunicaciones, origen del lead | todos (con permiso) | ✅ |
| `/polizas` | Listado, alta IA (PDF→datos), alta manual, RowActions | todos (filtrado) | ✅ |
| `/polizas/$id` | Ficha póliza: datos, visor PDF, anexos, siniestros, historial audit | todos (con permiso) | ✅ |
| `/vencimientos` | Listado por urgencia (7/30/60d), envío email Resend, RowActions | todos (filtrado) | ✅ |
| `/comisiones` | Upload informe + IA + cruce línea×póliza + modal detalle | root + jefe + comercial | ✅ |
| `/facturacion` | Listado, alta, exportación A3/Contasol/Sage (Excel) | root + jefe + comercial | ✅ |
| `/captacion` | Pipeline arrastrable, ROI real por canal, conversión lead→cliente | todos | ✅ |
| `/presupuestos` | Workflow borrador→enviado→aceptado→convertir a póliza | root + jefe + comercial | ✅ |
| `/tarificador` | Comparativa cotizaciones (modo demo, listo para APIs reales) | root + jefe + comercial | 🟡 stub |
| `/liquidaciones` | Nómina mensual de comerciales, retención IRPF, PDF justificante, Excel | **root** | ✅ |
| `/comunicaciones` | Campañas masivas (email/SMS/WhatsApp) + plantillas reutilizables | root + jefe_zona | ✅ |
| `/configuracion` | Tabs Sistema / Auditoría · conteos, seed demo, vaciar, últimos 40 cambios | todos | ✅ |
| `/configuracion/usuarios` | Alta/edición de usuarios, asignación rol y zona, activar/desactivar | **root** | ✅ |
| `/configuracion/zonas` | Alta/edición de zonas con asignación de jefe | **root** | ✅ |
| `/configuracion/perfil` | Foto, IBAN, teléfono, cambio password, **2FA TOTP real** | todos | ✅ |

---

## 4. Funcionalidades por módulo (vs propuesta original)

| Módulo propuesta | Implementado | Estado |
|---|---|---|
| **CRM 360°** + búsqueda NL | Ficha completa + búsqueda en lenguaje natural en topbar (intent estructurado, no SQL libre → inmune a inyección) | 95% |
| **Alta PDF con IA** | `extractPolicyFn` con Gemini, PDF original se sube a Storage y se vincula | 95% |
| **Vencimientos automáticos** | Trigger DB + Edge Function Resend para envío real de email | 85% (WhatsApp pendiente) |
| **Comisiones reconciliadas** | Upload archivo + `extractComisionFn` con Gemini + cruce línea×póliza | 90% |
| **Facturación A3/Contasol/Sage** | Exportación Excel con asiento contable real | 60% (falta auto-emisión desde póliza firmada) |
| **Captación trazable** | Pipeline + ROI real + FK `leads.cliente_convertido_id` | 90% |

### Bonus no estaban en la propuesta

- **Auditoría inmutable** (RGPD) — quién hizo qué, cuándo, qué cambió.
- **Login real** + AuthGate en todas las rutas.
- **DetailModal reutilizable** — el icono ojo en cada fila abre vista compacta sin navegar.
- **RowActions reutilizable** — ver / editar / imprimir / descargar en cada fila.
- **PDF generado en cliente** (jspdf) — fichas de cliente, póliza, factura, lead, vencimiento, todas descargables e imprimibles.
- **Seed de datos demo** + **purga total** en `/configuracion`.

---

## 5. Componentes y librerías propias

### Componentes UI

| Archivo | Función |
|---|---|
| `components/app/page-shell.tsx` | Layout principal con sidebar+topbar+AuthGate |
| `components/app/sidebar.tsx` | Nav lateral con usuario real y logout |
| `components/app/topbar.tsx` | Cabecera con búsqueda IA y AISuggestionBanner |
| `components/app/ui-bits.tsx` | Card, KpiCard, StatusBadge, RamoChip, MoneyEUR, Modal, SectionHeader |
| `components/app/row-actions.tsx` | Iconos ver/editar/imprimir/descargar reutilizables |
| `components/app/detail-modal.tsx` | Modal de vista rápida con filas clave-valor |

### Librerías propias (`src/lib`)

| Archivo | Función |
|---|---|
| `supabase.ts` | Cliente Supabase global |
| `ai-search.ts` | Búsqueda en lenguaje natural (intent → query Supabase) |
| `ai-comisiones.ts` | Extracción IA de informes de comisiones |
| `polizas-pdf.ts` | Genera y sube PDF de póliza a Storage |
| `generic-pdf.ts` | Generador PDF genérico (cliente/factura/lead/vencimiento) + descargarBlob + imprimirBlob |
| `exportar.ts` | Helper SheetJS para exportar a Excel |

### Hooks

| Archivo | Función |
|---|---|
| `hooks/use-auth.tsx` | Sesión Supabase Auth, signIn, signUp (crea perfil), signOut |
| `hooks/use-mobile.tsx` | Detección móvil |

### Edge Function

| Archivo | Función |
|---|---|
| `supabase/functions/enviar-aviso-vencimiento/index.ts` | Envía email vía Resend, marca vencimiento como avisado, registra comunicación |

---

## 6. Documentos del proyecto

| Archivo | Contenido |
|---|---|
| `docs/CHANGELOG.md` | Changelog técnico estándar por versión |
| `docs/BITACORA_TRABAJO.md` | Narrativa cronológica del trabajo, por fases |
| `docs/ESTADO_FINAL.md` | **Este documento** — estado completo |
| `BUSINESS_LOGIC.md` (raíz proyecto) | Plan maestro original |
| `supabase/APLICAR_EN_SQL_EDITOR.sql` | Script v1 idempotente (esquema + RLS dev) |
| `supabase/APLICAR_EN_SQL_EDITOR_v2.sql` | Script v2 idempotente (audit + extensiones) |

---

## 7. Configuración y secretos

### `.env`
```
VITE_SUPABASE_URL=https://ivkjpcgkrihixrdyvdsj.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_DB_URL=postgresql://postgres.ivkjpcgkrihixrdyvdsj:monetaTemporal123@aws-1-us-east-1.pooler.supabase.com:6543/postgres
```

### Secretos pendientes en Supabase Edge Functions
```bash
supabase functions deploy enviar-aviso-vencimiento --no-verify-jwt
supabase secrets set RESEND_API_KEY=re_AL34aacr_9pdNcwpVYdwWJdhXr4eyk3N1
supabase secrets set RESEND_FROM_EMAIL=onboarding@resend.dev
```

### Variable IA (server-side)
```
GOOGLE_GENERATIVE_AI_API_KEY=...   ← pendiente, requerida por @ai-sdk/google
```

---

## 8. Pendientes claros

1. **Activar IA en producción** — falta secret `GOOGLE_GENERATIVE_AI_API_KEY` en Cloudflare Worker. Sin ella: extracción PDF, comisiones IA y búsqueda NL no responden. Se saca gratis en https://aistudio.google.com/app/apikey.
2. **Desplegar Edge Function de Resend** — `supabase functions deploy enviar-aviso-vencimiento` para que los avisos de vencimiento se envíen de verdad.
3. **Migrar proyecto Supabase a región europea** para que la promesa de "soberanía de datos · Madrid" sea literal y no marketing.
4. **WhatsApp Business API** para vencimientos (ahora muestra plantilla).
5. **Auto-emisión de factura** al firmar póliza (flujo Póliza→Factura).
6. **Conciliación bancaria** semi-automática (lectura extracto).
7. **Cron real de vencimientos** (Supabase Cron + Edge Function ya escrita).
8. **Permisos por rol** (admin/comercial/backoffice) en RLS de producción.
9. **Resetear password DB** a una segura (ahora `monetaTemporal123` es solo para desarrollo).
10. **Configurar dominio + Resend con remitente verificado** (ahora usa `onboarding@resend.dev`).
11. **Borrar el Cloudflare API Token** usado para el deploy (ID `ed9039b0d96b763589ee9f5d264b0340`).

---

## 9. Cómo arrancar el proyecto

### Desarrollo local

```bash
npm install
npm run dev
# http://localhost:5173/login
```

### Aplicar/actualizar migraciones

```bash
SUPABASE_DB_PASSWORD='monetaTemporal123' supabase db push --linked
```

### Redeploy a Cloudflare (después de cambios)

```bash
CLOUDFLARE_API_TOKEN='<token>' npx wrangler deploy
```

### Configurar secret nuevo en el Worker (ej. API key de Gemini)

```bash
echo "TU_API_KEY" | npx wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY
npx wrangler deploy
```

### Desplegar Edge Function de Resend

```bash
supabase functions deploy enviar-aviso-vencimiento --no-verify-jwt
supabase secrets set RESEND_API_KEY=re_AL34aacr_9pdNcwpVYdwWJdhXr4eyk3N1
supabase secrets set RESEND_FROM_EMAIL=onboarding@resend.dev
```

### Ver logs en vivo del Worker

```bash
npx wrangler tail tanstack-start-app
```

---

## 10. Verificación rápida del estado

```bash
# Las 11 tablas existen en Supabase
curl -H "apikey: <SERVICE_ROLE_KEY>" \
  https://ivkjpcgkrihixrdyvdsj.supabase.co/rest/v1/audit_logs?select=*&limit=0
# → HTTP 200

# Typecheck limpio
npx tsc --noEmit
# → sin output = OK
```

---

## 11. Métricas de la sesión

- **Inicio**: 2026-05-25 10:46:33 (creación del repo)
- **Última edición**: 2026-05-26 16:50:26 (vencimientos.tsx)
- **Duración**: ~30 horas calendario en 2 jornadas
- **Archivos del proyecto creados/modificados**: 84 archivos `.tsx/.ts/.sql/.md`
- **Migraciones SQL aplicadas**: 4
- **Componentes React propios**: 6 (PageShell, Sidebar, Topbar, UiBits, RowActions, DetailModal)
- **Hooks propios**: 1 (useAuth)
- **Edge Functions**: 1 (enviar-aviso-vencimiento)
- **Server functions IA**: 3 (extractPolicyFn, extractComisionFn, naturalSearchFn)
- **Librerías propias**: 6 archivos en `src/lib`

---

## 12. Lo que NO está documentado aquí (no tengo acceso)

| Dato | Dónde verlo |
|---|---|
| Tokens consumidos en esta conversación | Claude Code: `/cost` |
| Plan Claude / Anthropic activo | https://claude.ai/settings/billing |
| Email asociado al plan | https://claude.ai/settings |

El email que el CLI reporta como `userEmail` es: **ricardomultiatlas@gmail.com**
