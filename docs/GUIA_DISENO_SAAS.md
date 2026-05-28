# Guía de diseño · Plantilla SaaS MultiAtlas

Documento técnico para replicar el sistema visual y arquitectónico de **Correduría OS (Moneta)** en futuros SaaS verticales (clínica, despacho legal, etc.).

---

## 1. Stack base

| Capa | Elección | Por qué |
|---|---|---|
| Framework | **TanStack Start + Vite** | SSR + file-based routing + server functions tipadas |
| UI | **React 19 + Tailwind 4 + shadcn/ui** | Tailwind 4 permite `@theme inline` con variables CSS — cambiar paleta = cambiar 30 líneas |
| Iconos | **lucide-react** | Coherente, monoline, ligero |
| DB + Auth + Storage | **Supabase** | RLS Postgres = permisos sin código de servidor; Auth con MFA TOTP nativo |
| IA | **Vercel AI SDK + Gemini/OpenAI** | `generateObject` con Zod schema = JSON garantizado, no parsing frágil |
| Email | **Resend** | Edge Function HTTP-only, sin SMTP |
| PDF / Excel | **jspdf + xlsx (SheetJS)** | Cliente-side, sin servidor |
| Hosting | **Cloudflare Workers** (preset incluido en `@lovable.dev/vite-tanstack-config`) | Subdominio gratis, edge global, SSL automático |

---

## 2. Paleta de color — método

**Regla**: tomar la paleta del **sitio web del cliente** y mapearla a tokens. No inventar.

### Cómo se hizo en Moneta

1. `curl -s https://monetaseguros.com/styles.css | grep -oE '#[0-9a-fA-F]{6}'` para extraer todos los hex
2. Identificar primary, accent, neutrals y backgrounds del CSS
3. Mapear a tokens Tailwind 4 en `src/styles.css`:

```css
:root {
  /* === PALETA DEL CLIENTE === */
  --background: #faf7f5;     /* cream pálido = principal del sitio */
  --foreground: #1a1215;     /* negro vino = texto del sitio */
  --brand: #8b6262;          /* burgundy = primary del sitio */
  --brand-foreground: #ffffff;
  --brand-soft: #e8d5d5;
  --accent: #d4a853;         /* dorado premium = acento del sitio */

  /* === DERIVADOS PARA UI === */
  --surface: #ffffff;
  --surface-muted: #f0eced;
  --border: #e0d8db;
  --ink: #1a1215;
  --ink-muted: #554b4f;
  --ink-subtle: #8a8084;

  /* === ESTADOS UNIVERSALES === */
  --success: #5c8a4f;
  --warning: #d4a853;        /* coincide con accent si el cliente es premium */
  --danger:  #c0392b;
  --info:    #6e8aa6;
}
```

**Tiempo total para re-pintar un SaaS entero a la marca del cliente: ~15 minutos** (con dark mode incluido).

---

## 3. Layout y shell

```
<RootShell>                              ← __root.tsx (Tanstack)
  <QueryClientProvider>
    <AuthProvider>                       ← carga sesión UNA vez
      <PermissionsProvider>              ← carga perfil + rol UNA vez
        <DialogProvider>                 ← toast/confirm/prompt globales
          <Outlet />                     ← cada ruta usa PageShell
        </DialogProvider>
      </PermissionsProvider>
    </AuthProvider>
  </QueryClientProvider>
</RootShell>

<PageShell title subtitle action>        ← envuelve cada vista
  <AppSidebar />                          ← filtra entradas por rol
  <main>
    <Topbar title subtitle action />      ← cabecera estándar
    <div pt-6>{children}</div>            ← contenido con padding-top
  </main>
</PageShell>
```

### Reglas de oro del layout

1. **Auth y permisos son Context, no hooks aislados.** Si cada `useAuth` ejecutara `getSession()` al montar, el cambio de ruta haría flash. Provider único = sin re-fetch.
2. **PageShell siempre tiene `pt-6` en el contenedor del contenido.** Sin esto los KPIs/cards tocan el header.
3. **El sidebar filtra entradas con `allow: Rol[]`.** Cada item de nav tiene una lista de roles permitidos; secretaria nunca ve Comisiones, comercial no ve Equipo.
4. **Login fuera del shell.** `/login` NO usa PageShell, así no entra en bucles del AuthGate.

---

## 4. Sistema de roles + RLS

### Plantilla SQL reusable

```sql
-- Helpers SECURITY DEFINER STABLE (caché de plan, sin coste por row)
CREATE OR REPLACE FUNCTION public.mi_rol() RETURNS TEXT AS $$
  SELECT rol FROM public.usuarios WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.es_root() RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT rol IN ('root','admin') FROM public.usuarios WHERE id = auth.uid()), FALSE)
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Policy plantilla — ajustar por entidad
CREATE POLICY "tabla_select" ON public.tabla FOR SELECT USING (
  public.es_root()
  OR (public.es_jefe_zona() AND owner_id IN (SELECT public.mis_ids()))
  OR (public.es_member() AND owner_id = auth.uid())
  OR auth.uid() IS NULL  -- fallback dev. ELIMINAR en producción estricta.
);
```

### Hook React

```tsx
const { esRoot, esJefeZona, puedeXXX, scopeClientes } = usePermissions();
```

**Patrón**: el hook devuelve **flags booleanos pre-calculados**, no el rol crudo. Así la UI no comprueba `rol === "root" || rol === "admin"` en cada sitio — encapsulación.

### Componente RoleGate

```tsx
<RoleGate allow={["root", "jefe_zona"]}>
  <button>Solo root y jefes ven esto</button>
</RoleGate>
```

---

## 5. Componentes propios reutilizables

| Componente | Función | Por qué propio |
|---|---|---|
| `<Card>` | Contenedor con ring + shadow sutil | Marca visual consistente |
| `<KpiCard>` | Métrica con label, valor grande, delta opcional | Aparece en TODOS los dashboards |
| `<StatusBadge tone="success">` | Píldora coloreada por estado | Estados unificados (success/warning/danger/info/neutral) |
| `<RamoChip>` | Chip por categoría (Auto/Hogar/Vida...) | Específico negocio seguros — cambia por dominio |
| `<MoneyEUR value={123}>` | Formato moneda es-ES | Localización centralizada |
| `<SectionHeader title hint action>` | Cabecera de bloque | Espaciado y tipografía uniforme |
| `<Modal>` | Modal con backdrop blur | Formularios de alta/edición |
| `<DetailModal>` | Vista rápida de registro con `[label, value]` | El icono ojo abre esto SIN navegar |
| `<RowActions actions={[...]}>` | 4 iconos por fila: view/edit/print/download | Norma del SaaS: toda tabla tiene estas 4 |
| `<DialogProvider>` | toast/confirm/prompt globales con estilo | Reemplaza alert/confirm/prompt nativos |

---

## 6. Patrón "RowActions obligatorias"

**Regla establecida**: cualquier registro en una tabla debe tener los 4 iconos:

```tsx
<RowActions
  actions={[
    { icon: "view",     label: "Ver datos",     onClick: () => setViewing(item), tone: "brand" },
    { icon: "edit",     label: "Editar",        onClick: () => abrirEdicion(item) },
    { icon: "print",    label: "Imprimir",      onClick: () => imprimirPDF(item) },
    { icon: "download", label: "Descargar PDF", onClick: () => descargarPDF(item) },
  ]}
/>
```

- **view siempre abre DetailModal**, no navega
- **edit abre el mismo modal de alta pre-cargado** o ruta de detalle
- **print + download usan `generarFichaPDF()`** (helper genérico)
- Acciones desactivadas se muestran grises con `disabled: true` — nunca se ocultan, para que el usuario sepa que existen

---

## 7. Sistema Dialog/Toast/Prompt

`alert/confirm/prompt` nativos del navegador rompen la estética. Reemplazo:

```tsx
const { toast, confirm, prompt } = useDialog();

// Reemplaza alert()
toast("Cuenta creada", "success");  // tone: success | error | warning | info

// Reemplaza confirm()
const ok = await confirm({
  message: "¿Eliminar a Pepe?",
  tone: "danger"
});
if (!ok) return;

// Reemplaza prompt()
const nueva = await prompt({
  title: "Nueva contraseña",
  message: "Mínimo 6 caracteres",
  inputType: "password",
  validate: v => v.length < 6 ? "Muy corta" : null
});
if (nueva === null) return;
```

Provider en `__root.tsx`, hook fallback a `window.*` si está fuera del provider (defensa).

---

## 8. Server Functions con IA (patrón seguro)

**Anti-patrón**: dejar que el LLM genere SQL libre. Inyección garantizada.

**Patrón seguro**: que el LLM genere **intent estructurado** con schema Zod, y el código construye la query Supabase:

```ts
const Intent = z.object({
  entidad: z.enum(["clientes", "polizas", ...]),
  filtros: z.object({ texto: z.string().optional(), ramo: z.string().optional(), ... }),
  limite: z.number().int().max(100).default(25),
  explicacion: z.string(),
});

const { object } = await generateObject({
  model: google("gemini-1.5-flash"),
  schema: Intent,
  messages: [...]
});

// Luego CÓDIGO construye la query con builder fluent
let query = sb.from(object.entidad).select(...);
if (object.filtros.ramo) query = query.ilike("ramo", object.filtros.ramo);
```

El peor caso de un prompt malicioso es un `ilike` con texto raro. Imposible `DROP TABLE`.

---

## 9. Auditoría inmutable (cumple RGPD)

```sql
-- Tabla append-only
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT,
  action TEXT CHECK (action IN ('INSERT','UPDATE','DELETE')),
  actor_id UUID,
  actor_email TEXT,
  actor_role TEXT,
  old_data JSONB,
  new_data JSONB,
  diff JSONB
);

-- Revocar UPDATE/DELETE = inmutabilidad a nivel motor
REVOKE UPDATE, DELETE ON audit_logs FROM anon, authenticated, public;

-- Trigger genérico instalable en cualquier tabla con un SELECT
CREATE FUNCTION fn_audit_trigger() RETURNS TRIGGER AS $$ ... $$;
CREATE FUNCTION fn_install_audit(p_table TEXT) RETURNS void AS $$
BEGIN
  EXECUTE format('CREATE TRIGGER audit_%s AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger()', p_table, p_table);
END $$;

SELECT fn_install_audit('clientes');
SELECT fn_install_audit('polizas');
-- ...etc
```

**Coste**: ~5% extra de escritura, RGPD cubierto por diseño.

---

## 10. Migraciones idempotentes

Toda migración debe poder reaplicarse sin error. Patrón para `RENAME COLUMN`:

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='X' AND column_name='viejo')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='X' AND column_name='nuevo') THEN
    ALTER TABLE public.X RENAME COLUMN viejo TO nuevo;
  END IF;
END $$;
```

Usar `IF NOT EXISTS` / `IF EXISTS` / `DROP IF EXISTS` en CADA statement.

---

## 11. Deploy a Cloudflare (gratis, no requiere dominio)

```bash
# Una sola vez por proyecto
npx wrangler login
echo "https://<proj>.supabase.co" | wrangler secret put VITE_SUPABASE_URL
echo "<anon-key>"                  | wrangler secret put VITE_SUPABASE_ANON_KEY
echo "<service-role>"              | wrangler secret put SUPABASE_SERVICE_ROLE_KEY
echo "<gemini-key>"                | wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY

# Cada deploy
npm run build
npx wrangler deploy
# → https://<worker-name>.<subdomain>.workers.dev
```

Subdominio `.workers.dev` es **gratis ilimitado**. No requiere comprar dominio.

---

## 12. Storage para PDFs y archivos

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('docs-privados', 'docs-privados', false),
  ('fotos-perfil', 'fotos-perfil', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "read_public" ON storage.objects FOR SELECT
  USING (bucket_id = 'fotos-perfil');
CREATE POLICY "write_auth" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id IN ('docs-privados','fotos-perfil') AND auth.role() = 'authenticated');
```

Helper de upload + URL pública:

```ts
const path = `${ownerId}/${Date.now()}_${file.name}`;
await supabase.storage.from(bucket).upload(path, file);
const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
// → pub.publicUrl
```

---

## 13. Generador PDF genérico

```ts
generarFichaPDF({
  titulo: "Cliente: Pepe Pérez",
  subtitulo: "Particular · NIF 12345678A",
  bloques: [
    { titulo: "Contacto", filas: [["Email", "..."], ["Teléfono", "..."]] },
    { titulo: "Cartera", filas: [["Pólizas", 3], ["Prima", "1200 €"]] },
  ],
  tablas: [
    { titulo: "Pólizas", columnas: ["Nº","Ramo","Prima"], filas: [...] },
  ],
});
```

Devuelve `Blob`. Pasarlo a `descargarBlob(blob, "filename.pdf")` o `imprimirBlob(blob)`.

Misma plantilla visual para todos los documentos del SaaS = consistencia.

---

## 14. Exportación Excel sin servidor

```ts
import * as XLSX from "xlsx";

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(rows);  // rows = array de objetos
XLSX.utils.book_append_sheet(wb, ws, "Hoja");
XLSX.writeFile(wb, "archivo.xlsx");
```

Helper en `lib/exportar.ts`. Para CSV importable a gestoría (A3, Contasol, Sage) usar las **mismas columnas tipadas** (números como Number, no string).

---

## 15. Reglas no negociables del SaaS

1. **Sin alerts/confirms/prompts nativos.** Siempre `useDialog()`.
2. **Toda tabla con registros tiene RowActions.** view + edit + print + download.
3. **El icono ojo abre modal, no navega.** Navegar es para "abrir ficha completa".
4. **Roles via flags pre-calculados.** Nunca `if (rol === "...")` disperso.
5. **RLS reales en producción.** El fallback `OR auth.uid() IS NULL` es solo dev.
6. **Audit logs append-only en todas las tablas operativas.**
7. **Loaders defensivos.** Si una tabla puede no existir aún (migración pendiente), envolver en try/catch para no romper la página.
8. **IA con intent schema Zod, nunca SQL libre.**
9. **Stubs honestos.** Si una feature requiere proveedor externo (WhatsApp, firma electrónica), mostrar banner amarillo "Modo demostración" — nunca simular en silencio.
10. **Variables CSS para la marca.** Cambiar de cliente = cambiar 1 archivo (`styles.css`).

---

## 16. Cómo arrancar un SaaS nuevo a partir de esta plantilla

```bash
# 1. Clonar este repo
git clone <repo> nuevo-saas-cliente-X

# 2. Cambiar paleta en src/styles.css (15 min)
#    extraer del sitio web del cliente

# 3. Cambiar logo en public/
#    descargar de su sitio + actualizar imports en sidebar/login

# 4. Modelo de datos: editar supabase/migrations/ con tu dominio
#    (clientes/pacientes/expedientes/casos según vertical)

# 5. Roles: ajustar en use-permissions.tsx + RLS de Supabase

# 6. Server functions IA: cambiar prompts en src/lib/ai-*.ts
#    si el dominio es distinto (legal en vez de seguros, etc.)

# 7. Deploy
npx wrangler deploy
```

**Tiempo realista de un SaaS vertical nuevo basado en esta plantilla**: 3-5 días de trabajo para un MVP funcional con auth, roles, audit, dashboard, 3-4 entidades y deploy a producción.
