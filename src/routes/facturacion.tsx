import { createFileRoute } from "@tanstack/react-router";
import { Plus, FileDown } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, KpiCard, MoneyEUR, SectionHeader, StatusBadge } from "@/components/app/ui-bits";
import { facturas } from "@/lib/demo-data";

export const Route = createFileRoute("/facturacion")({
  component: FacturacionPage,
  head: () => ({ meta: [{ title: "Facturación · Correduría OS" }] }),
});

function FacturacionPage() {
  const emitido = facturas.filter((f) => f.estado === "Emitida" || f.estado === "Pagada").reduce((s, f) => s + f.importe, 0);
  const cobrado = facturas.filter((f) => f.estado === "Pagada").reduce((s, f) => s + f.importe, 0);
  const vencido = facturas.filter((f) => f.estado === "Vencida").reduce((s, f) => s + f.importe, 0);

  return (
    <PageShell
      title="Facturación"
      subtitle="Emisión de minutas y facturas conectadas a las pólizas firmadas. Exportación a A3, Contasol o Sage."
      action={
        <div className="flex items-center gap-2">
          <button className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5">
            <FileDown className="size-3.5" /> Exportar A3 / Contasol
          </button>
          <button className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 flex items-center gap-1.5">
            <Plus className="size-3.5" /> Nueva factura
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-4 gap-3 mb-6">
        <KpiCard label="Emitido mes" value={`${(emitido).toFixed(0)} €`} hint="mayo 2026" />
        <KpiCard label="Cobrado" value={`${cobrado.toFixed(0)} €`} delta={`${Math.round((cobrado / emitido) * 100)}%`} deltaTone="success" />
        <KpiCard label="Vencido" value={`${vencido.toFixed(0)} €`} delta="reclamar" deltaTone="danger" />
        <KpiCard label="Conciliación bancaria" value="84%" delta="semi-auto" deltaTone="success" hint="con extracto BBVA" />
      </div>

      <SectionHeader
        title="Facturas y minutas"
        hint="Vinculadas a póliza y comisión correspondiente"
      />
      <Card>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-secondary/40 border-b border-border">
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Nº factura</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Cliente</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Concepto</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Emisión</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Vencimiento</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Importe</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {facturas.map((f) => {
              const tone = f.estado === "Pagada" ? "success" : f.estado === "Emitida" ? "info" : f.estado === "Vencida" ? "danger" : "neutral";
              return (
                <tr key={f.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-[11px] font-mono">{f.numero}</td>
                  <td className="px-4 py-3 text-[12.5px] font-medium">{f.cliente}</td>
                  <td className="px-4 py-3 text-[12px] text-ink-muted">{f.concepto}</td>
                  <td className="px-4 py-3 text-[11px] text-ink-muted">{f.fechaEmision}</td>
                  <td className="px-4 py-3 text-[11px] text-ink-muted">{f.fechaVencimiento}</td>
                  <td className="px-4 py-3 text-[12px] font-medium"><MoneyEUR value={f.importe} /></td>
                  <td className="px-4 py-3"><StatusBadge tone={tone}>{f.estado}</StatusBadge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </PageShell>
  );
}
