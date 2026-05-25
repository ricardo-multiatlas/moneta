import { Sparkles, Plus, Bell, Search } from "lucide-react";

interface TopbarProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function Topbar({ title, subtitle, action }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="h-14 px-6 flex items-center gap-4">
        <div className="flex-1 max-w-2xl relative group">
          <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none gap-1.5">
            <span className="text-[9px] font-bold font-mono text-brand bg-brand-soft px-1 py-0.5 rounded">
              IA
            </span>
            <Search className="size-3.5 text-ink-subtle" />
          </div>
          <input
            type="text"
            placeholder="muéstrame los clientes de Sevilla con auto que vence antes de septiembre…"
            className="w-full bg-secondary border-0 rounded-md pl-14 pr-3 py-1.5 text-[13px] ring-1 ring-border focus:ring-brand/30 focus:bg-surface outline-none transition-all placeholder:text-ink-subtle"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-ink-subtle bg-surface border border-border rounded px-1.5 py-0.5">
            ⌘K
          </kbd>
        </div>

        <div className="flex items-center gap-2">
          <button className="size-8 grid place-items-center rounded-md hover:bg-secondary transition-colors relative" aria-label="Notificaciones">
            <Bell className="size-4 text-ink-muted" strokeWidth={2} />
            <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-danger" />
          </button>
          <button className="flex items-center gap-1.5 bg-brand text-brand-foreground text-xs font-medium py-1.5 px-3 rounded-md hover:brightness-110 transition-all">
            <Plus className="size-3.5" strokeWidth={2.4} />
            Nueva póliza
          </button>
        </div>
      </div>

      <div className="px-6 pb-5 pt-2 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-display font-semibold tracking-tight leading-tight">{title}</h1>
          {subtitle && (
            <p className="text-[13px] text-ink-muted mt-0.5 max-w-[64ch]">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
    </header>
  );
}

export function AISuggestionBanner() {
  return (
    <div className="mx-6 mb-4 rounded-md border border-brand/15 bg-brand-soft/40 px-3.5 py-2 flex items-center gap-2.5">
      <Sparkles className="size-3.5 text-brand shrink-0" strokeWidth={2.2} />
      <span className="text-[12px] text-foreground/80">
        <span className="font-medium text-foreground">Sugerencia IA:</span> hay 3 vencimientos críticos sin aviso enviado en las últimas 24h.
      </span>
      <button className="ml-auto text-[11px] font-medium text-brand hover:underline">
        Revisar →
      </button>
    </div>
  );
}
