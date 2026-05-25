import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={["bg-surface rounded-xl ring-1 ring-border/80 shadow-[0_1px_2px_rgba(15,30,45,0.04)]", className].join(" ")}>
      {children}
    </div>
  );
}

export function SectionHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between mb-3">
      <div>
        <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
        {hint && <p className="text-[11px] text-ink-subtle mt-0.5">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export type StatusTone = "success" | "warning" | "danger" | "neutral" | "info" | "brand";

const toneMap: Record<StatusTone, string> = {
  success: "bg-success/10 text-success ring-success/20",
  warning: "bg-warning/12 text-warning ring-warning/25",
  danger: "bg-danger/10 text-danger ring-danger/20",
  neutral: "bg-secondary text-muted-foreground ring-border",
  info: "bg-info/10 text-info ring-info/20",
  brand: "bg-brand-soft text-brand ring-brand/15",
};

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: StatusTone }) {
  return (
    <span
      className={[
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ring-inset whitespace-nowrap",
        toneMap[tone],
      ].join(" ")}
    >
      {children}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  delta,
  deltaTone = "success",
  hint,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: StatusTone;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-[10px] font-medium text-ink-subtle uppercase tracking-widest mb-2">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-[22px] font-semibold tracking-tight font-display">{value}</span>
        {delta && (
          <span
            className={[
              "text-[10px] font-medium",
              deltaTone === "success" ? "text-success" : deltaTone === "warning" ? "text-warning" : deltaTone === "danger" ? "text-danger" : "text-ink-subtle",
            ].join(" ")}
          >
            {delta}
          </span>
        )}
      </div>
      {hint && <p className="text-[10px] text-ink-subtle mt-1.5 font-mono">{hint}</p>}
    </Card>
  );
}

export function RamoChip({ ramo }: { ramo: string }) {
  const map: Record<string, string> = {
    Auto: "bg-info/10 text-info ring-info/20",
    Hogar: "bg-warning/12 text-warning ring-warning/25",
    Vida: "bg-brand-soft text-brand ring-brand/15",
    Salud: "bg-success/10 text-success ring-success/20",
    RC: "bg-accent text-accent-foreground ring-border",
    Decesos: "bg-secondary text-muted-foreground ring-border",
    Comercio: "bg-chart-5/10 text-chart-5 ring-border",
  };
  return (
    <span className={["inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ring-1 ring-inset", map[ramo] ?? "bg-secondary text-muted-foreground ring-border"].join(" ")}>
      {ramo}
    </span>
  );
}

export function MoneyEUR({ value }: { value: number }) {
  return (
    <span className="font-mono tabular-nums">
      {new Intl.NumberFormat("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)} €
    </span>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="text-center py-10 text-[12px] text-ink-subtle">{children}</div>
  );
}
