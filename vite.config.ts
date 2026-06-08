// @lovable.dev/vite-tanstack-config trae preset listo para TanStack Start.
// Por defecto compila para Cloudflare Workers. Para Railway/Node usamos
// cloudflare: false → TanStack Start genera bundle Node-Server estándar.
//
// PWA: manifest.webmanifest y sw.js manuales en public/ (no usamos
// vite-plugin-pwa porque su generateSW requiere index.html estático y
// TanStack Start usa SSR sin HTML estático).
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  cloudflare: false,
});
