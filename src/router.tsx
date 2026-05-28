import { QueryClient } from "@tanstack/react-query";
import { createRouter, ErrorComponent } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Spinner global mostrado mientras un loader está pendiente.
// Sin esto, clicar un Link no da feedback hasta que el loader resuelve
// (puede tardar varios segundos con queries lentas) — el usuario percibe
// que el botón no funciona.
function GlobalPending() {
  return (
    <div className="min-h-screen grid place-items-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-3">
        <div className="size-6 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
        <div className="text-[11px] text-ink-subtle font-mono uppercase tracking-widest">Cargando…</div>
      </div>
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // 400ms antes de mostrar pending UI — navegaciones rápidas no
    // muestran spinner (evita flash desagradable). Solo se muestra si
    // el loader tarda >400ms.
    defaultPendingMs: 400,
    defaultPendingMinMs: 200,
    defaultPendingComponent: GlobalPending,
    defaultErrorComponent: ErrorComponent,
  });

  return router;
};
