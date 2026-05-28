import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { Modal } from "@/components/app/ui-bits";

export interface DetailRow {
  label: string;
  value: ReactNode;
}

export interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  rows: DetailRow[];
  /** Si se pasa, muestra un link "Abrir ficha completa →" abajo */
  fullViewTo?: string;
  fullViewParams?: Record<string, string>;
}

export function DetailModal({ isOpen, onClose, title, subtitle, rows, fullViewTo, fullViewParams }: DetailModalProps) {
  const navigate = useNavigate();

  // Cerrar el modal ANTES (síncrono, libera el portal) y luego navegar.
  // Si cerramos después, el modal se desmonta a medio camino y la
  // transición de TanStack Router puede cancelarse.
  const irAFicha = async () => {
    if (!fullViewTo) return;
    onClose();
    // Esperar un microtick para que React procese el unmount del modal
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await navigate({ to: fullViewTo as any, params: fullViewParams as any });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-3">
        {subtitle && <p className="text-[11px] text-ink-subtle -mt-2 mb-3">{subtitle}</p>}
        <dl className="divide-y divide-border rounded-md ring-1 ring-border overflow-hidden">
          {rows.map((r, i) => (
            <div key={i} className="flex items-start justify-between gap-4 px-3 py-2 text-[12px]">
              <dt className="text-ink-subtle shrink-0">{r.label}</dt>
              <dd className="text-foreground font-medium text-right break-words">{r.value || "—"}</dd>
            </div>
          ))}
        </dl>
        {fullViewTo && (
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={irAFicha}
              className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 flex items-center gap-1.5 cursor-pointer"
            >
              <ExternalLink className="size-3.5" /> Abrir ficha completa
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
