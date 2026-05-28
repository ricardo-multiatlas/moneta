import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Trophy, Crown, BarChart3 } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, MoneyEUR, RamoChip, SectionHeader, StatusBadge } from "@/components/app/ui-bits";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/analisis")({
  component: AnalisisPage,
  head: () => ({ meta: [{ title: "Análisis comercial · Correduría OS" }] }),
});

type Tab = "aseguradora" | "ramo" | "comercial" | "tendencia";

interface LoadResult {
  porAseguradora: any[];
  porRamo: any[];
  porComercial: any[];
  tendencia: any[];
  missing: { aseguradora: boolean; ramo: boolean; comercial: boolean; tendencia: boolean };
}

async function safeView(nombre: string): Promise<{ data: any[]; missing: boolean }> {
  try {
    const { data, error } = await supabase.from(nombre).select("*");
    if (error) {
      // Si la vista no existe Postgres devuelve un error
      return { data: [], missing: true };
    }
    return { data: data || [], missing: false };
  } catch {
    return { data: [], missing: true };
  }
}

function AnalisisPage() {
  const { esRoot, esJefeZona, loading } = usePermissions();
  const [tab, setTab] = useState<Tab>("aseguradora");
  const [data, setData] = useState<LoadResult | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    (async () => {
      setBusy(true);
      const [aseg, ramo, com, tend] = await Promise.all([
        safeView("vw_ventas_por_aseguradora"),
        safeView("vw_ventas_por_ramo"),
        safeView("vw_ventas_por_comercial"),
        safeView("vw_tendencia_mensual"),
      ]);
      setData({
        porAseguradora: aseg.data,
        porRamo: ramo.data,
        porComercial: com.data,
        tendencia: tend.data,
        missing: {
          aseguradora: aseg.missing,
          ramo: ramo.missing,
          comercial: com.missing,
          tendencia: tend.missing,
        },
      });
      setBusy(false);
    })();
  }, []);

  if (!loading && !esRoot && !esJefeZona) {
    return (
      <PageShell title="Sin acceso">
        <Card className="p-8 text-center text-[13px] text-ink-subtle">
          Análisis comercial solo disponible para root o jefes de zona.
        </Card>
      </PageShell>
    );
  }

  if (busy || !data) {
    return (
      <PageShell title="Análisis comercial">
        <Card className="p-8 text-center text-[13px] text-ink-subtle">Cargando…</Card>
      </PageShell>
    );
  }

  const algunaFalta =
    data.missing.aseguradora || data.missing.ramo || data.missing.comercial || data.missing.tendencia;

  return (
    <PageShell
      title="Análisis comercial"
      subtitle="Vista ejecutiva de ventas por aseguradora, ramo, comercial y tendencia mensual."
    >
      {algunaFalta && (
        <div className="mb-5 rounded-md bg-warning/5 ring-1 ring-warning/30 px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
          <div className="text-[12px] text-warning">
            <p className="font-medium">Algunas vistas no responden</p>
            <p className="mt-0.5 text-ink-muted">
              Si el aviso persiste tras recargar, contacta con el administrador.
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-1 mb-5 text-[12px] w-fit bg-secondary/40 rounded-md p-1">
        {([
          ["aseguradora", "Por aseguradora"],
          ["ramo", "Por ramo"],
          ["comercial", "Por comercial"],
          ["tendencia", "Tendencia 12 meses"],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={[
              "py-1 px-3 rounded font-medium transition-colors",
              tab === id ? "bg-surface ring-1 ring-border" : "text-ink-subtle hover:text-foreground",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "aseguradora" && (
        <Card>
          <div className="px-4 py-3 border-b border-border">
            <SectionHeader
              title="Ventas por aseguradora"
              hint={`${data.porAseguradora.length} compañía${data.porAseguradora.length === 1 ? "" : "s"}`}
            />
          </div>
          {data.porAseguradora.length === 0 ? (
            <div className="p-8 text-center text-[12px] text-ink-subtle">Sin datos.</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-secondary/40 border-b border-border">
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Aseguradora</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Activas</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Prima</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Comisión</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Rentabilidad %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.porAseguradora.map((r: any, i: number) => (
                  <tr key={r.aseguradora} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-[12.5px] font-medium flex items-center gap-2">
                      {r.aseguradora}
                      {i === 0 && <StatusBadge tone="brand">Líder</StatusBadge>}
                    </td>
                    <td className="px-4 py-3 text-[12px] font-mono tabular-nums">{r.activas}</td>
                    <td className="px-4 py-3 text-[12px]"><MoneyEUR value={Number(r.prima_activa || 0)} /></td>
                    <td className="px-4 py-3 text-[12px]"><MoneyEUR value={Number(r.comision_total || 0)} /></td>
                    <td className="px-4 py-3 text-[12px] font-mono tabular-nums">
                      {r.rentabilidad_pct != null ? `${r.rentabilidad_pct}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === "ramo" && (
        <Card>
          <div className="px-4 py-3 border-b border-border">
            <SectionHeader title="Ventas por ramo" hint={`${data.porRamo.length} ramo${data.porRamo.length === 1 ? "" : "s"}`} />
          </div>
          {data.porRamo.length === 0 ? (
            <div className="p-8 text-center text-[12px] text-ink-subtle">Sin datos.</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-secondary/40 border-b border-border">
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Ramo</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Activas</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Prima activa</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Comisión total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.porRamo.map((r: any) => (
                  <tr key={r.ramo} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-[12px]"><RamoChip ramo={r.ramo} /></td>
                    <td className="px-4 py-3 text-[12px] font-mono tabular-nums">{r.activas}</td>
                    <td className="px-4 py-3 text-[12px]"><MoneyEUR value={Number(r.prima_activa || 0)} /></td>
                    <td className="px-4 py-3 text-[12px]"><MoneyEUR value={Number(r.comision_total || 0)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === "comercial" && (
        <Card>
          <div className="px-4 py-3 border-b border-border">
            <SectionHeader title="Ventas por comercial" hint={`${data.porComercial.length} comercial${data.porComercial.length === 1 ? "" : "es"}`} />
          </div>
          {data.porComercial.length === 0 ? (
            <div className="p-8 text-center text-[12px] text-ink-subtle">Sin datos.</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-secondary/40 border-b border-border">
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Comercial</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Zona</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Clientes</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Pólizas activas</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Prima total</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Comisión anual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.porComercial.map((r: any, i: number) => (
                  <tr key={r.comercial_id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-[12.5px] font-medium flex items-center gap-2">
                      {i === 0 && <Trophy className="size-3.5 text-warning" />}
                      {r.comercial_nombre}
                    </td>
                    <td className="px-4 py-3 text-[11.5px] text-ink-muted">{r.zona_nombre || "—"}</td>
                    <td className="px-4 py-3 text-[12px] font-mono tabular-nums">{r.clientes_count}</td>
                    <td className="px-4 py-3 text-[12px] font-mono tabular-nums">{r.polizas_activas}</td>
                    <td className="px-4 py-3 text-[12px]"><MoneyEUR value={Number(r.prima_total || 0)} /></td>
                    <td className="px-4 py-3 text-[12px]"><MoneyEUR value={Number(r.comision_anual || 0)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === "tendencia" && (
        <div className="grid grid-cols-12 gap-6">
          <Card className="col-span-12 lg:col-span-8 p-5">
            <SectionHeader title="Pólizas nuevas por mes" hint="Últimos 12 meses" />
            {data.tendencia.length === 0 ? (
              <div className="p-8 text-center text-[12px] text-ink-subtle">Sin datos.</div>
            ) : (
              <BarChart rows={data.tendencia} />
            )}
          </Card>
          <Card className="col-span-12 lg:col-span-4">
            <div className="px-4 py-3 border-b border-border">
              <SectionHeader title="Detalle mensual" hint={`${data.tendencia.length} mes${data.tendencia.length === 1 ? "" : "es"}`} />
            </div>
            {data.tendencia.length === 0 ? (
              <div className="p-8 text-center text-[12px] text-ink-subtle">Sin datos.</div>
            ) : (
              <ol className="divide-y divide-border">
                {data.tendencia.map((m: any) => (
                  <li key={m.mes} className="flex items-center justify-between px-4 py-2.5 text-[12px]">
                    <div>
                      <div className="font-medium">{formatMes(m.mes)}</div>
                      <div className="text-[10.5px] text-ink-subtle font-mono">{m.polizas_nuevas} pólizas</div>
                    </div>
                    <MoneyEUR value={Number(m.prima_nueva || 0)} />
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      )}

      {/* Icono utilitario para que tsc no avise por import */}
      <BarChart3 className="hidden" />
      <Crown className="hidden" />
    </PageShell>
  );
}

function formatMes(mes: string): string {
  const d = new Date(mes);
  return d.toLocaleDateString("es-ES", { month: "short", year: "numeric" });
}

function BarChart({ rows }: { rows: any[] }) {
  const max = Math.max(...rows.map((r) => Number(r.polizas_nuevas || 0)), 1);
  return (
    <div className="flex items-end gap-2 h-56 mt-3">
      {rows.map((r) => {
        const h = Math.round((Number(r.polizas_nuevas || 0) / max) * 100);
        return (
          <div key={r.mes} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
            <div className="text-[10px] font-mono text-ink-muted">{r.polizas_nuevas}</div>
            <div
              className="w-full rounded-t bg-brand/80 hover:bg-brand transition-colors"
              style={{ height: `${h}%`, minHeight: r.polizas_nuevas > 0 ? "4px" : "1px" }}
              title={`${formatMes(r.mes)}: ${r.polizas_nuevas} pólizas`}
            />
            <div className="text-[10px] text-ink-subtle font-mono truncate w-full text-center">
              {new Date(r.mes).toLocaleDateString("es-ES", { month: "short" })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
