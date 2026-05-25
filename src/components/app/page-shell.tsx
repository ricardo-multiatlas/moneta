import { AppSidebar } from "./sidebar";
import { Topbar } from "./topbar";

interface PageShellProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export function PageShell({ title, subtitle, action, children }: PageShellProps) {
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <AppSidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <Topbar title={title} subtitle={subtitle} action={action} />
        <div className="flex-1 px-6 pb-12">{children}</div>
      </main>
    </div>
  );
}
