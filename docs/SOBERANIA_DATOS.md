# Soberanía del dato · Moneta

Estado de cumplimiento del **Bloque 8 de la propuesta MultiAtlas → Moneta Seguros**:

> *"No alquilamos servidor en California. Tus pólizas viven en Madrid.
> Bajo legislación española. Bajo RGPD europeo.
> Sin pasar por ninguna nube americana ni asiática para nada."*

## Estado a 2026-06-21

| Componente | Proveedor | País / Datacenter | Cumple soberanía UE |
|---|---|---|---|
| Base de datos | Supabase | París (eu-west-3) | 🟡 EU sí, no Madrid |
| Hosting de la aplicación | Railway | US East *(en migración)* | ❌ pendiente migrar a servidor con UPS de Rubén (Madrid) |
| Emails transaccionales y campañas | **Brevo** (ex-Sendinblue) | Francia (París + Alemania para failover) | ✅ |
| IA — extracción PDFs de pólizas + búsqueda natural | **Mistral La Plateforme** | Francia (París) + Suecia (Estocolmo) | ✅ |
| CDN / TLS | Cloudflare Workers (backup) | Red global anycast | 🟡 N/A |

## Migración aplicada el 2026-06-21

Para cerrar parcialmente el Bloque 8 sin esperar al servidor con UPS, sustituimos los dos proveedores SaaS estadounidenses por equivalentes europeos:

### Email transaccional · Resend (USA) → Brevo (Francia)

- **Empresa**: Brevo SA (antes Sendinblue), con sede en París.
- **Datacenters**: Francia y Alemania (almacenamiento de logs en UE).
- **Regulación**: CNIL (Francia) + RGPD europeo.
- **API**: `https://api.brevo.com/v3/smtp/email` con autenticación `api-key`.
- **Webhooks**: idéntica funcionalidad que Resend (delivered, opened, click, hard_bounce, soft_bounce, spam, unsubscribed) recibidos en `/functions/v1/webhook-resend` (ruta conservada para no romper redirects externos).
- **DPA RGPD**: público en `brevo.com/legal/`, firmable desde el panel.
- **Coste**: plan Free cubre 300 emails/día (~9.000/mes); plan Starter 9 €/mes para ~30.000.

**Variables de entorno nuevas**:
```
BREVO_API_KEY=xkeysib-...
BREVO_FROM_EMAIL=avisos@tudominio.es
BREVO_FROM_NAME=Moneta Seguros
```

**Variables de entorno retiradas**:
```
RESEND_API_KEY
RESEND_FROM_EMAIL
```

**Archivos modificados** (Edge Functions Supabase + frontend):
- `supabase/functions/enviar-aviso-vencimiento/index.ts`
- `supabase/functions/procesar-campana/index.ts`
- `supabase/functions/webhook-resend/index.ts`
- `src/routes/configuracion.webhooks.tsx`
- `src/routes/configuracion.tsx`
- `src/routes/comunicaciones.tsx`
- `src/routes/presupuestos.tsx`

**Migración SQL**: `20260621221000_v11_email_provider_brevo.sql`
- Renombra `email_eventos.resend_id` → `email_eventos.provider_msg_id`
- Añade `email_eventos.provider TEXT DEFAULT 'brevo'`
- Reemplaza índice `idx_email_eventos_resend` por `idx_email_eventos_provider_msg_id`

### IA · Google Gemini 1.5 Flash (USA) → Mistral La Plateforme (Francia)

- **Empresa**: Mistral AI SAS, fundada y con sede en París.
- **Datacenters**: Francia (París) y Suecia (Estocolmo). El **único proveedor 100 % europeo end-to-end** de la comparativa: empresa, infraestructura **y entrenamiento de modelos** en UE.
- **Regulación**: CNIL + RGPD europeo. Cero transferencia internacional de datos.
- **Modelos usados**:
  - `mistral-medium-latest` para extracción PDF (pólizas de seguros + informes de comisiones)
  - `mistral-small-latest` para clasificación + búsqueda en lenguaje natural
- **SDK**: `@ai-sdk/mistral` (oficial Vercel), API idéntica a `@ai-sdk/google`.
- **DPA RGPD**: público en `mistral.ai/terms`, firmable directo desde dashboard sin NDA.

**Variables de entorno nuevas**:
```
MISTRAL_API_KEY=...
```

**Variables de entorno retiradas**:
```
GOOGLE_GENERATIVE_AI_API_KEY
```

**Archivos modificados**:
- `src/lib/ai-search.ts`
- `src/lib/ai-comisiones.ts`
- `src/routes/polizas.tsx` (solo `extractPolicyFn`)
- `src/routes/configuracion.tsx`
- `package.json` (dep `@ai-sdk/google` retirada, `@ai-sdk/mistral` añadida)

## Lo que aún NO cumple Bloque 8

### Hosting de la aplicación (Railway · US East)

El bundle Node se sirve desde Railway con la cuenta personal del desarrollador. Esto NO cumple "infraestructura propia MultiAtlas en Madrid". Plan de salida:

1. Activar el servidor con UPS de Rubén (Madrid)
2. `docker build && docker run` con el `Dockerfile` ya existente
3. Apuntar dominio a la IP del servidor
4. Una vez verificado, apagar Railway

El código ya está preparado (`Dockerfile` multi-stage Node 22 + `server-node.mjs` Fetch→Node adapter). Solo falta acceso SSH al servidor de Rubén.

### Base de datos (Supabase · París)

Supabase es Europa pero NO Madrid ni infraestructura propia MultiAtlas. Opciones:

- **Opción A** (recomendada): mantener Supabase EU como está. Es el único proveedor managed RGPD con la combinación features (Auth + Realtime + Storage + Edge Functions + Postgres + RLS) que sería caro replicar. La promesa "Madrid" se cumple por implicación legal RGPD aunque el datacenter físico esté en París.

- **Opción B** (alternativa): self-hosted en el servidor con UPS de Rubén. Requiere mantener Postgres + GoTrue + Realtime + PostgREST + Storage + Edge Functions manualmente. Coste de mantenimiento alto, beneficio marginal.

## Coste estimado de la migración EU

| Concepto | Coste mensual antes | Coste mensual después | Δ |
|---|---|---|---|
| Email (Resend USA → Brevo Francia) | ~10 € (Pro tier) | 0 € en free / 9 € starter | -1 a -10 € |
| IA (Gemini Flash → Mistral medium) | ~30 € | ~30-40 € | +5-10 € |
| **Total** | **~40 €/mes** | **~30-40 €/mes** | **~0** |

La migración a EU no implica sobre-coste material.

## Decisiones técnicas relevantes

- **Webhook URL `/functions/v1/webhook-resend` no se renombra** para no invalidar la URL ya configurada en el panel del proveedor. La función ya parsea formato Brevo.
- **Pin de modelo en producción**: los alias `-latest` de Mistral pueden cambiar de versión sin aviso. Recomendado fijar a versión explícita (ej. `mistral-medium-2508`) tras validar calidad de extracción en pólizas reales.
- **Migración SQL idempotente**: el `RENAME COLUMN` va envuelto en `DO $$ ... EXCEPTION` para que aplicar la migración dos veces no rompa.
- **Backward compatibility en frontend**: `configuracion.webhooks.tsx` lee `ev.provider_msg_id || ev.resend_id` por si la migración SQL aún no se ha aplicado en alguna instancia.

## Validación posterior recomendada

1. **Probar extracción de PDF de póliza real con Mistral medium-latest** antes de declarar la migración estable. Si la calidad cae más del 10 % vs Gemini, plan B: cambiar a Azure OpenAI Sweden Central con `gpt-4.1-mini` (mismo SDK, datacenter UE).
2. **Verificar entrega de email en Brevo** con dominio verificado (SPF + DKIM + DMARC).
3. **Aplicar migración SQL** `20260621221000_v11_email_provider_brevo.sql` desde el SQL editor de Supabase (firewall bloquea 5432, usar pooler 6543).

---

Última actualización: **2026-06-21**
Commit: pendiente al cierre del cambio
Autor: MultiAtlas (Ricardo, con supervisión de Rubén Toledano)
