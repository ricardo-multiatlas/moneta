import { createFileRoute } from "@tanstack/react-router";
import { Upload, Plus, Sparkles } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, MoneyEUR, RamoChip, StatusBadge } from "@/components/app/ui-bits";
import { polizas } from "@/lib/demo-data";

export const Route = createFileRoute("/polizas")({
  component: PolizasPage,
  head: () => ({ meta: [{ title: "Pólizas · Correduría OS" }] }),
});

function PolizasPage() {
  return (
    <PageShell
      title="Pólizas"
      subtitle="Sube el PDF de la aseguradora y la IA extrae los datos en segundos. Histórico completo de modificaciones y anexos."
      action={
        <div className="flex items-center gap-2">
          <button className="text-[12px] font-medium py-1.5 px-3 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5">
            <Upload className="size-3.5" /> Subir PDF aseguradora
          </button>
          <button className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 flex items-center gap-1.5">
            <Plus className="size-3.5" /> Alta manual
          </button>
        </div>
      }
    >
      <Card className="p-4 mb-6 border-dashed border-2 border-brand/20 bg-brand-soft/30">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-md bg-brand text-brand-foreground grid place-items-center">
            <Sparkles className="size-4" />
          </div>
          <div className="flex-1">
            <div className="text-[13px] font-medium">Alta de póliza con IA en 2 minutos</div>
            <div className="text-[11.5px] text-ink-muted mt-0.5">
              Arrastra el PDF de Mapfre, Allianz, Axa o cualquier aseguradora. Extraemos tomador, asegurado, garantías, primas y vencimiento.
            </div>
          </div>
          <button className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-foreground text-background">
            Seleccionar archivo
          </button>
        </div>
      </Card>

      <Card>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-secondary/40 border-b border-border">
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Nº póliza</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Cliente</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Ramo</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Aseguradora</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Prima</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Comisión</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Vencimiento</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {polizas.map((p) => {
              const tone = p.estado === "Vigente" ? "success" : p.estado === "En renovación" ? "warning" : p.estado === "Pendiente firma" ? "info" : "neutral";
              return (
                <tr key={p.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-[11px] font-mono">{p.numero}</td>
                  <td className="px-4 py-3 text-[12.5px] font-medium">{p.cliente}</td>
                  <td className="px-4 py-3"><RamoChip ramo={p.ramo} /></td>
                  <td className="px-4 py-3 text-[12px] text-ink-muted">{p.aseguradora}</td>
                  <td className="px-4 py-3 text-[12px]"><MoneyEUR value={p.prima} /></td>
                  <td className="px-4 py-3 text-[12px] text-ink-muted"><MoneyEUR value={p.comision} /></td>
                  <td className="px-4 py-3 text-[11px] font-mono text-ink-muted">{p.vencimiento}</td>
                  <td className="px-4 py-3"><StatusBadge tone={tone}>{p.estado}</StatusBadge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </PageShell>
  );
}
