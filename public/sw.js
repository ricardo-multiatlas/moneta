// Service Worker mínimo de Correduría OS PWA.
// SOLO cachea assets hash-versionados de /assets/.
// NO toca navegación, HTML, ni peticiones a Supabase.
// Si necesitas desinstalarlo: DevTools → Application → Service Workers → Unregister.

const CACHE = "moneta-assets-v3";
const ASSET_RE = /\/assets\/[\w.\-]+-[A-Za-z0-9_-]{8,}\.(?:js|css|png|jpg|jpeg|webp|svg|woff2?)$/;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Solo intervenimos en assets hash-versionados de nuestro origen.
  // Todo lo demás (HTML, Supabase, APIs, navegación) pasa sin tocar.
  if (url.origin !== self.location.origin) return;
  if (!ASSET_RE.test(url.pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (e) {
      return hit || Response.error();
    }
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
