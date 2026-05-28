import { useEffect } from "react";

// PWA desactivado. Este componente solo limpia cualquier SW antiguo
// que un deploy previo hubiera instalado. Una vez limpiado, no hace nada.
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    (async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) await r.unregister();
      } catch {}
    })();
  }, []);
  return null;
}
