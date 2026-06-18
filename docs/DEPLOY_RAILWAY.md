# Deploy en Railway · Moneta

Guía paso a paso para desplegar Moneta en Railway desde cero. Probado y verificado el 2026-06-08.

URL de la app desplegada (referencia): <https://moneta-production-b65b.up.railway.app>

---

## Resumen del stack

- **Hosting**: Railway (Docker build a partir del `Dockerfile` del repo)
- **Runtime**: Node.js 22 Alpine
- **Build**: `npm install` + `npm run build` (Vite + TanStack Start)
- **Server entry**: `server-node.mjs` (wrapper que adapta el handler Fetch API a `http.createServer` de Node)
- **Base de datos**: Supabase EU (`eu-west-3` · París)
- **Emails**: Resend
- **IA**: Google Gemini Flash (búsqueda natural, alta de pólizas por PDF, conciliación de comisiones)

---

## Requisitos previos

1. Cuenta en Railway con un workspace donde crear el proyecto
2. Acceso al repo `https://github.com/ricardo-multiatlas/moneta` (o el repo equivalente del cliente)
3. Acceso al proyecto Supabase ya creado, o capacidad de crear uno nuevo siguiendo `docs/GUIA_DEPLOY.md`
4. API key de Resend (la que sirve emails transaccionales)
5. API key de Google AI Studio (la que devuelve la búsqueda IA)

---

## Pasos

### 1. Crear el servicio en Railway

1. En el dashboard de Railway → **New Project** → **Deploy from GitHub repo**
2. Selecciona el repo `ricardo-multiatlas/moneta` (o el correspondiente)
3. Rama: `main`
4. Railway detecta el `Dockerfile` automáticamente y empieza el build

### 2. Generar dominio público

Por defecto el servicio queda con `private networking` y sin acceso desde Internet.

- Settings del servicio → **Networking** → **Generate Domain**
- Railway asigna una URL del tipo `nombre-production-xxxx.up.railway.app` con SSL ya incluido

### 3. Configurar variables de entorno

Settings del servicio → **Variables** → añadir cada una de estas 8:

| Variable | Valor | De dónde sale |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://YOUR_REF.supabase.co` | Supabase Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_...` o `eyJ...` | Supabase Project Settings → API → publishable / anon |
| `SUPABASE_URL` | mismo valor que `VITE_SUPABASE_URL` | (sin el prefijo `VITE_`) |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_...` o `eyJ...` | Supabase Project Settings → API → secret / service_role |
| `SUPABASE_DB_URL` | `postgresql://postgres.YOUR_REF:URL_ENCODED_PASSWORD@aws-1-REGION.pooler.supabase.com:6543/postgres` | Construir manualmente con el ref del proyecto, password de BD y región del pooler |
| `RESEND_API_KEY` | `re_...` | resend.com → API Keys |
| `RESEND_FROM_EMAIL` | `notificaciones@tudominio.com` o `onboarding@resend.dev` | Email verificado en Resend (o el sandbox `onboarding@resend.dev` mientras pruebas) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | `AIzaSy...` | <https://aistudio.google.com/apikey> |

#### Notas importantes sobre las variables

- **`VITE_*` se inyectan en el bundle en tiempo de BUILD**. Si las añades después del primer build, hay que disparar un Redeploy para que el bundle nuevo las contenga. Las que no llevan `VITE_` se leen en runtime y bastan con estar presentes antes de arrancar el contenedor.
- **`SUPABASE_DB_URL`**: la contraseña va URL-encoded. Por ejemplo `pass@word` se escribe `pass%40word`.
- **`PORT` y `HOST`**: NO los configures manualmente. Railway inyecta `PORT` automáticamente (suele ser `8080`), y `server-node.mjs` bindea a `0.0.0.0` por defecto.
- **`NODE_ENV`**: el `Dockerfile` ya lo pone a `production`. No hace falta configurarlo en Railway.

### 4. Redeploy

Una vez configuradas las variables:

- Settings → Deployments → en el último deploy `⋯` → **Redeploy**

El build tarda 2-4 minutos. Sigue el progreso en la pestaña Build Logs.

### 5. Verificación

Cuando el círculo verde marque **Success**:

1. Abre la URL pública (`https://nombre-production-xxxx.up.railway.app/login`)
2. Debes ver el login de Moneta
3. Entra con un usuario root y comprueba que la navegación funciona
4. Prueba algún CRUD para confirmar que la conexión a Supabase está viva

---

## Problemas conocidos y sus soluciones

### `Error: Node.js 20 detected without native WebSocket support`

**Síntoma**: el server arranca, `/manifest.webmanifest` y `/__debug` responden 200, pero cualquier ruta SSR (`/`, `/login`) devuelve 500 con la página "This page didn't load".

**Causa**: Supabase Realtime requiere WebSocket. Node 20 no tiene `WebSocket` global nativo. Node 22 sí.

**Solución**: el `Dockerfile` del repo ya está en `node:22-alpine` y el `package.json` declara `"engines.node": ">=22"`. Si tu fork bajara la versión por algún motivo, súbela a 22+.

### `npm ci` falla con `lockfile is frozen`

**Síntoma**: el build crashea en el step `install` con "lockfile had changes, but lockfile is frozen".

**Causa**: el `bun.lock` (heredado de un template inicial con Bun) y el `package-lock.json` (de npm) coexistían y se contradecían.

**Solución**: el repo actual ya tiene **solo** `package-lock.json` y declara `"packageManager": "npm@10.9.5"`. Railway detecta npm correctamente.

### Variables añadidas pero no aplicadas en runtime

**Síntoma**: el endpoint `/__debug` (cuando estaba activo) mostraba `present: false` para una variable que sí añadiste.

**Causa**: Railway requiere un **Redeploy explícito** después de cambiar variables. Las variables añadidas no se aplican al contenedor en ejecución hasta que se redespliega.

**Solución**: `Deployments → ⋯ → Redeploy` después de cambiar cualquier variable.

### El SSR sigue dando 500 después de redesplegar

**Causa probable**: alguna variable está vacía o tiene el placeholder de la doc en lugar del valor real.

**Cómo diagnosticar** (sin acceso a logs):
1. Comprueba que `SUPABASE_DB_URL` no es literal `postgresql://postgres.YOUR_REF:PASSWORD@...` (es el placeholder)
2. Comprueba que `GOOGLE_GENERATIVE_AI_API_KEY` empieza por `AIza` (no por `AQ.` que es un token OAuth temporal)
3. Comprueba que `SUPABASE_URL` está presente como variable independiente (no solo `VITE_SUPABASE_URL`)

**Cómo diagnosticar con logs**: Railway → Service → Deploy Logs. Filtra por `Error:` para encontrar el stack trace exacto.

---

## Estructura del repo relevante para el deploy

```
moneta/
├── Dockerfile                  # Multi-stage Node 22 Alpine
├── .dockerignore               # Excluye node_modules, dist, .env, docs
├── server-node.mjs             # Wrapper http.createServer
├── vite.config.ts              # cloudflare: false (Node target)
├── package.json                # engines.node >=22, scripts.start
├── package-lock.json
└── src/
    ├── server.ts               # Handler Fetch API (usado por el bundle)
    ├── lib/
    │   ├── supabase.ts         # Cliente principal
    │   └── admin-users.ts      # Server functions con service_role
    └── routes/                 # 30+ rutas TanStack Start
```

---

## Coste estimado en Railway

- **Trial / Hobby plan** ($5/mes): suficiente para Moneta con tráfico bajo
- **Pro plan** ($20/mes): si necesitas más de 8 GB RAM o despliegues largos

Las variables consumidas son CPU y RAM del contenedor (1 vCPU compartida y ~512 MB RAM bastan).

---

## Alternativas de hosting equivalentes

El proyecto es portable. El mismo `Dockerfile` funciona en:

- **Render** — con auto-detect del Dockerfile
- **Fly.io** — añadiendo un `fly.toml` mínimo
- **Cualquier VPS con Docker** (Hetzner, DigitalOcean, AWS EC2)

Si quieres volver a Cloudflare Workers (donde estuvo desplegado originalmente), basta con cambiar en `vite.config.ts` `cloudflare: false` a true y usar `wrangler deploy` en lugar del Dockerfile.

---

Última actualización: **2026-06-08**
Versión del sistema: **v0.10** + adapter Node
Commit verificado de referencia: `17f34b0`
