import { Eye, Pencil, Printer, Download, Check, X, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

interface RowAction {
  icon: "view" | "edit" | "print" | "download" | "check" | "x" | "trash";
  label: string;
  /** Si se pasa `to`, se renderiza como Link de TanStack Router. */
  to?: string;
  params?: Record<string, string>;
  /** Si se pasa `onClick`, se renderiza como botón. */
  onClick?: () => void;
  /** Desactiva la acción sin ocultarla. */
  disabled?: boolean;
  /** Color del icono (default neutral). `danger` para destructivas. */
  tone?: "neutral" | "brand" | "danger";
}

const iconMap = { view: Eye, edit: Pencil, print: Printer, download: Download, check: Check, x: X, trash: Trash2 };

export function RowActions({ actions }: { actions: RowAction[] }) {
  return (
    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      {actions.map((a, i) => {
        const Icon = iconMap[a.icon];
        const className = [
          "p-1.5 rounded transition-colors cursor-pointer",
          a.disabled
            ? "text-ink-subtle/40 cursor-not-allowed"
            : a.tone === "brand"
              ? "text-brand hover:bg-brand-soft"
              : a.tone === "danger"
                ? "text-danger hover:bg-danger/10"
                : "text-ink-subtle hover:bg-secondary hover:text-foreground",
        ].join(" ");
        if (a.to && !a.disabled) {
          return (
            <Link
              key={i}
              to={a.to as any}
              params={a.params as any}
              title={a.label}
              aria-label={a.label}
              className={className}
            >
              <Icon className="size-3.5" />
            </Link>
          );
        }
        return (
          <button
            key={i}
            type="button"
            title={a.label}
            aria-label={a.label}
            disabled={a.disabled}
            onClick={a.onClick}
            className={className}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
