import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AppSidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { useAuth } from "@/hooks/use-auth";

interface PageShellProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export function PageShell({ title, subtitle, action, children }: PageShellProps) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Redirect a /login si tras cargar no hay sesión. En SSR no se ejecuta,
  // así que el HTML SSR tiene la página completa renderizada.
  useEffect(() => {
    if (!loading && !user && pathname !== "/login") {
      navigate({ to: "/login" });
    }
  }, [user, loading, navigate, pathname]);

  // Renderizamos la página SIEMPRE — sin bloquear por auth. Esto garantiza
  // que el SSR devuelve HTML completo (sidebar + botones + contenido) y
  // que el cliente siempre puede navegar aunque getSession() no resuelva.
  // Si tras hidratar no hay sesión, el useEffect de arriba redirige a /login.
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <AppSidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <Topbar title={title} subtitle={subtitle} action={action} />
        <div className="flex-1 px-6 pt-6 pb-12">{children}</div>
      </main>
    </div>
  );
}
