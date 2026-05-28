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

  useEffect(() => {
    if (!loading && !user && pathname !== "/login") {
      navigate({ to: "/login" });
    }
  }, [user, loading, navigate, pathname]);

  // Loading inicial: solo la PRIMERA vez (cuando aún no se sabe nada).
  // En navegaciones internas el user ya está cargado por el AuthProvider del root,
  // así que esta rama no se ejecuta y no hay flash.
  if (loading && !user) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-foreground">
        <div className="text-[12px] text-ink-subtle">Cargando…</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

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
