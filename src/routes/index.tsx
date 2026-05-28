import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Upload, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app/page-shell";
import { Card, KpiCard, MoneyEUR, RamoChip, SectionHeader } from "@/components/app/ui-bits";
import { AISuggestionBanner } from "@/components/app/topbar";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Panel · Correduría OS" },
      { name: "description", content: "Panel operativo de Moneta Seguros: pólizas, vencimientos, comisiones y captación en un solo lugar." },
    ],
  }),
  loader: async () => {
    const today = new Date();
    const future60 = new Date();
    future60.setDate(today.getDate() + 60);
    const future7 = new Date();
    future7.setDate(today.getDate() + 7);
    const past7 = new Date();
    past7.setDate(today.getDate() - 7);

    const [{ data: polizas }, { data: vencimientosRaw }, { data: clientes }, { data: leads }, { data: leadsRecientes }] = await Promise.all([
      supabase.from("polizas").select("id, estado").eq("estado", "activa"),
      supabase
        .from("vencimientos")
        .select(`id, fecha_vencimiento, estado, polizas(numero_poliza, ramo, aseguradora, prima_anual, clientes(nombre_razon_social))`)
        .gte("fecha_vencimiento", today.toISOString().split("T")[0])
        .lte("fecha_vencimiento", future60.toISOString().split("T")[0])
        .order("fecha_vencimiento", { ascending: true })
        .limit(5),
      supabase.from("clientes").select("id, nombre_razon_social, tipo").order("created_at", { ascending: false }).limit(6),
      supabase.from("leads").select("id, estado").eq("estado", "Nuevo"),
      supabase
        .from("leads")
        .select("id, created_at")
        .gte("created_at", past7.toISOString())
        .order("created_at", { ascending: true }),
    ]);

    // Criticos sin aviso para banner IA
    const criticosSinAviso = (vencimientosRaw || []).filter((v: any) => {
      const d = new Date(v.fecha_vencimiento);
      return v.estado === "pendiente" && d <= future7 && d >= today;
    }).length;

    // Leads por día de la última semana (L→D)
    const bucketsLeads = [0, 0, 0, 0, 0, 0, 0];
    (leadsRecientes || []).forEach((l: any) => {
      const d = new Date(l.created_at);
      const dow = (d.getDay() + 6) % 7;
      bucketsLeads[dow] += 1;
    });
    const maxLeads = Math.max(...bucketsLeads, 1);
    const leadsSemana = bucketsLeads.map((v) => Math.round((v / maxLeads) * 100));

    const criticos = (vencimientosRaw || []).map((v: any) => {
      const vDate = new Date(v.fecha_vencimiento);
      const diasRestantes = Math.ceil((vDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const p = v.polizas || {};
      return {
        id: v.id,
        diasRestantes,
        fechaVencimiento: v.fecha_vencimiento,
        cliente: p.clientes?.nombre_razon_social || "Desconocido",
        ramo: p.ramo || "-",
        aseguradora: p.aseguradora || "-",
        numeroPoliza: p.numero_poliza || "-",
        prima: p.prima_anual || 0,
        estadoAviso: v.estado === "pendiente" ? "No avisado" : v.estado === "avisado" ? "Aviso enviado" : "Renovado",
      };
    });

    const recientes = (clientes || []).map((c: any) => ({
      id: c.id,
      nombre: c.nombre_razon_social,
      tipo: c.tipo || "Particular",
    }));

    return {
      kpis: {
        polizasActivas: polizas?.length || 0,
        vencimientos60d: vencimientosRaw?.length || 0,
        leadsActivos: leads?.length || 0,
      },
      criticos,
      recientes,
      criticosSinAviso,
      leadsSemana,
    };
  },
});

function Dashboard() {
  const { kpis, criticos, recientes, criticosSinAviso, leadsSemana } = Route.useLoaderData();
  const { esRoot } = usePermissions();
  const [topGlobal, setTopGlobal] = useState<{ clientes: any[]; comerciales: any[] } | null>(null);

  useEffect(() => {
    if (!esRoot) return;
    (async () => {
      const { data: clientesAll } = await supabase
        .from("clientes")
        .select(`
          id, nombre_razon_social, comercial_asignado_id,
          comercial:usuarios!clientes_comercial_asignado_id_fkey(id, nombre),
          polizas(prima_anual, estado)
        `);

      const clientesAgg = (clientesAll || []).map((c: any) => {
        const prima = (c.polizas || [])
          .filter((p: any) => p.estado === "activa")
          .reduce((s: number, p: any) => s + Number(p.prima_anual || 0), 0);
        return { id: c.id, nombre: c.nombre_razon_social, prima };
      }).sort((a, b) => b.prima - a.prima).slice(0, 10);

      const porComercial = new Map<string, { id: string; nombre: string; prima: number }>();
      (clientesAll || []).forEach((c: any) => {
        if (!c.comercial?.id) return;
        const prima = (c.polizas || [])
          .filter((p: any) => p.estado === "activa")
          .reduce((s: number, p: any) => s + Number(p.prima_anual || 0), 0);
        const prev = porComercial.get(c.comercial.id);
        if (prev) prev.prima += prima;
        else porComercial.set(c.comercial.id, { id: c.comercial.id, nombre: c.comercial.nombre, prima });
      });
      const comercialesAgg = Array.from(porComercial.values())
        .sort((a, b) => b.prima - a.prima)
        .slice(0, 10);

      setTopGlobal({ clientes: clientesAgg, comerciales: comercialesAgg });
    })();
  }, [esRoot]);

  return (
    <PageShell
      title="Resumen de actividad"
      subtitle="Gestión integral de cartera y flujos de trabajo para Moneta Seguros · Sevilla."
    >
      <AISuggestionBanner criticosSinAviso={criticosSinAviso} />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <KpiCard label="Pólizas activas" value={String(kpis.polizasActivas)} hint="activas en el sistema" />
        <KpiCard label="Vencimientos 60d" value={String(kpis.vencimientos60d)} hint="ventana de aviso" />
        <KpiCard label="Leads activos" value={String(kpis.leadsActivos)} hint="en pipeline" />
        <KpiCard label="Vencimientos críticos" value={String(criticosSinAviso)} hint="próximos 7 días sin aviso" deltaTone={criticosSinAviso > 0 ? "danger" : "success"} />
      </section>

      <div className="grid grid-cols-12 gap-6 mb-8">
        <section className="col-span-12 lg:col-span-8">
          <SectionHeader
            title="Próximos vencimientos críticos"
            hint="Avisos automáticos y renovación pre-rellenada"
            action={<Link to="/vencimientos" className="text-[11px] font-medium text-brand hover:underline">Ver calendario completo →</Link>}
          />
          <Card>
            {criticos.length === 0 ? (
              <div className="p-8 text-center text-ink-subtle text-sm">No hay vencimientos en los próximos 60 días. <Link to="/polizas" className="text-brand hover:underline">Añadir póliza →</Link></div>
            ) : (
              <div className="divide-y divide-border">
                {criticos.map((v: any) => {
                  const urgent = v.diasRestantes <= 7;
                  const warn = v.diasRestantes <= 20 && !urgent;
                  return (
                    <div key={v.id} className="p-3.5 flex items-center justify-between hover:bg-secondary/40 transition-colors">
                      <div className="flex items-center gap-3.5">
                        <div className={["size-11 rounded-md grid place-items-center border", urgent ? "bg-danger/10 border-danger/20" : warn ? "bg-warning/10 border-warning/25" : "bg-secondary border-border"].join(" ")}>
                          <div className="text-center leading-none">
                            <div className={["text-[9px] font-bold uppercase tracking-wider", urgent ? "text-danger" : warn ? "text-warning" : "text-ink-muted"].join(" ")}>D-{v.diasRestantes}</div>
                            <div className={["text-[10px] font-mono mt-0.5", urgent ? "text-danger" : warn ? "text-warning" : "text-ink-muted"].join(" ")}>{v.fechaVencimiento.slice(5)}</div>
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
                        <Link to="/vencimientos" className="text-[11px] font-medium py-1 px-2.5 rounded bg-foreground text-background hover:brightness-110 transition-all cursor-pointer">
                          Renovar
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </section>

        <aside className="col-span-12 lg:col-span-4 space-y-4">
          <div className="rounded-lg bg-foreground text-background p-3.5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-widest opacity-60">Estado de comisiones</h3>
            </div>
            <Link
              to="/comisiones"
              className="flex items-center justify-between text-[11.5px] opacity-80 hover:opacity-100 transition-opacity mb-2"
            >
              <span>Pendiente de conciliar</span>
              <span className="font-mono opacity-60">Ver →</span>
            </Link>
            <Link
              to="/comisiones"
              className="w-full mt-2 py-1.5 bg-white/10 hover:bg-white/15 rounded text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Upload className="size-3" /> Subir informe
            </Link>
          </div>

          <Card className="p-5">
            <SectionHeader title="Leads esta semana" hint="Nuevos prospectos por día" />
            <div className="h-24 flex items-end gap-1 mb-2">
              {leadsSemana.map((h: number, i: number) => (
                <div
                  key={i}
                  className={[
                    "flex-1 rounded-t transition-all min-h-[2px]",
                    h >= 80 ? "bg-brand" : h > 0 ? "bg-brand/40" : "bg-secondary",
                  ].join(" ")}
                  data-height={h}
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
            title="Últimos clientes registrados"
            hint="Ficha 360° con todas las comunicaciones unificadas"
            action={<Link to="/clientes" className="text-[11px] font-medium text-brand hover:underline">Todos los clientes →</Link>}
          />
          <Card>
            {recientes.length === 0 ? (
              <div className="p-8 text-center text-ink-subtle text-sm">
                No hay clientes aún. <Link to="/clientes" className="text-brand hover:underline">Crear cliente →</Link>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-secondary/40 border-b border-border">
                    <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Cliente</th>
                    <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Tipo</th>
                    <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recientes.map((c: any) => {
                    const initials = c.nombre.split(/[\s,]+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
                    return (
                      <tr key={c.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="size-8 rounded-md bg-brand-soft text-brand grid place-items-center text-[10px] font-semibold">{initials}</div>
                            <div className="text-[12.5px] font-medium leading-tight">{c.nombre}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[11px] text-ink-muted capitalize">{c.tipo}</td>
                        <td className="px-4 py-3 text-right">
                          <Link to="/clientes" className="text-[11px] font-medium text-brand hover:underline cursor-pointer">Ver ficha →</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </section>

        <aside className="col-span-12 lg:col-span-4 space-y-5">
          <Card className="p-5">
            <SectionHeader title="Accesos rápidos" hint="Módulos del sistema" />
            <div className="space-y-2">
              {[
                { label: "Ver pólizas activas", to: "/polizas" },
                { label: "Vencimientos próximos", to: "/vencimientos" },
                { label: "Módulo de facturación", to: "/facturacion" },
                { label: "Pipeline de captación", to: "/captacion" },
                { label: "Conciliar comisiones", to: "/comisiones" },
              ].map(item => (
                <Link key={item.to} to={item.to} className="flex items-center justify-between p-2.5 rounded-md hover:bg-secondary transition-colors cursor-pointer text-[12px] font-medium">
                  {item.label}
                  <ArrowUpRight className="size-3.5 text-ink-subtle" />
                </Link>
              ))}
            </div>
          </Card>
        </aside>
      </div>

      {esRoot && topGlobal && (
        <div className="grid grid-cols-12 gap-6 mt-8">
          <Card className="col-span-12 lg:col-span-6 p-5">
            <SectionHeader
              title="Top 10 clientes globales"
              hint="por prima anual total"
              action={<Trophy className="size-4 text-warning" />}
            />
            {topGlobal.clientes.length === 0 ? (
              <div className="p-6 text-center text-[12px] text-ink-subtle">Sin datos suficientes.</div>
            ) : (
              <ul className="divide-y divide-border">
                {topGlobal.clientes.map((c, i) => (
                  <li key={c.id} className="py-2.5 flex items-center gap-3">
                    <div className={["size-7 rounded-full grid place-items-center text-[11px] font-bold", i === 0 ? "bg-warning/15 text-warning" : "bg-brand-soft text-brand"].join(" ")}>
                      {i === 0 ? <Trophy className="size-3.5" /> : i + 1}
                    </div>
                    <Link to="/clientes/$id" params={{ id: c.id }} className="flex-1 text-[12.5px] font-medium hover:text-brand truncate">
                      {c.nombre}
                    </Link>
                    <MoneyEUR value={c.prima} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="col-span-12 lg:col-span-6 p-5">
            <SectionHeader
              title="Top 10 comerciales globales"
              hint="por prima total en cartera"
              action={<Trophy className="size-4 text-warning" />}
            />
            {topGlobal.comerciales.length === 0 ? (
              <div className="p-6 text-center text-[12px] text-ink-subtle">Sin datos suficientes.</div>
            ) : (
              <ul className="divide-y divide-border">
                {topGlobal.comerciales.map((u, i) => (
                  <li key={u.id} className="py-2.5 flex items-center gap-3">
                    <div className={["size-7 rounded-full grid place-items-center text-[11px] font-bold", i === 0 ? "bg-warning/15 text-warning" : "bg-brand-soft text-brand"].join(" ")}>
                      {i === 0 ? <Trophy className="size-3.5" /> : i + 1}
                    </div>
                    <span className="flex-1 text-[12.5px] font-medium truncate">{u.nombre}</span>
                    <MoneyEUR value={u.prima} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </PageShell>
  );
}
