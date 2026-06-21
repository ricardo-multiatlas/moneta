# Comunicación con Rubén Toledano · 2026-06-20

Histórico de la conversación con Rubén (supervisor del proyecto) sobre el estado de Moneta. Guardado en el repo para que Desirée y futuros incorporados al proyecto tengan trazabilidad de qué se le contestó y qué se está esperando que confirme.

---

## Contexto

Rubén envió un mensaje a Ricardo con varias dudas mezcladas sobre el proyecto Moneta:

- Si los cambios de tecnología que él pidió para que el proyecto fuera apto para servidores propios + SEO + AIO estaban implementados
- Cómo está el tema del login con cuentas Multiatlas
- Coordinar reunión con Desirée para onboard del proyecto
- Pasar el proyecto al "servidor tres con UPS"

Adicionalmente mencionó que no había podido hablar con Diego (el cliente) desde la reunión inicial, y que pendiente del tema de pagos y contrato.

---

## Mensaje enviado a Rubén (Ricardo, 2026-06-20)

> **Rubén,**
>
> Te escribo para confirmarte el estado del proyecto Moneta a raíz del mensaje que me mandaste donde mencionabas los cambios de tecnología para servidores propios, SEO y AIO, y lo del login con cuentas Multiatlas. Te separo cada tema:
>
> ---
>
> **1. Stack apto para nuestros servidores propios → HECHO**
>
> Implementé el adapter para que Moneta corra en cualquier servidor propio nuestro, no solo en Cloudflare o servicios gestionados. Concretamente añadí al repo:
>
> - Un `Dockerfile` multi-stage con Node 22 Alpine
> - Un wrapper `server-node.mjs` que arranca el servidor con `http.createServer` de Node
> - Configuración Vite con `cloudflare: false` para que compile como build Node estándar
>
> Esto significa que el mismo código corre en: Railway (donde está hoy), Render, Fly.io, un VPS de Hetzner o DigitalOcean, o el servidor tres con UPS que mencionaste. Solo hay que ejecutar `docker build && docker run` y apuntar el dominio.
>
> Lo dejé documentado paso a paso en `docs/DEPLOY_RAILWAY.md` dentro del repo (incluye sección de alternativas para mover a VPS).
>
> ---
>
> **2. SEO → básico HECHO, avanzado a tu confirmación**
>
> Lo que ya está implementado:
>
> - 39 páginas con meta tags propios (title, description, og:title, og:description, twitter:card específicos por ruta)
> - Sitemap dinámico generado en `src/routes/sitemap[.]xml.ts`
> - `robots.txt` permitiendo indexación
> - `manifest.webmanifest` completo con shortcuts a las secciones principales
> - **SSR completo** con TanStack Start — esto es lo más importante para SEO: Google ve el HTML renderizado por el servidor, no JavaScript vacío
> - Open Graph, Twitter Card, theme-color y apple-touch-icon en el root
>
> Lo que NO está implementado todavía (puedo añadirlo si me confirmas que aplica a Moneta):
>
> - Schema.org JSON-LD (structured data para rich snippets en buscadores)
> - `llms.txt` para AIO (que ChatGPT/Perplexity referencien la web)
> - Open Graph images específicas por página (hoy todas usan el logo genérico)
>
> Mi duda: Moneta es CRM/ERP interno de la correduría, solo la página de login es realmente indexable públicamente. El SEO/AIO avanzado tiene sentido cuando hay landing pública y contenido público (como Surdeplant). ¿Quieres que añada estructura SEO/AIO al login y a una landing pública que cree, o lo dejamos solo en lo básico que ya hay porque Moneta es interno?
>
> ---
>
> **3. Login con cuentas Multiatlas → estado actual y necesito tu confirmación**
>
> Estado de las cuentas administradoras de cada servicio:
>
> - **GitHub repo principal** (`makeflowia-lab/moneta-unified-hub`) → ✅ ya bajo Multiatlas
> - **Supabase** (base de datos, auth, storage) → ✅ ya bajo `makeflowia@gmail.com`
> - **Cloudflare Workers** (hosting respaldo) → ✅ ya bajo Multiatlas
> - **Railway** (hosting principal actual) → ❌ está bajo cuenta personal mía
> - **Segundo repo GitHub** (`ricardo-multiatlas/moneta`, el que comparto contigo) → ❌ está bajo cuenta personal, no bajo organización Multiatlas-SL
> - **Resend** (envío de emails) → pendiente confirmar
> - **Google AI Studio** (key de Gemini) → pendiente confirmar
>
> Mi pregunta concreta: ¿lo que pides es que TODOS los servicios externos pasen a cuentas Multiatlas-SL (no personales)? Si la respuesta es sí, lo paso así:
>
> 1. Creo proyecto Railway nuevo bajo cuenta Multiatlas y migro el despliegue (15-20 minutos, mínimo downtime)
> 2. Creo el repo dentro de la organización Multiatlas-SL en GitHub y configuro el push allí
> 3. Recreo cuenta Resend y Google AI Studio bajo Multiatlas si hace falta
>
> Confírmame si esto es lo que pedías y arranco. No quiero mover Railway de cuenta sin tu OK porque es una operación que solo tiene sentido hacerla una vez.
>
> ---
>
> **4. Servidor tres con UPS → listo cuando me des acceso**
>
> Como te dije en el punto 1, el código ya tiene Dockerfile + arranque Node. Para subirlo a tu servidor solo necesito:
>
> - Acceso SSH al servidor (o que tú lo hagas tú mismo siguiendo `docs/DEPLOY_RAILWAY.md`, sección "Alternativas")
> - Que tenga Docker instalado (si no, lo instalo)
> - Que el dominio apunte a su IP
>
> Una tarde de trabajo real y se queda corriendo. Cuando quieras lo hacemos.
>
> ---
>
> **5. Reunión con Desirée el lunes**
>
> Disponible para mostrarle dónde vive cada parte del onboard. Si me dices la hora exacta me conecto. Puedo enseñarle:
>
> - Estructura del repo y dónde mirar cada sección
> - Cómo se configuran usuarios/zonas/permisos
> - Cómo se aplica el SQL de migraciones
> - Cómo se despliega (Railway o servidor propio)
> - El flujo de variables de entorno
>
> ---
>
> Quedo a la espera de tu confirmación de los puntos 2 y 3 para avanzar. Abrazo.

---

## Esperando respuesta sobre

1. **Punto 2 · SEO/AIO avanzado**: ¿Implementar Schema.org JSON-LD + `llms.txt` + OG images por página? Decisión depende de si Moneta tendrá una landing pública o queda solo como CRM interno.

2. **Punto 3 · Migración de servicios a Multiatlas**: ¿Pasar Railway, segundo repo GitHub, Resend y Google AI a cuentas/organizaciones Multiatlas-SL? Si confirma, se ejecuta en una tanda de ~30 minutos.

3. **Punto 4 · Servidor con UPS**: Esperando acceso SSH o que Rubén lo haga él mismo.

4. **Punto 5 · Reunión con Desirée**: Esperando hora confirmada para el lunes.

---

## Estado actual del despliegue (referencia para Desirée)

- **Producción Railway** (principal): <https://moneta-production-b65b.up.railway.app>
- **Producción Cloudflare** (respaldo): <https://tanstack-start-app.makeflowia.workers.dev>
- **Repo principal**: <https://github.com/makeflowia-lab/moneta-unified-hub>
- **Repo espejo (Rubén)**: <https://github.com/ricardo-multiatlas/moneta>
- **Base de datos**: Supabase EU (`eu-west-3` · París)
- **Commit último**: `190161e`

---

Fecha: **2026-06-20**
Pendiente: respuesta de Rubén
