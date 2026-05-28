import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Database, ExternalLink, Shield, RefreshCw, Save } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, SectionHeader, StatusBadge } from "@/components/app/ui-bits";
import { usePermissions } from "@/hooks/use-permissions";
import { useDialog } from "@/components/app/dialog-provider";

export const Route = createFileRoute("/configuracion/backup")({
  component: BackupPage,
  head: () => ({ meta: [{ title: "Backups · Correduría OS" }] }),
});

const DEFAULT_PROJECT_REF = "ivkjpcgkrihixrdyvdsj";

interface BackupItem {
  id?: string | number;
  status?: string;
  inserted_at?: string;
  is_physical_backup?: boolean;
  region?: string;
  [k: string]: any;
}

function BackupPage() {
  const { esRoot, loading } = usePermissions();
  const { toast } = useDialog();
  const [pat, setPat] = useState("");
  const [projectRef, setProjectRef] = useState(DEFAULT_PROJECT_REF);
  const [busy, setBusy] = useState(false);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const listarBackups = async () => {
    if (!pat || !projectRef) { setBackups([]); return; }
    setLoadingList(true);
    try {
      const r = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/backups`, {
        headers: { Authorization: `Bearer ${pat}` },
      });
      if (r.status === 401 || r.status === 403) {
        toast("PAT inválido o sin permiso al proyecto.", "error");
        setBackups([]);
        return;
      }
      if (!r.ok) {
        toast(`Error ${r.status} al listar backups.`, "error");
        setBackups([]);
        return;
      }
      const j = await r.json();
      const items: BackupItem[] = Array.isArray(j) ? j : j?.backups || j?.physical_backup_data || [];
      setBackups(items);
    } catch (e: any) {
      toast("Error de red: " + (e?.message || String(e)), "error");
      setBackups([]);
    } finally {
      setLoadingList(false);
    }
  };

  // Recargar lista cuando cambia el PAT (con leve debounce manual)
  useEffect(() => {
    if (!pat) { setBackups([]); return; }
    const t = setTimeout(() => { void listarBackups(); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pat, projectRef]);

  const crearBackup = async () => {
    if (!pat) { toast("Necesitas un Personal Access Token.", "warning"); return; }
    if (!projectRef) { toast("Falta project ref.", "warning"); return; }
    setBusy(true);
    try {
      const r = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/backups/restore-point`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pat}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: `manual-${new Date().toISOString()}` }),
      });
      if (r.ok || r.status === 200 || r.status === 201) {
        toast("Snapshot manual creado.", "success");
        void listarBackups();
      } else if (r.status === 401 || r.status === 403) {
        toast("PAT inválido o sin permiso para crear backups.", "error");
      } else {
        const txt = await r.text().catch(() => "");
        toast(`Error ${r.status}: ${txt.slice(0, 200)}`, "error");
      }
    } catch (e: any) {
      toast("Error de red: " + (e?.message || String(e)), "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <PageShell title="Backups">
        <Card className="p-8 text-center text-[13px] text-ink-subtle">Cargando…</Card>
      </PageShell>
    );
  }

  if (!esRoot) {
    return (
      <PageShell title="Sin acceso">
        <Card className="p-8 text-center">
          <Shield className="size-8 text-ink-subtle mx-auto mb-3" />
          <p className="text-[13px] text-ink-subtle">Solo root puede gestionar backups.</p>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Backups y restore"
      subtitle="Snapshots manuales adicionales a los diarios automáticos de Supabase"
      action={
        <Link to="/configuracion" className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
          <ArrowLeft className="size-3.5" /> Volver
        </Link>
      }
    >
      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-12 lg:col-span-7 space-y-6">
          <Card className="p-4 bg-info/5 ring-info/20">
            <div className="flex items-start gap-2.5 text-[12px]">
              <Database className="size-4 text-info shrink-0 mt-0.5" />
              <div className="text-ink-muted">
                <strong className="text-info">Supabase ya hace backups diarios automáticos.</strong> Este botón crea un
                snapshot manual adicional vía Management API. Útil antes de migraciones o despliegues sensibles.
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader title="Crear snapshot manual" hint="Necesitas un Personal Access Token de Supabase" />
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-ink-subtle mb-1">Personal Access Token</label>
                <input
                  type="password"
                  value={pat}
                  onChange={(e) => setPat(e.target.value)}
                  placeholder="sbp_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none font-mono"
                />
                <p className="text-[10px] text-ink-subtle mt-1">
                  Genera uno en{" "}
                  <a href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noreferrer" className="text-brand hover:underline inline-flex items-center gap-0.5">
                    supabase.com/dashboard/account/tokens <ExternalLink className="size-2.5" />
                  </a>
                </p>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-ink-subtle mb-1">Project ref</label>
                <input
                  type="text"
                  value={projectRef}
                  onChange={(e) => setProjectRef(e.target.value)}
                  placeholder="ivkjpcgkrihixrdyvdsj"
                  className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none font-mono"
                />
              </div>
              <button
                type="button"
                onClick={crearBackup}
                disabled={busy || !pat || !projectRef}
                className="text-[12px] font-medium py-2 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save className="size-3.5" /> {busy ? "Creando snapshot…" : "Crear backup manual"}
              </button>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <SectionHeader title="Backups disponibles" hint={pat ? "Listado vivo desde Management API" : "Introduce el PAT para listar"} />
              <button
                type="button"
                onClick={() => void listarBackups()}
                disabled={!pat || loadingList}
                className="text-[11px] py-1 px-2.5 rounded ring-1 ring-border hover:bg-secondary flex items-center gap-1 cursor-pointer disabled:opacity-40"
              >
                <RefreshCw className={["size-3", loadingList ? "animate-spin" : ""].join(" ")} /> Refrescar
              </button>
            </div>
            {!pat ? (
              <div className="p-6 text-center text-[12px] text-ink-subtle">
                Sin PAT no se pueden listar los backups.
              </div>
            ) : backups.length === 0 ? (
              <div className="p-6 text-center text-[12px] text-ink-subtle">
                {loadingList ? "Cargando…" : "Sin backups o respuesta vacía."}
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-secondary/40 border-b border-border">
                    <th className="px-3 py-2 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Fecha</th>
                    <th className="px-3 py-2 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Tipo</th>
                    <th className="px-3 py-2 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Región</th>
                    <th className="px-3 py-2 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {backups.map((b, i) => (
                    <tr key={String(b.id ?? i)} className="hover:bg-secondary/30">
                      <td className="px-3 py-2 text-[11px] font-mono text-ink-muted whitespace-nowrap">
                        {b.inserted_at ? new Date(b.inserted_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2 text-[11px]">{b.is_physical_backup ? "Físico" : "Lógico"}</td>
                      <td className="px-3 py-2 text-[11px] font-mono text-ink-muted">{b.region || "—"}</td>
                      <td className="px-3 py-2">
                        <StatusBadge tone={b.status === "COMPLETED" ? "success" : b.status === "FAILED" ? "danger" : "neutral"}>
                          {b.status || "—"}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </section>

        <aside className="col-span-12 lg:col-span-5 space-y-6">
          <Card className="p-5">
            <SectionHeader title="Restaurar" />
            <p className="text-[12px] text-ink-muted mb-3">
              El restore solo se puede hacer desde el dashboard oficial de Supabase, ya que requiere downtime y
              confirmación manual.
            </p>
            <a
              href={`https://supabase.com/dashboard/project/${projectRef || DEFAULT_PROJECT_REF}/database/backups`}
              target="_blank"
              rel="noreferrer"
              className="text-[12px] font-medium py-1.5 px-3 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer w-fit"
            >
              <ExternalLink className="size-3.5" /> Abrir restore en Supabase
            </a>
          </Card>

          <Card className="p-5">
            <SectionHeader title="Notas" />
            <ul className="text-[11.5px] text-ink-muted space-y-2 list-disc pl-4">
              <li>El PAT NO se guarda en la base de datos. Vive solo en la memoria de tu navegador hasta que recargues la página.</li>
              <li>Los snapshots manuales cuentan contra el límite del plan.</li>
              <li>Para restaurar un backup, usa el dashboard oficial — esta vista es solo lectura + crear.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </PageShell>
  );
}
