import { createFileRoute } from "@tanstack/react-router";
import { Upload, AlertCircle, CheckCircle2 } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, KpiCard, MoneyEUR, SectionHeader, StatusBadge } from "@/components/app/ui-bits";
import { informesComision } from "@/lib/demo-data";

export const Route = createFileRoute("/comisiones")({
  component: ComisionesPage,
  head: () => ({ meta: [{ title: "Comisiones · Correduría OS" }] }),
});

function ComisionesPage() {
  const totalCalculado = informesComision.reduce((s, i) => s + i.calculadoSistema, 0);
  const totalDeclarado = informesComision.reduce((s, i) => s + i.declaradoAseguradora, 0);
  const diferenciaTotal = totalCalculado - totalDeclarado;

  return (
    <PageShell
      title="Reconciliación de comisiones"
      subtitle="Sube el informe mensual de cada aseguradora — en el formato que sea — y la IA lo cruza con vuestras pólizas. Identifica diferencias, errores y comisiones impagadas."
      action={
        <button className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 flex items-center gap-1.5">
          <Upload className="size-3.5" /> Subir informe
        </button>
      }
    >
      <div className="grid grid-cols-4 gap-3 mb-6">
        <KpiCard label="Sistema calcula" value={`${(totalCalculado / 1000).toFixed(1)}k €`} hint="abril 2026" />
        <KpiCard label="Aseguradoras declaran" value={`${(totalDeclarado / 1000).toFixed(1)}k €`} hint="recibido" />
        <KpiCard
          label="Diferencia a reclamar"
          value={`${(diferenciaTotal / 1000).toFixed(2)}k €`}
          delta="3 informes con discrepancia"
          deltaTone={diferenciaTotal > 0 ? "danger" : "success"}
        />
        <KpiCard label="Conciliación automática" value="92%" delta="+14% vs Q1" deltaTone="success" hint="con IA" />
      </div>

      <SectionHeader title="Informes por aseguradora" hint="Estado de conciliación del periodo en curso" />
      <Card>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-secondary/40 border-b border-border">
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Aseguradora</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Periodo</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Pólizas</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Sistema calcula</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Aseg. declara</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Diferencia</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {informesComision.map((i) => {
              const tone = i.estado === "Conciliado" ? "success" : i.estado === "Discrepancia" ? "danger" : i.estado === "Reclamado" ? "warning" : "neutral";
              return (
                <tr key={i.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-[12.5px] font-medium">{i.aseguradora}</td>
                  <td className="px-4 py-3 text-[11px] text-ink-muted">{i.periodo}</td>
                  <td className="px-4 py-3 text-[12px] font-mono">{i.polizas}</td>
                  <td className="px-4 py-3 text-[12px]"><MoneyEUR value={i.calculadoSistema} /></td>
                  <td className="px-4 py-3 text-[12px] text-ink-muted"><MoneyEUR value={i.declaradoAseguradora} /></td>
                  <td className={["px-4 py-3 text-[12px] font-medium", i.diferencia < 0 ? "text-danger" : i.diferencia > 0 ? "text-warning" : "text-success"].join(" ")}>
                    <div className="flex items-center gap-1">
                      {i.diferencia === 0 ? <CheckCircle2 className="size-3.5" /> : <AlertCircle className="size-3.5" />}
                      <MoneyEUR value={i.diferencia} />
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge tone={tone}>{i.estado}</StatusBadge></td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-[11px] font-medium text-brand hover:underline">
                      {i.estado === "Pendiente subir" ? "Subir informe" : "Ver detalle"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </PageShell>
  );
}
