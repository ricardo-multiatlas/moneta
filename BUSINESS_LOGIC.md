# Correduría OS - Plan Maestro y Arquitectura (Moneta Seguros)

Basado en las mejores ideas de todas las propuestas y adaptado al stack de **SaaS Factory V4** y la estructura actual del proyecto (TanStack Start + Vite).

## 1. Visión Técnica: El "Golden Path"

Respetando tu directriz: **Mantenemos la UI y estructura actual** (React 19, TanStack Start, Shadcn, TailwindCSS). La lógica de negocio y base de datos se conectará usando el stack "Agent-First":

*   **Frontend / Framework:** TanStack Start (SSR, rutas tipadas) + Tailwind 4 + Shadcn UI.
*   **Base de Datos & Auth:** **Supabase** (PostgreSQL). Nos dará Auth (con perfiles y RLS para la seguridad), Base de datos relacional y Storage (para PDFs).
*   **Inteligencia Artificial:** **Vercel AI SDK v5** + **OpenRouter**. Usaremos modelos estructurados (Structured Outputs) para asegurar que el OCR de pólizas y la conciliación devuelvan JSON perfectos.
*   **Estado & Validaciones:** Zustand (si es necesario estado global) y Zod (fundamental para validar datos de entrada de formularios y de IA).

---

## 2. Modelo de Datos Central (Supabase)

Diseñado desde el día 1 para ser robusto (Multi-tenant ready).

1.  **`users`**: Administradores, comerciales, backoffice (gestionado vía Supabase Auth).
2.  **`clientes`**: Ficha 360 (id, nombre/nif, tipo, email, telefono, metadata).
3.  **`polizas`**: (id, cliente_id, aseguradora, ramo, prima, comision_esperada, fechas, estado, pdf_url).
4.  **`vencimientos`**: Derivada de pólizas (fecha límite, estado del recordatorio).
5.  **`comisiones`**: Reconciliación (importe declarado vs esperado, estado, pdf_informe).
6.  **`facturas`**: (cliente_id, poliza_id, importe, estado, fecha).
7.  **`leads`**: (origen, estado, comercial asignado, conversion_id).
8.  **`audit_logs`**: (Esencial para RGPD) - ¿Quién modificó qué y cuándo?

---

## 3. Implementación Práctica de la IA (Vercel AI SDK)

No vamos a sobre-complicar con modelos locales difíciles de mantener. Usaremos **Vercel AI SDK** con llamadas específicas para tareas donde la IA brilla:

*   **Extracción de Pólizas (PDF a JSON):** 
    *   *Flujo:* Usuario sube PDF a Supabase Storage → Trigger llama al backend → Vercel AI SDK (usando Gemini Flash o GPT-4o vía OpenRouter) analiza el texto/imagen → Devuelve JSON estructurado (Zod Schema) → El usuario revisa en la UI antes de guardar.
*   **Conciliación de Comisiones:** 
    *   *Flujo:* Se sube el Excel/PDF de la aseguradora → IA extrae la tabla → Cruce exacto y difuso en DB → Se muestran las discrepancias en pantalla.
*   **Búsqueda en Lenguaje Natural (Opcional post-lanzamiento):** Generación de consultas SQL de solo lectura basadas en el prompt del comercial.

---

## 4. Plan de Desarrollo por Fases (Bucle Agéntico)

Ya contamos con el "esqueleto" funcional de los 6 módulos (`src/routes/`). El plan de ataque es ir conectando estos componentes visuales con la lógica real:

### Fase 0: Fundación & Base de Datos (Primer paso)
*   Configurar proyecto de Supabase.
*   Crear el esquema SQL inicial (Tablas `clientes`, `polizas`, políticas de seguridad RLS).
*   Conectar el cliente de Supabase al frontend de TanStack Start.

### Fase 1: CRM + Pólizas (El corazón)
*   **Módulo Clientes:** Hacer que la ruta `/clientes` lea y escriba en Supabase. Ficha 360 real.
*   **Módulo Pólizas:** Crear formulario de alta de pólizas.
*   **Feature IA 1:** Integrar Vercel AI SDK para que al subir el PDF de una póliza, se auto-rellene el formulario de alta usando `generateObject` de la IA.

### Fase 2: Automatizaciones & Vencimientos
*   **Módulo Vencimientos:** Logica en `/vencimientos` que detecte pólizas a vencer en 30-60 días.
*   **Background Jobs:** (Podemos usar Supabase Edge Functions + Cron) para envío de correos automáticos (Resend).

### Fase 3: Comisiones, Facturación y Captación
*   **Módulo Comisiones:** Lógica de subida de PDF mensual y cruce contra la tabla de pólizas para detectar faltantes.
*   **Módulo Facturación:** Generación de minutas desde las comisiones.
*   **Módulo Captación:** Tracking de Leads en la ruta `/captacion`.
