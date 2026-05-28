import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

const DISMISS_KEY = "moneta_pwa_install_dismissed";
const DISMISS_DAYS = 14;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Registra /sw.js (mínimo, solo cachea assets hash-versionados).
// Y muestra prompt de "Instalar app" cuando el navegador lo soporte.
export function PwaRegister() {
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installVisible, setInstallVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Registrar SW (defensivo, ignora errores)
    if ("serviceWorker" in navigator) {
      const register = () => {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .catch((err) => console.warn("[PWA] SW registration failed:", err));
      };
      if (document.readyState === "complete") register();
      else window.addEventListener("load", register, { once: true });
    }

    // 2. Banner instalar (Chromium dispara beforeinstallprompt)
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    const dismissedRecently = dismissedAt && Date.now() - dismissedAt < DISMISS_DAYS * 86400000;
    if (dismissedRecently) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BeforeInstallPromptEvent);
      setInstallVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installed = () => {
      setInstallVisible(false);
      setInstallEvt(null);
    };
    window.addEventListener("appinstalled", installed);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  const doInstall = async () => {
    if (!installEvt) return;
    await installEvt.prompt();
    await installEvt.userChoice;
    setInstallVisible(false);
    setInstallEvt(null);
  };

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setInstallVisible(false);
  };

  if (!installVisible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-border bg-background shadow-lg p-3.5 flex items-start gap-3">
      <div className="size-9 rounded-md bg-brand-soft text-brand grid place-items-center shrink-0">
        <Download className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-semibold">Instalar Correduría OS</div>
        <div className="text-[11px] text-ink-muted mt-0.5">
          Accede como una app: más rápido, en pantalla completa.
        </div>
        <div className="flex gap-2 mt-2.5">
          <button
            type="button"
            onClick={doInstall}
            className="text-[11px] py-1 px-2.5 rounded bg-brand text-brand-foreground hover:brightness-110 cursor-pointer font-medium"
          >
            Instalar
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="text-[11px] py-1 px-2.5 rounded text-ink-muted hover:bg-secondary cursor-pointer"
          >
            Ahora no
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        title="Cerrar"
        aria-label="Cerrar"
        className="size-6 rounded grid place-items-center text-ink-subtle hover:bg-secondary cursor-pointer shrink-0"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
