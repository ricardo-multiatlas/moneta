// Service Worker desactivado temporalmente — se auto-desinstala
// para que ningún cliente que lo tuviera registrado siga interceptando.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {}
      const reg = await self.registration;
      try { await reg.unregister(); } catch {}
      const clients = await self.clients.matchAll();
      clients.forEach((c) => c.navigate(c.url));
    })()
  );
});
// Sin handler fetch = pass-through al navegador
