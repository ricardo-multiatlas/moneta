import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  FileText,
  CalendarClock,
  Wallet,
  ReceiptText,
  TrendingUp,
  Settings,
  LogOut,
  User,
  UsersRound,
  Calculator,
  FileSignature,
  Send,
  Banknote,
  FileBarChart,
  PenLine,
  BarChart3,
  CheckCheck,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions, type Rol } from "@/hooks/use-permissions";
import { supabase } from "@/lib/supabase";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  /** Roles que ven esta entrada. Vacío = todos. */
  allow?: Rol[];
};

const nav: NavItem[] = [
  { to: "/", label: "Panel", icon: LayoutDashboard, exact: true },
  // Comerciales tienen su propio panel
  { to: "/mi-panel", label: "Mi panel", icon: User, allow: ["comercial"] },
  // Jefe de zona tiene su dashboard
  { to: "/dashboard-zona", label: "Dashboard zona", icon: LayoutDashboard, allow: ["jefe_zona"] },
  // Jefes de zona y root ven equipo
  { to: "/equipo", label: "Mi equipo", icon: UsersRound, allow: ["root", "admin", "jefe_zona"] },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/polizas", label: "Pólizas", icon: FileText },
  { to: "/vencimientos", label: "Vencimientos", icon: CalendarClock },
  // Comisiones: secretaria NO ve
  { to: "/comisiones", label: "Comisiones", icon: Wallet, allow: ["root", "admin", "jefe_zona", "comercial"] },
  // Facturación: secretaria NO ve financiero
  { to: "/facturacion", label: "Facturación", icon: ReceiptText, allow: ["root", "admin", "jefe_zona", "comercial"] },
  { to: "/captacion", label: "Captación", icon: TrendingUp },
  { to: "/analisis", label: "Análisis", icon: BarChart3, allow: ["root", "admin", "jefe_zona"] },
  { to: "/presupuestos", label: "Presupuestos", icon: FileSignature, allow: ["root", "admin", "jefe_zona", "comercial"] },
  { to: "/tarificador", label: "Tarificador", icon: Calculator, allow: ["root", "admin", "jefe_zona", "comercial"] },
  { to: "/comunicaciones", label: "Comunicaciones", icon: Send, allow: ["root", "admin", "jefe_zona"] },
  { to: "/liquidaciones", label: "Liquidaciones", icon: Banknote, allow: ["root", "admin"] },
  { to: "/firmas", label: "Firmas", icon: PenLine, allow: ["root", "admin", "jefe_zona", "comercial"] },
  { to: "/reportes", label: "Reportes", icon: FileBarChart, allow: ["root", "admin", "jefe_zona"] },
  { to: "/aprobaciones", label: "Aprobaciones", icon: CheckCheck, allow: ["root", "admin", "jefe_zona", "secretaria"] },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, signOut } = useAuth();
  const { rol, perfil, esRoot } = usePermissions();
  const displayName = perfil?.nombre || (user?.user_metadata as any)?.nombre || user?.email?.split("@")[0] || "Usuario";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
  const visibleNav = nav.filter((item) => !item.allow || (rol && item.allow.includes(rol)));

  // Badge: pendientes de aprobación (solo root)
  const [pendientes, setPendientes] = useState<number>(0);
  useEffect(() => {
    if (!esRoot) return;
    let alive = true;
    (async () => {
      try {
        const { count } = await supabase
          .from("aprobaciones")
          .select("*", { count: "exact", head: true })
          .eq("estado", "pendiente");
        if (alive) setPendientes(count || 0);
      } catch {
        if (alive) setPendientes(0);
      }
    })();
    return () => { alive = false; };
  }, [esRoot, pathname]);

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar sticky top-0 h-screen">
      <div className="px-5 pt-5 pb-4">
        <Link to="/" className="flex flex-col items-start gap-2">
          <img
            src="/moneta-logo.png"
            alt="Moneta Seguros"
            className="h-8 w-auto object-contain"
          />
          <div className="text-[10px] text-ink-subtle font-mono uppercase tracking-widest">
            Correduría OS · Sevilla
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        <div className="px-2 pt-3 pb-1.5 text-[10px] font-medium uppercase tracking-widest text-ink-subtle">
          Operativa
        </div>
        {visibleNav.map((item) => {
          const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
          const Icon = item.icon;
          const showBadge = esRoot && item.to === "/aprobaciones" && pendientes > 0;
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
              {showBadge && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-warning/15 text-warning text-[10px] font-mono font-semibold px-1.5">
                  {pendientes}
                </span>
              )}
            </Link>
          );
        })}

        <div className="px-2 pt-5 pb-1.5 text-[10px] font-medium uppercase tracking-widest text-ink-subtle">
          Sistema
        </div>
        <Link
          to="/configuracion"
          className={[
            "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-colors",
            pathname.startsWith("/configuracion")
              ? "bg-sidebar-accent text-foreground"
              : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
          ].join(" ")}
        >
          <Settings className={["size-4 shrink-0", pathname.startsWith("/configuracion") ? "text-brand" : "text-ink-subtle"].join(" ")} strokeWidth={2} />
          <span>Configuración</span>
        </Link>
      </nav>

      <div className="p-3 border-t border-sidebar-border space-y-2">
        <div className="rounded-md bg-foreground text-background px-2.5 py-1.5 flex items-center gap-2" title="Soberanía de datos activa · Infraestructura MultiAtlas">
          <span className="size-1.5 rounded-full bg-success animate-pulse shrink-0" />
          <span className="text-[10px] font-mono uppercase tracking-widest opacity-70 truncate">Madrid · ES-CENT-01</span>
        </div>
        <div className="flex items-center gap-2.5 px-1">
          <div className="size-8 rounded-full bg-brand-soft text-brand grid place-items-center text-xs font-semibold">
            {initials || "—"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-medium truncate">{displayName}</div>
            <div className="text-[10px] text-ink-subtle truncate">{user?.email || "Sin sesión"}</div>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            title="Cerrar sesión"
            className="p-1.5 rounded hover:bg-secondary text-ink-subtle hover:text-foreground transition-colors cursor-pointer"
          >
            <LogOut className="size-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
