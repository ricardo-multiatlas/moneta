import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TrendingUp, AlertCircle } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, KpiCard, MoneyEUR, SectionHeader } from "@/components/app/ui-bits";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/use-permissions";
import { exportarExcel } from "@/lib/exportar";
import { useDialog } from "@/components/app/dialog-provider";

export const Route = createFileRoute("/proyecciones")({
  component: ProyeccionesPage,
  head: () => ({ meta: [{ title: "Proyecciones de ingresos · Correduría OS" }] }),
});

const MESES_LABEL = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function ProyeccionesPage() {
  const { esRoot, esJefeZona, loading } = usePermissions();
  const { toast } = useDialog();
  const [datos, setDatos] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [tasaRenovacion, setTasaRenovacion] = useState(80);

  const cargar = async () => {
    setCargando(true);
    const { data } = await supabase
      .from("vw_proyeccion_ingresos")
      .select("*")
      .order("anio_venc", { ascending: true })
      .order("mes_venc", { ascending: true });
    setDatos(data || []);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  if (!loading && !esRoot && !esJefeZona) {
    return (
      <PageShell title="Sin acceso">
        <Card className="p-8 text-center text-[13px] text-ink-subtle">
          Las proyecciones son visibles solo para root y jefes de zona.
        </Card>
      </PageShell>
    );
  }

  // Recalcular con la tasa que elija el usuario
  const datosAjustados = datos.map((d: any) => ({
    ...d,
    prima_proyectada_custom: Number(d.prima_total) * (tasaRenovacion / 100),
    comision_proyectada_custom: Number(d.comision_estimada) * (tasaRenovacion / 100),
  }));

  // Agregados 12 meses
  const ahora = new Date();
  const en12meses = new Date();
  en12meses.setMonth(ahora.getMonth() + 12);
  const datos12m = datosAjustados.filter((d: any) => {
    const fecha = new Date(d.anio_venc, d.mes_venc - 1, 1);
    return fecha >= ahora && fecha <= en12meses;
  });

  const totalPolizasRenovar = datos12m.reduce((s, d) => s + Number(d.polizas_a_renovar), 0);
  const totalPrimaProyectada = datos12m.reduce((s, d) => s + d.prima_proyectada_custom, 0);
  const totalComisionProyectada = datos12m.reduce((s, d) => s + d.comision_proyectada_custom, 0);
  const totalPrimaTeorico = datos12m.reduce((s, d) => s + Number(d.prima_total), 0);

  const maxPrima = Math.max(...datosAjustados.map((d) => d.prima_proyectada_custom), 1);

  const exportar = () => {
    if (datos.length === 0) { toast("Sin datos que exportar.", "warning"); return; }
    const rows = datosAjustados.map((d) => ({
      Periodo: d.periodo,
      "Pólizas a renovar": Number(d.polizas_a_renovar),
      "Prima total a vencer (€)": Number(d.prima_total).toFixed(2),
      "Comisión teórica (€)": Number(d.comision_estimada).toFixed(2),
      [`Prima proyectada @ ${tasaRenovacion}% (€)`]: d.prima_proyectada_custom.toFixed(2),
      [`Comisión proyectada @ ${tasaRenovacion}% (€)`]: d.comision_proyectada_custom.toFixed(2),
    }));
    exportarExcel(`proyeccion_ingresos_${new Date().toISOString().slice(0, 10)}.xlsx`, "Proyecciones", rows);
    toast(`${rows.length} periodos exportados`, "success");
  };

  return (
    <PageShell
      title="Proyecciones de ingresos"
      subtitle="Estimación de ingresos futuros basada en pólizas activas con tasa de renovación configurable."
      action={
        <button
          type="button"
          onClick={exportar}
          className="text-[12px] font-medium py-1.5 px-3 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer"
        >
          Exportar Excel
        </button>
      }
    >
      <Card className="p-4 mb-6 bg-info/5 ring-info/20">
        <div className="flex items-start gap-2.5 text-[12px]">
          <AlertCircle className="size-4 text-info shrink-0 mt-0.5" />
          <div className="text-ink-muted">
            <strong className="text-info">Cómo funciona:</strong> El sistema mira todas las pólizas activas y agrupa
            por mes de vencimiento. Aplica una tasa de renovación histórica (por defecto 80%) para proyectar el
            ingreso esperado de cada mes futuro. Ajusta la tasa abajo según tu experiencia.
          </div>
        </div>
      </Card>

      <Card className="p-4 mb-6">
        <label htmlFor="tasa-renovacion" className="flex items-center gap-4">
          <span className="text-[12px] font-medium text-ink-subtle">Tasa de renovación esperada:</span>
          <input
            id="tasa-renovacion"
            type="range"
            min="50"
            max="100"
            step="5"
            value={tasaRenovacion}
            onChange={(e) => setTasaRenovacion(Number(e.target.value))}
            title="Tasa de renovación esperada (50-100%)"
            aria-label="Tasa de renovación esperada en porcentaje"
            className="flex-1 max-w-xs"
          />
          <span className="text-[14px] font-bold text-brand min-w-12">{tasaRenovacion}%</span>
        </label>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Pólizas a renovar" value={String(totalPolizasRenovar)} hint="próximos 12 meses · no depende del %" />
        <KpiCard
          label="Prima a vencer"
          value={`${(totalPrimaTeorico / 1000).toFixed(1)}k €`}
          hint="teórico 100% renovación · no depende del %"
          deltaTone="neutral"
        />
        <KpiCard
          label={`Prima proyectada @ ${tasaRenovacion}%`}
          value={`${(totalPrimaProyectada / 1000).toFixed(1)}k €`}
          hint="ingreso esperado correduría"
          deltaTone="success"
        />
        <KpiCard
          label={`Comisión proyectada @ ${tasaRenovacion}%`}
          value={`${(totalComisionProyectada / 1000).toFixed(1)}k €`}
          hint="comisiones a pagar a comerciales"
          deltaTone="brand"
        />
      </div>

      <Card>
        <div className="px-4 pt-4">
          <SectionHeader
            title={datos.length === 0 ? "Proyecciones mensuales" : `${datos.length} mes${datos.length === 1 ? "" : "es"} con vencimientos`}
            hint="Cada barra es la prima proyectada de ese mes"
          />
        </div>
        {cargando ? (
          <div className="p-8 text-center text-[12px] text-ink-subtle">Calculando proyecciones…</div>
        ) : datos.length === 0 ? (
          <div className="p-10 text-center text-[12px] text-ink-subtle">
            <TrendingUp className="size-6 text-ink-subtle mx-auto mb-2" />
            Aún no hay pólizas activas con fecha de vencimiento. Cuando crees pólizas en /polizas, aparecerán aquí las proyecciones por mes.
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {datosAjustados.map((d: any) => {
              const pct = (d.prima_proyectada_custom / maxPrima) * 100;
              const fecha = new Date(d.anio_venc, d.mes_venc - 1, 1);
              const esPasado = fecha < ahora;
              return (
                <div key={d.periodo} className={["text-[12px]", esPasado ? "opacity-50" : ""].join(" ")}>
                  <div className="flex justify-between mb-0.5">
                    <span className="font-medium min-w-[100px]">
                      {MESES_LABEL[d.mes_venc - 1]} {d.anio_venc}
                    </span>
                    <span className="text-ink-muted">
                      {d.polizas_a_renovar} pólizas · <MoneyEUR value={d.prima_proyectada_custom} /> proyectado
                    </span>
                  </div>
                  <div className="h-2 bg-secondary rounded overflow-hidden">
                    <div className={["h-full", esPasado ? "bg-ink-subtle" : "bg-brand"].join(" ")} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-5 mt-6">
        <SectionHeader title="Tabla detallada" hint="Datos exactos por periodo" />
        {datosAjustados.length === 0 ? (
          <div className="text-center text-[12px] text-ink-subtle py-6">Sin datos</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="px-3 py-2 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Periodo</th>
                <th className="px-3 py-2 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Pólizas</th>
                <th className="px-3 py-2 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Prima a vencer</th>
                <th className="px-3 py-2 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Prima proyectada</th>
                <th className="px-3 py-2 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Comisión proyectada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {datosAjustados.map((d: any) => (
                <tr key={d.periodo} className="hover:bg-secondary/30">
                  <td className="px-3 py-2 text-[11.5px] font-mono">{d.periodo}</td>
                  <td className="px-3 py-2 text-[12px] font-mono">{d.polizas_a_renovar}</td>
                  <td className="px-3 py-2 text-[12px]"><MoneyEUR value={Number(d.prima_total)} /></td>
                  <td className="px-3 py-2 text-[12px] font-medium text-success"><MoneyEUR value={d.prima_proyectada_custom} /></td>
                  <td className="px-3 py-2 text-[12px] text-brand"><MoneyEUR value={d.comision_proyectada_custom} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </PageShell>
  );
}
