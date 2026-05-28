import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, RotateCcw, Shield } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, SectionHeader } from "@/components/app/ui-bits";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/use-permissions";
import { useDialog } from "@/components/app/dialog-provider";

export const Route = createFileRoute("/configuracion/permisos")({
  component: PermisosPage,
  head: () => ({ meta: [{ title: "Permisos granulares · Correduría OS" }] }),
});

const ROLES = ["root", "jefe_zona", "comercial", "secretaria"] as const;
type RolKey = (typeof ROLES)[number];

const MATRIZ: Array<{ recurso: string; accion: string; defaultByRol: Record<RolKey, boolean> }> = [
  { recurso: "clientes",     accion: "ver",      defaultByRol: { root: true, jefe_zona: true, comercial: true, secretaria: true } },
  { recurso: "clientes",     accion: "crear",    defaultByRol: { root: true, jefe_zona: true, comercial: true, secretaria: true } },
  { recurso: "clientes",     accion: "editar",   defaultByRol: { root: true, jefe_zona: true, comercial: true, secretaria: true } },
  { recurso: "clientes",     accion: "eliminar", defaultByRol: { root: true, jefe_zona: false, comercial: false, secretaria: false } },
  { recurso: "comisiones",   accion: "ver",      defaultByRol: { root: true, jefe_zona: true, comercial: true, secretaria: false } },
  { recurso: "comisiones",   accion: "aprobar",  defaultByRol: { root: true, jefe_zona: false, comercial: false, secretaria: false } },
  { recurso: "polizas",      accion: "eliminar", defaultByRol: { root: true, jefe_zona: false, comercial: false, secretaria: false } },
  { recurso: "facturacion",  accion: "ver",      defaultByRol: { root: true, jefe_zona: true, comercial: true, secretaria: false } },
  { recurso: "reportes",     accion: "ver",      defaultByRol: { root: true, jefe_zona: true, comercial: false, secretaria: false } },
];

function PermisosPage() {
  const { esRoot, loading } = usePermissions();
  const { toast, confirm } = useDialog();
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());
  const [busy, setBusy] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  const cargar = async () => {
    setLoadingData(true);
    const { data } = await supabase.from("permisos_granulares").select("rol, recurso, accion, permitido");
    const m = new Map<string, boolean>();
    (data || []).forEach((p: any) => {
      m.set(`${p.rol}|${p.recurso}|${p.accion}`, p.permitido);
    });
    setOverrides(m);
    setLoadingData(false);
  };

  useEffect(() => { cargar(); }, []);

  const valor = useMemo(() => (rol: RolKey, recurso: string, accion: string, def: boolean) => {
    const key = `${rol}|${recurso}|${accion}`;
    return overrides.has(key) ? overrides.get(key)! : def;
  }, [overrides]);

  if (!loading && !esRoot) {
    return (
      <PageShell title="Sin acceso">
        <Card className="p-8 text-center">
          <Shield className="size-8 text-ink-subtle mx-auto mb-3" />
          <p className="text-[13px] text-ink-subtle">Solo root puede gestionar permisos granulares.</p>
          <Link to="/configuracion" className="text-[12px] text-brand hover:underline">← Volver</Link>
        </Card>
      </PageShell>
    );
  }

  const toggle = async (rol: RolKey, recurso: string, accion: string, def: boolean) => {
    const actual = valor(rol, recurso, accion, def);
    const nuevo = !actual;
    setBusy(true);
    const { error } = await supabase.from("permisos_granulares").upsert({
      rol, recurso, accion, permitido: nuevo, updated_at: new Date().toISOString(),
    }, { onConflict: "rol,recurso,accion" });
    setBusy(false);
    if (error) toast("Error: " + error.message, "error");
    else {
      const m = new Map(overrides);
      m.set(`${rol}|${recurso}|${accion}`, nuevo);
      setOverrides(m);
    }
  };

  const restablecer = async () => {
    const ok = await confirm({ message: "¿Eliminar TODOS los overrides y volver a defaults?", tone: "danger" });
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase.from("permisos_granulares").delete().not("id", "is", null);
    setBusy(false);
    if (error) toast("Error: " + error.message, "error");
    else { toast("Permisos restablecidos a defaults", "success"); cargar(); }
  };

  return (
    <PageShell
      title="Permisos granulares"
      subtitle="Matriz de permisos por rol. Las celdas marcadas en azul son overrides del default del rol."
      action={
        <div className="flex items-center gap-2">
          <Link to="/configuracion" className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
            <ArrowLeft className="size-3.5" /> Volver
          </Link>
          <button
            type="button"
            onClick={restablecer}
            disabled={busy}
            className="text-[12px] font-medium py-1.5 px-3 rounded-md ring-1 ring-danger/30 text-danger hover:bg-danger/5 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="size-3.5" /> Restablecer a defaults
          </button>
        </div>
      }
    >
      <Card>
        <SectionHeader title="Matriz permisos" hint={loadingData ? "Cargando…" : `${overrides.size} overrides activos`} />
        <div className="overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Recurso</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Acción</th>
                {ROLES.map((r) => (
                  <th key={r} className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-center">{r}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {MATRIZ.map((row, i) => (
                <tr key={i} className="hover:bg-secondary/30">
                  <td className="px-4 py-2.5 text-[12px] font-medium">{row.recurso}</td>
                  <td className="px-4 py-2.5 text-[11px] font-mono text-ink-muted">{row.accion}</td>
                  {ROLES.map((rol) => {
                    const def = row.defaultByRol[rol];
                    const actual = valor(rol, row.recurso, row.accion, def);
                    const isOverride = overrides.has(`${rol}|${row.recurso}|${row.accion}`);
                    return (
                      <td key={rol} className="px-4 py-2.5 text-center">
                        <label className="inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={actual}
                            onChange={() => toggle(rol, row.recurso, row.accion, def)}
                            disabled={busy}
                            title={`${rol} ${row.recurso}/${row.accion}`}
                            className={[
                              "size-4 rounded ring-1 cursor-pointer",
                              isOverride ? "ring-brand" : "ring-border",
                            ].join(" ")}
                          />
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 mt-4">
        <p className="text-[11.5px] text-ink-muted">
          <strong className="text-foreground">Nota:</strong> esta matriz refleja overrides explícitos.
          Cuando un permiso no tiene override en la tabla, la app usa el <em>default</em> del rol
          (definido en <code className="font-mono">use-permissions.tsx</code>). Para que un override
          realmente afecte la UI hay que leerlo desde el hook — los toggles ya quedan persistidos
          en <code className="font-mono">permisos_granulares</code>.
        </p>
      </Card>
    </PageShell>
  );
}
