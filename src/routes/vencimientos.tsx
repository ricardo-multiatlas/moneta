import { createFileRoute } from "@tanstack/react-router";
import { Mail, MessageSquare, CheckCircle2 } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, KpiCard, MoneyEUR, RamoChip, SectionHeader } from "@/components/app/ui-bits";
import { vencimientos } from "@/lib/demo-data";

export const Route = createFileRoute("/vencimientos")({
  component: VencimientosPage,
  head: () => ({ meta: [{ title: "Vencimientos · Correduría OS" }] }),
});

function VencimientosPage() {
  const criticos = vencimientos.filter((v) => v.diasRestantes <= 7);
  const proximos = vencimientos.filter((v) => v.diasRestantes > 7 && v.diasRestantes <= 30);
  const futuros = vencimientos.filter((v) => v.diasRestantes > 30);

  return (
    <PageShell
      title="Vencimientos"
      subtitle="El sistema vigila día a día qué pólizas vencen en los próximos 60 días. Cero pólizas perdidas por olvido."
    >
      <div className="grid grid-cols-4 gap-3 mb-6">
        <KpiCard label="Vencen en 7 días" value={String(criticos.length)} delta="Crítico" deltaTone="danger" />
        <KpiCard label="Vencen en 30 días" value={String(proximos.length)} delta="Atención" deltaTone="warning" />
        <KpiCard label="Vencen en 60 días" value={String(vencimientos.length)} hint="ventana total" />
        <KpiCard label="Avisos automáticos" value="38" delta="esta semana" deltaTone="success" hint="email + WhatsApp" />
      </div>

      {[
        { label: "Críticos · próximos 7 días", items: criticos, tone: "danger" as const },
        { label: "Próximos · 8 a 30 días", items: proximos, tone: "warning" as const },
        { label: "Futuros · 31 a 60 días", items: futuros, tone: "neutral" as const },
      ].map((group) => (
        <div key={group.label} className="mb-8">
          <SectionHeader
            title={group.label}
            hint={`${group.items.length} pólizas`}
            action={
              <button className="text-[11px] font-medium py-1 px-2.5 rounded ring-1 ring-border hover:bg-secondary flex items-center gap-1">
                <Mail className="size-3" /> Enviar avisos por lote
              </button>
            }
          />
          {group.items.length === 0 ? (
            <Card className="p-6 text-[12px] text-ink-subtle text-center">Sin vencimientos en este rango.</Card>
          ) : (
            <Card>
              <div className="divide-y divide-border">
                {group.items.map((v) => (
                  <div key={v.id} className="p-4 grid grid-cols-12 gap-4 items-center hover:bg-secondary/30 transition-colors">
                    <div className="col-span-1 text-center">
                      <div
                        className={[
                          "inline-flex flex-col items-center justify-center size-12 rounded-md border",
                          group.tone === "danger" ? "bg-danger/10 border-danger/20 text-danger"
                            : group.tone === "warning" ? "bg-warning/10 border-warning/25 text-warning"
                            : "bg-secondary border-border text-ink-muted",
                        ].join(" ")}
                      >
                        <span className="text-[9px] font-bold uppercase tracking-wider">D-{v.diasRestantes}</span>
                        <span className="text-[10px] font-mono leading-none mt-0.5">{v.fechaVencimiento.slice(5)}</span>
                      </div>
                    </div>
                    <div className="col-span-4">
                      <div className="text-[13px] font-medium">{v.cliente}</div>
                      <div className="text-[11px] text-ink-subtle flex items-center gap-1.5 mt-0.5">
                        <RamoChip ramo={v.ramo} /> · {v.aseguradora} · <span className="font-mono">{v.numeroPoliza}</span>
                      </div>
                    </div>
                    <div className="col-span-2 text-[11.5px] text-ink-muted">{v.comercial}</div>
                    <div className="col-span-2 text-[12px]"><MoneyEUR value={v.prima} /></div>
                    <div className="col-span-2 text-[11px] text-ink-muted flex items-center gap-1">
                      {v.estadoAviso === "Aviso enviado" || v.estadoAviso === "Cliente contactado" ? (
                        <CheckCircle2 className="size-3.5 text-success" />
                      ) : null}
                      {v.estadoAviso}
                    </div>
                    <div className="col-span-1 flex justify-end gap-1">
                      <button className="p-1.5 rounded hover:bg-secondary" title="Email"><Mail className="size-3.5 text-ink-muted" /></button>
                      <button className="p-1.5 rounded hover:bg-secondary" title="WhatsApp"><MessageSquare className="size-3.5 text-ink-muted" /></button>
                      <button className="text-[11px] font-medium py-1 px-2 rounded bg-foreground text-background">Renovar</button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      ))}
    </PageShell>
  );
}
