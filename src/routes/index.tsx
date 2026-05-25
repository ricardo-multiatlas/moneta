import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, Sparkles, Upload, FileText, MessageSquare, PhoneCall, Mail } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, KpiCard, MoneyEUR, RamoChip, SectionHeader, StatusBadge } from "@/components/app/ui-bits";
import { AISuggestionBanner } from "@/components/app/topbar";
import {
  canalesCaptacion,
  clientes,
  comerciales,
  informesComision,
  kpis,
  vencimientos,
} from "@/lib/demo-data";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Panel · Correduría OS" },
      { name: "description", content: "Panel operativo de Moneta Seguros: pólizas, vencimientos, comisiones y captación en un solo lugar." },
    ],
  }),
});

function Dashboard() {
  const criticos = vencimientos.slice(0, 5);
  const recientes = clientes.slice(0, 6);
  const discrepancias = informesComision.filter((i) => i.diferencia !== 0);
  const totalDiscrepancia = discrepancias.reduce((s, d) => s + Math.abs(d.diferencia), 0);

  return (
    <PageShell
      title="Resumen de actividad"
      subtitle="Gestión integral de cartera y flujos de trabajo para Moneta Seguros · Sevilla."
    >
      <AISuggestionBanner />

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        <KpiCard label="Pólizas activas" value={kpis.polizasActivas.toLocaleString("es-ES")} delta={kpis.polizasDelta} hint="vs. mes anterior" />
        <KpiCard label="Vencimientos 60d" value={String(kpis.vencimientos60d)} delta="3 críticos" deltaTone="warning" hint="próximos avisos" />
        <KpiCard
          label="Comisiones pendientes"
          value={`${(kpis.comisionesPendientes / 1000).toFixed(1)}k €`}
          delta={`${kpis.comisionesAseguradoras} aseguradoras`}
          deltaTone="neutral"
          hint="sin conciliar"
        />
        <KpiCard label="Leads activos" value={String(kpis.leadsActivos)} delta={kpis.leadsDelta} hint="vs. mes anterior" />
        <KpiCard
          label="Ingresos recurrentes"
          value={`${Math.round(kpis.ingresosRecurrentes / 1000)}k €`}
          delta="proyección anual"
          deltaTone="neutral"
          hint="ARR estimado"
        />
      </section>

      <div className="grid grid-cols-12 gap-6 mb-8">
        <section className="col-span-12 lg:col-span-8">
          <SectionHeader
            title="Próximos vencimientos críticos"
            hint="Avisos automáticos y renovación pre-rellenada"
            action={<a href="/vencimientos" className="text-[11px] font-medium text-brand hover:underline">Ver calendario completo →</a>}
          />
          <Card>
            <div className="divide-y divide-border">
              {criticos.map((v) => {
                const urgent = v.diasRestantes <= 7;
                const warn = v.diasRestantes <= 20 && !urgent;
                return (
                  <div key={v.id} className="p-3.5 flex items-center justify-between hover:bg-secondary/40 transition-colors">
                    <div className="flex items-center gap-3.5">
                      <div
                        className={[
                          "size-11 rounded-md grid place-items-center border",
                          urgent ? "bg-danger/10 border-danger/20" : warn ? "bg-warning/10 border-warning/25" : "bg-secondary border-border",
                        ].join(" ")}
                      >
                        <div className="text-center leading-none">
                          <div
                            className={[
                              "text-[9px] font-bold uppercase tracking-wider",
                              urgent ? "text-danger" : warn ? "text-warning" : "text-ink-muted",
                            ].join(" ")}
                          >
                            D-{v.diasRestantes}
                          </div>
                          <div className={["text-[10px] font-mono mt-0.5", urgent ? "text-danger" : warn ? "text-warning" : "text-ink-muted"].join(" ")}>
                            {v.fechaVencimiento.slice(5)}
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="text-[13px] font-medium leading-tight">{v.cliente}</div>
                        <div className="text-[11px] text-ink-subtle mt-0.5 flex items-center gap-1.5">
                          <RamoChip ramo={v.ramo} />
                          <span>· {v.aseguradora}</span>
                          <span className="font-mono">· {v.numeroPoliza}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-[11px] font-medium"><MoneyEUR value={v.prima} /></div>
                        <div className="text-[10px] text-ink-subtle mt-0.5">{v.estadoAviso}</div>
                      </div>
                      <button className="text-[11px] font-medium py-1 px-2.5 rounded bg-foreground text-background hover:brightness-110 transition-all">
                        Renovar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </section>

        <aside className="col-span-12 lg:col-span-4 space-y-5">
          <div className="rounded-xl bg-foreground text-background p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest opacity-60">Estado de comisiones</h3>
              <Sparkles className="size-3.5 opacity-50" />
            </div>
            <div className="space-y-3">
              {informesComision.slice(0, 4).map((i) => {
                const ratio = i.declaradoAseguradora && i.calculadoSistema
                  ? Math.min(1, i.declaradoAseguradora / i.calculadoSistema)
                  : 0;
                const ok = i.estado === "Conciliado";
                return (
                  <div key={i.id} className="flex items-center justify-between text-[12px]">
                    <span className="opacity-85">{i.aseguradora}</span>
                    <div className="flex items-center gap-2.5">
                      <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={["h-full transition-all", ok ? "bg-success" : i.estado === "Pendiente subir" ? "bg-white/30" : "bg-warning"].join(" ")}
                          style={{ width: `${Math.max(8, ratio * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono opacity-70 w-10 text-right">
                        {ok ? "100%" : `${Math.round(ratio * 100)}%`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
              <div className="text-[11px] opacity-70">Diferencia detectada</div>
              <div className="text-[13px] font-mono font-semibold text-warning">
                <MoneyEUR value={totalDiscrepancia} />
              </div>
            </div>
            <button className="w-full mt-4 py-2 bg-white/10 hover:bg-white/15 rounded-md text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5">
              <Upload className="size-3.5" /> Subir informe aseguradora
            </button>
          </div>

          <Card className="p-5">
            <SectionHeader title="Captación esta semana" hint="Conversión por día" />
            <div className="h-24 flex items-end gap-1 mb-2">
              {[60, 45, 80, 95, 70, 55, 30].map((h, i) => (
                <div
                  key={i}
                  className={[
                    "flex-1 rounded-t transition-all",
                    h >= 90 ? "bg-brand" : "bg-secondary hover:bg-brand/30",
                  ].join(" ")}
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between text-[9px] text-ink-subtle font-mono uppercase tracking-widest">
              <span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span>
            </div>
          </Card>
        </aside>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-12 lg:col-span-8">
          <SectionHeader
            title="Últimas interacciones de cliente"
            hint="Ficha 360° con todas las comunicaciones unificadas"
            action={<a href="/clientes" className="text-[11px] font-medium text-brand hover:underline">Todos los clientes →</a>}
          />
          <Card>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-secondary/40 border-b border-border">
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Cartera</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Prima anual</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Último contacto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recientes.map((c) => {
                  const Icon = c.ultimoCanal === "WhatsApp" ? MessageSquare : c.ultimoCanal === "Llamada" ? PhoneCall : c.ultimoCanal === "Email" ? Mail : FileText;
                  const tone = c.estado === "Al día" ? "success" : c.estado === "Pendiente doc." ? "warning" : c.estado === "Riesgo fuga" ? "danger" : "info";
                  const initials = c.nombre.split(/[\s,]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
                  return (
                    <tr key={c.id} className="hover:bg-secondary/30 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="size-8 rounded-md bg-brand-soft text-brand grid place-items-center text-[10px] font-semibold">
                            {initials}
                          </div>
                          <div>
                            <div className="text-[12.5px] font-medium leading-tight">{c.nombre}</div>
                            <div className="text-[10px] text-ink-subtle">{c.ciudad} · {c.tipo}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={tone}>{c.estado}</StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] text-ink-muted font-mono">{c.polizasActivas} pólizas</span>
                      </td>
                      <td className="px-4 py-3 text-[12px]"><MoneyEUR value={c.primaAnual} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="text-[11px] text-ink-muted">{c.ultimoContacto}</div>
                        <div className="text-[10px] text-ink-subtle flex items-center justify-end gap-1 mt-0.5">
                          <Icon className="size-3" /> {c.ultimoCanal}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </section>

        <aside className="col-span-12 lg:col-span-4 space-y-5">
          <Card className="p-5">
            <SectionHeader title="Origen de captación" hint="Leads activos por canal" />
            <div className="space-y-3">
              {canalesCaptacion.map((c) => (
                <div key={c.canal}>
                  <div className="flex items-center justify-between text-[12px] mb-1">
                    <span className="font-medium">{c.canal}</span>
                    <span className="font-mono text-ink-muted">{c.leads} · {Math.round(c.conversion * 100)}%</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-brand" style={{ width: `${c.conversion * 100}%`, opacity: 0.4 + c.conversion }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader title="Equipo comercial" hint="Cierres este mes" />
            <div className="space-y-3">
              {comerciales.map((c) => (
                <div key={c.nombre} className="flex items-center justify-between text-[12px]">
                  <div className="flex items-center gap-2.5">
                    <div className="size-7 rounded-full bg-secondary grid place-items-center text-[10px] font-semibold text-ink-muted">
                      {c.nombre.split(" ").map((p) => p[0]).join("").slice(0, 2)}
                    </div>
                    <div>
                      <div className="font-medium">{c.nombre}</div>
                      <div className="text-[10px] text-ink-subtle font-mono">{c.cierres} cierres</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[11.5px]"><MoneyEUR value={c.primaMes} /></div>
                    <div className="text-[10px] text-success flex items-center justify-end gap-0.5">
                      <ArrowUpRight className="size-3" /> {Math.round(c.conversion * 100)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </div>
    </PageShell>
  );
}
