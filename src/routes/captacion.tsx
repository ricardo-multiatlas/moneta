import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app/page-shell";
import { Card, KpiCard, MoneyEUR, RamoChip, SectionHeader, StatusBadge } from "@/components/app/ui-bits";
import { canalesCaptacion, leads } from "@/lib/demo-data";

export const Route = createFileRoute("/captacion")({
  component: CaptacionPage,
  head: () => ({ meta: [{ title: "Captación · Correduría OS" }] }),
});

const ESTADOS = ["Nuevo", "Cualificado", "Propuesta", "Negociación", "Ganado"] as const;

function CaptacionPage() {
  const ganados = leads.filter((l) => l.estado === "Ganado");
  const totalGanado = ganados.reduce((s, l) => s + l.valorEstimado, 0);
  const activos = leads.filter((l) => !["Ganado", "Perdido"].includes(l.estado));
  const conversion = ganados.length / (leads.length || 1);

  return (
    <PageShell
      title="Captación"
      subtitle="Trazabilidad del lead desde su origen hasta póliza firmada. ROI por canal, conversión por comercial."
    >
      <div className="grid grid-cols-4 gap-3 mb-6">
        <KpiCard label="Leads activos" value={String(activos.length)} delta="+12% mes" deltaTone="success" />
        <KpiCard label="Ganados mes" value={String(ganados.length)} delta={`${(conversion * 100).toFixed(0)}% conv.`} deltaTone="success" />
        <KpiCard label="Valor ganado" value={`${(totalGanado).toFixed(0)} €`} hint="prima nueva anual" />
        <KpiCard label="Coste por lead" value="38 €" delta="-12%" deltaTone="success" hint="media ponderada" />
      </div>

      <div className="grid grid-cols-12 gap-6 mb-8">
        <div className="col-span-12 lg:col-span-8">
          <SectionHeader title="Pipeline de oportunidades" hint="Drag &amp; drop entre etapas" />
          <div className="grid grid-cols-5 gap-2">
            {ESTADOS.map((estado) => {
              const items = leads.filter((l) => l.estado === estado);
              return (
                <div key={estado} className="bg-secondary/50 rounded-md p-2 min-h-[280px]">
                  <div className="flex items-center justify-between px-1 py-1.5 mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">{estado}</span>
                    <span className="text-[10px] font-mono text-ink-subtle">{items.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {items.map((l) => (
                      <div key={l.id} className="bg-surface rounded p-2.5 ring-1 ring-border hover:ring-brand/30 cursor-pointer transition-all">
                        <div className="text-[11.5px] font-medium leading-tight">{l.nombre}</div>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <RamoChip ramo={l.interes} />
                        </div>
                        <div className="text-[10px] text-ink-subtle mt-1.5 flex items-center justify-between">
                          <span>{l.origen}</span>
                          <span className="font-mono"><MoneyEUR value={l.valorEstimado} /></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="col-span-12 lg:col-span-4 space-y-5">
          <Card className="p-5">
            <SectionHeader title="ROI por canal" hint="Conversión y valor medio" />
            <div className="space-y-4">
              {canalesCaptacion.map((c) => (
                <div key={c.canal}>
                  <div className="flex items-center justify-between text-[12px] mb-1">
                    <span className="font-medium">{c.canal}</span>
                    <span className="font-mono text-[11px] text-ink-muted">
                      {c.leads} · <MoneyEUR value={c.valorMedio} />
                    </span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-brand transition-all" style={{ width: `${c.conversion * 100}%` }} />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-ink-subtle">Conv. {Math.round(c.conversion * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </div>

      <SectionHeader title="Todos los leads" />
      <Card>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-secondary/40 border-b border-border">
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Lead</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Origen</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Interés</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Comercial</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Valor</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Contacto</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {leads.map((l) => {
              const tone = l.estado === "Ganado" ? "success" : l.estado === "Perdido" ? "danger" : l.estado === "Negociación" ? "warning" : "info";
              return (
                <tr key={l.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-[12.5px] font-medium">{l.nombre}</td>
                  <td className="px-4 py-3 text-[11.5px] text-ink-muted">{l.origen}</td>
                  <td className="px-4 py-3"><RamoChip ramo={l.interes} /></td>
                  <td className="px-4 py-3 text-[11.5px] text-ink-muted">{l.comercial}</td>
                  <td className="px-4 py-3 text-[12px]"><MoneyEUR value={l.valorEstimado} /></td>
                  <td className="px-4 py-3 text-[11px] text-ink-muted">{l.fechaContacto}</td>
                  <td className="px-4 py-3"><StatusBadge tone={tone}>{l.estado}</StatusBadge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </PageShell>
  );
}
