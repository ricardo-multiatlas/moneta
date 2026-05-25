import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  FileText,
  CalendarClock,
  Wallet,
  ReceiptText,
  TrendingUp,
  Settings,
  ShieldCheck,
} from "lucide-react";

const nav = [
  { to: "/", label: "Panel", icon: LayoutDashboard, exact: true },
  { to: "/clientes", label: "Clientes", icon: Users, badge: "1.284" },
  { to: "/polizas", label: "Pólizas", icon: FileText },
  { to: "/vencimientos", label: "Vencimientos", icon: CalendarClock, badge: "42", badgeTone: "warning" as const },
  { to: "/comisiones", label: "Comisiones", icon: Wallet },
  { to: "/facturacion", label: "Facturación", icon: ReceiptText },
  { to: "/captacion", label: "Captación", icon: TrendingUp },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar sticky top-0 h-screen">
      <div className="px-5 pt-5 pb-4">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="size-8 rounded-md bg-brand flex items-center justify-center shadow-sm">
            <ShieldCheck className="size-4 text-brand-foreground" strokeWidth={2.4} />
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold tracking-tight">Correduría OS</div>
            <div className="text-[10px] text-ink-subtle font-mono uppercase tracking-widest">Moneta · Sevilla</div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        <div className="px-2 pt-3 pb-1.5 text-[10px] font-medium uppercase tracking-widest text-ink-subtle">
          Operativa
        </div>
        {nav.map((item) => {
          const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={[
                "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              ].join(" ")}
            >
              <Icon className={["size-4 shrink-0", active ? "text-brand" : "text-ink-subtle"].join(" ")} strokeWidth={2} />
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span
                  className={[
                    "text-[10px] font-mono px-1.5 py-0.5 rounded",
                    item.badgeTone === "warning"
                      ? "bg-warning/15 text-warning"
                      : "bg-secondary text-muted-foreground",
                  ].join(" ")}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}

        <div className="px-2 pt-5 pb-1.5 text-[10px] font-medium uppercase tracking-widest text-ink-subtle">
          Sistema
        </div>
        <Link
          to="/"
          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground transition-colors"
        >
          <Settings className="size-4 shrink-0 text-ink-subtle" strokeWidth={2} />
          <span>Configuración</span>
        </Link>
      </nav>

      <div className="p-3 border-t border-sidebar-border space-y-3">
        <div className="rounded-md bg-foreground text-background p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="size-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-[10px] font-mono uppercase tracking-widest opacity-70">Madrid · ES-CENT-01</span>
          </div>
          <div className="text-[11px] leading-snug opacity-80">
            Soberanía de datos activa. Infraestructura MultiAtlas.
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-1">
          <div className="size-8 rounded-full bg-brand-soft text-brand grid place-items-center text-xs font-semibold">
            DM
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-medium truncate">Diego Moneta</div>
            <div className="text-[10px] text-ink-subtle truncate">Administrador</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
