import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, X, Info, AlertTriangle } from "lucide-react";

// ============================================================
// Tipos
// ============================================================

type ToastTone = "success" | "error" | "info" | "warning";
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "brand";
}

interface PromptOptions {
  title?: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  inputType?: "text" | "password" | "email" | "number";
  confirmLabel?: string;
  cancelLabel?: string;
  validate?: (value: string) => string | null; // devuelve mensaje de error o null si OK
}

interface DialogContextValue {
  toast: (message: string, tone?: ToastTone) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

// ============================================================
// Provider
// ============================================================

export function DialogProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const [promptState, setPromptState] = useState<{ opts: PromptOptions; resolve: (v: string | null) => void; value: string; err: string | null } | null>(null);

  const toast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, tone, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ opts, resolve });
    });
  }, []);

  const prompt = useCallback((opts: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setPromptState({ opts, resolve, value: opts.defaultValue ?? "", err: null });
    });
  }, []);

  const closeConfirm = (v: boolean) => {
    if (confirmState) confirmState.resolve(v);
    setConfirmState(null);
  };

  const closePrompt = (v: string | null) => {
    if (promptState) {
      if (v !== null && promptState.opts.validate) {
        const err = promptState.opts.validate(v);
        if (err) {
          setPromptState({ ...promptState, err });
          return;
        }
      }
      promptState.resolve(v);
    }
    setPromptState(null);
  };

  return (
    <DialogContext.Provider value={{ toast, confirm, prompt }}>
      {children}

      {/* TOASTS */}
      <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => {
          const Icon = t.tone === "success" ? CheckCircle2 : t.tone === "error" ? AlertCircle : t.tone === "warning" ? AlertTriangle : Info;
          const colorClass =
            t.tone === "success" ? "ring-success/30 bg-success/10 text-success" :
            t.tone === "error" ? "ring-danger/30 bg-danger/10 text-danger" :
            t.tone === "warning" ? "ring-warning/40 bg-warning/10 text-warning" :
            "ring-brand/30 bg-brand-soft text-brand";
          return (
            <div
              key={t.id}
              className={[
                "pointer-events-auto min-w-[260px] max-w-[360px] rounded-md ring-1 px-3 py-2.5 shadow-md backdrop-blur",
                "bg-surface flex items-start gap-2.5 text-[12.5px] animate-in slide-in-from-right-2 fade-in",
                colorClass,
              ].join(" ")}
            >
              <Icon className="size-4 shrink-0 mt-0.5" />
              <div className="flex-1 text-foreground">{t.message}</div>
              <button
                type="button"
                onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}
                className="p-0.5 rounded hover:bg-secondary cursor-pointer"
                aria-label="Cerrar"
              >
                <X className="size-3 text-ink-subtle" />
              </button>
            </div>
          );
        })}
      </div>

      {/* CONFIRM */}
      {confirmState && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={() => closeConfirm(false)}>
          <div className="w-full max-w-sm bg-surface rounded-xl shadow-lg ring-1 ring-border p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className={["size-9 rounded-md grid place-items-center shrink-0", confirmState.opts.tone === "danger" ? "bg-danger/10 text-danger" : "bg-brand-soft text-brand"].join(" ")}>
                {confirmState.opts.tone === "danger" ? <AlertCircle className="size-4" /> : <Info className="size-4" />}
              </div>
              <div className="flex-1">
                {confirmState.opts.title && <h2 className="text-[14px] font-semibold mb-1">{confirmState.opts.title}</h2>}
                <p className="text-[12.5px] text-foreground whitespace-pre-wrap">{confirmState.opts.message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => closeConfirm(false)}
                className="text-[12px] font-medium py-1.5 px-4 rounded-md ring-1 ring-border hover:bg-secondary cursor-pointer"
              >
                {confirmState.opts.cancelLabel || "Cancelar"}
              </button>
              <button
                type="button"
                onClick={() => closeConfirm(true)}
                className={[
                  "text-[12px] font-medium py-1.5 px-4 rounded-md hover:brightness-110 cursor-pointer",
                  confirmState.opts.tone === "danger" ? "bg-danger text-white" : "bg-brand text-brand-foreground",
                ].join(" ")}
              >
                {confirmState.opts.confirmLabel || "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROMPT */}
      {promptState && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={() => closePrompt(null)}>
          <form
            className="w-full max-w-sm bg-surface rounded-xl shadow-lg ring-1 ring-border p-5"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); closePrompt(promptState.value); }}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="size-9 rounded-md grid place-items-center shrink-0 bg-brand-soft text-brand">
                <Info className="size-4" />
              </div>
              <div className="flex-1">
                {promptState.opts.title && <h2 className="text-[14px] font-semibold mb-1">{promptState.opts.title}</h2>}
                <p className="text-[12.5px] text-foreground whitespace-pre-wrap mb-3">{promptState.opts.message}</p>
                <input
                  autoFocus
                  type={promptState.opts.inputType || "text"}
                  value={promptState.value}
                  placeholder={promptState.opts.placeholder}
                  onChange={(e) => setPromptState({ ...promptState, value: e.target.value, err: null })}
                  className="w-full bg-secondary border-0 rounded px-3 py-2 text-[13px] ring-1 ring-border focus:ring-brand/30 outline-none"
                />
                {promptState.err && <p className="text-[11px] text-danger mt-1.5">{promptState.err}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => closePrompt(null)}
                className="text-[12px] font-medium py-1.5 px-4 rounded-md ring-1 ring-border hover:bg-secondary cursor-pointer"
              >
                {promptState.opts.cancelLabel || "Cancelar"}
              </button>
              <button
                type="submit"
                className="text-[12px] font-medium py-1.5 px-4 rounded-md bg-brand text-brand-foreground hover:brightness-110 cursor-pointer"
              >
                {promptState.opts.confirmLabel || "Aceptar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </DialogContext.Provider>
  );
}

// ============================================================
// Hook
// ============================================================

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (ctx) return ctx;
  // Fallback defensivo: si por alguna razón se usa fuera del provider,
  // cae a window.* nativos para no romper nada.
  return {
    toast: (msg) => window.alert(msg),
    confirm: async (opts) => window.confirm(opts.message),
    prompt: async (opts) => window.prompt(opts.message, opts.defaultValue || ""),
  };
}
