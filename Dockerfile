# Dockerfile para Moneta · deploy en Railway / VPS / cualquier hosting Docker
#
# Multi-stage build:
#   1. builder: instala dependencias y compila el bundle
#   2. runtime: solo carga prod deps + dist/ + el wrapper Node
#
# Variables de entorno requeridas en runtime (todas con datacenter UE):
#   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
#   BREVO_API_KEY, BREVO_FROM_EMAIL, BREVO_FROM_NAME (emails · Brevo Francia),
#   MISTRAL_API_KEY (IA · Mistral Francia/Suecia),
#   PORT (Railway lo inyecta; default 3000)

# ---------- Stage 1: builder ----------
FROM node:22-alpine AS builder

WORKDIR /app

# Copiar manifests y lockfile primero (mejor cacheo de Docker layers)
COPY package.json package-lock.json ./

# Instalar TODAS las dependencias (incluyendo devDependencies para el build)
RUN npm install --no-audit --no-fund

# Copiar el resto del código
COPY . .

# Las variables VITE_* necesitan estar disponibles en build time
# porque Vite las inyecta en el bundle. Railway las pasa como ARG.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}

# Compilar (genera dist/client y dist/server)
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM node:22-alpine AS runtime

WORKDIR /app

# Solo lockfile y package.json para instalar prod deps
COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# Copiar bundle compilado y el wrapper Node
COPY --from=builder /app/dist ./dist
COPY server-node.mjs ./

# Railway pasa PORT como env var. Lo declaramos por convención.
ENV PORT=3000
ENV HOST=0.0.0.0
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server-node.mjs"]
