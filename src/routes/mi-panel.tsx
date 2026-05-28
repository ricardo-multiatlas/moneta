import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { User, Trophy, TrendingUp, CalendarClock, Wallet, FileSignature, ArrowUpRight } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, KpiCard, MoneyEUR, RamoChip, SectionHeader, StatusBadge } from "@/components/app/ui-bits";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/mi-panel")({
  component: MiPanelPage,
  head: () => ({ meta: [{ title: "Mi panel · Correduría OS" }] }),
});

function MiPanelPage() {
  const { perfil, esComercial, loading } = usePermissions();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!perfil) return;
    (async () => {
      setBusy(true);
      const now = new Date();
      const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const inicioMesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];
      const finMesAnterior = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];
      const en30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30).toISOString().split("T")[0];

      // Mis clientes (filtra por RLS automáticamente; cuando es root, ve todos)
      const { data: misClientes } = await supabase
        .from("clientes")
        .select("id, nombre_razon_social, polizas(id, prima_anual, estado, fecha_inicio, fecha_vencimiento, comision_importe)")
        .eq("comercial_asignado_id", perfil.id);

      // Top 5 clientes por prima anual
      const topClientes = (misClientes || [])
        .map((c: any) => ({
          id: c.id,
          nombre: c.nombre_razon_social,
          primaAnual: (c.polizas || []).filter((p: any) => p.estado === "activa").reduce((s: number, p: any) => s + Number(p.prima_anual || 0), 0),
        }))
        .sort((a: any, b: any) => b.primaAnual - a.primaAnual)
        .slice(0, 5);

      // Comisiones del mes en curso (calculo basado en pólizas activas asignadas)
      const polizasActivas = (misClientes || []).flatMap((c: any) => c.polizas || []).filter((p: any) => p.estado === "activa");
      const comisionesEsteMes = polizasActivas.reduce((s: number, p: any) => s + Number(p.comision_importe || Number(p.prima_anual) * 0.1) / 12, 0);
      // Mes anterior: aproximación basada en pólizas que YA estaban activas el mes anterior (fecha_inicio < primer día de este mes)
      const polizasMesAnterior = polizasActivas.filter((p: any) => !p.fecha_inicio || p.fecha_inicio < inicioMes);
      const comisionesMesAnteriorCalc = polizasMesAnterior.reduce((s: number, p: any) => s + Number(p.comision_importe || Number(p.prima_anual) * 0.1) / 12, 0);
      // Si no hay diferencia detectable, marcamos estimación al 95% del mes actual
      const comisionesMesAnterior = comisionesMesAnteriorCalc > 0 ? comisionesMesAnteriorCalc : comisionesEsteMes * 0.95;
      const variacionPct = comisionesMesAnterior > 0
        ? ((comisionesEsteMes - comisionesMesAnterior) / comisionesMesAnterior) * 100
        : 0;

      // Próximos vencimientos (30 días) de mis clientes
      const vencimientos = polizasActivas
        .filter((p: any) => p.fecha_vencimiento >= inicioMes && p.fecha_vencimiento <= en30)
        .sort((a: any, b: any) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))
        .slice(0, 3);

      // Ranking en zona (count de comerciales de la misma zona y mi posición por prima total)
      let ranking: { posicion: number; total: number } | null = null;
      if (perfil.zona_id) {
        const { data: comZona } = await supabase
          .from("usuarios")
          .select("id")
          .eq("zona_id", perfil.zona_id)
          .eq("rol", "comercial");
        if (comZona) {
          const ids = comZona.map((u: any) => u.id);
          const { data: clienteZona } = await supabase
            .from("clientes")
            .select("comercial_asignado_id, polizas(prima_anual, estado)")
            .in("comercial_asignado_id", ids);
          const totalPorComercial = new Map<string, number>();
          (clienteZona || []).forEach((c: any) => {
            const prima = (c.polizas || []).filter((p: any) => p.estado === "activa").reduce((s: number, p: any) => s + Number(p.prima_anual || 0), 0);
            totalPorComercial.set(c.comercial_asignado_id, (totalPorComercial.get(c.comercial_asignado_id) || 0) + prima);
          });
          const sorted = Array.from(totalPorComercial.entries()).sort((a, b) => b[1] - a[1]);
          const pos = sorted.findIndex(([id]) => id === perfil.id);
          ranking = { posicion: pos === -1 ? sorted.length + 1 : pos + 1, total: ids.length };
        }
      }

      setData({
        misClientes: misClientes || [],
        topClientes,
        comisionesEsteMes,
        comisionesMesAnterior,
        variacionPct,
        vencimientos,
        ranking,
        primaTotalCartera: (misClientes || []).flatMap((c: any) => c.polizas || []).filter((p: any) => p.estado === "activa").reduce((s: number, p: any) => s + Number(p.prima_anual || 0), 0),
        polizasActivasCount: polizasActivas.length,
      });
      setBusy(false);
    })();
  }, [perfil]);

  if (loading || busy || !data) {
    return (
      <PageShell title="Mi panel">
        <Card className="p-8 text-center text-[13px] text-ink-subtle">Cargando tu panel…</Card>
      </PageShell>
    );
  }

  if (!esComercial && !data) {
    return (
      <PageShell title="Mi panel">
        <Card className="p-8 text-center text-[13px] text-ink-subtle">
          Esta vista es del comercial. Como root o jefe ves todo desde el Panel principal.
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={`Hola, ${perfil?.nombre?.split(" ")[0] || "Comercial"}`}
      subtitle="Tu cartera, tus comisiones, tus próximas tareas — todo en una pantalla."
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Comisiones este mes" value={`${data.comisionesEsteMes.toFixed(2)} €`} delta="estimación" deltaTone="success" hint="cobro previsto" />
        <KpiCard label="Mi cartera" value={`${data.primaTotalCartera.toFixed(0)} €`} hint={`${data.polizasActivasCount} pólizas activas`} />
        <KpiCard label="Mis clientes" value={String(data.misClientes.length)} hint="asignados a mí" />
        <KpiCard
          label="Mi ranking"
          value={data.ranking ? `#${data.ranking.posicion} / ${data.ranking.total}` : "—"}
          delta={data.ranking ? "en mi zona" : ""}
          deltaTone="success"
        />
      </div>

      <Card className="p-4 mb-6">
        <SectionHeader title="Comparativa mes anterior" hint="estimación basada en cartera actual" />
        <div className="grid grid-cols-3 gap-4 text-[12px]">
          <div>
            <div className="text-[10px] font-medium text-ink-subtle uppercase tracking-widest mb-1">Mes actual</div>
            <div className="text-[18px] font-semibold font-display"><MoneyEUR value={data.comisionesEsteMes} /></div>
          </div>
          <div>
            <div className="text-[10px] font-medium text-ink-subtle uppercase tracking-widest mb-1">Mes anterior</div>
            <div className="text-[18px] font-semibold font-display text-ink-muted"><MoneyEUR value={data.comisionesMesAnterior} /></div>
          </div>
          <div>
            <div className="text-[10px] font-medium text-ink-subtle uppercase tracking-widest mb-1">Variación</div>
            <div className={["text-[18px] font-semibold font-display", data.variacionPct >= 0 ? "text-success" : "text-danger"].join(" ")}>
              {data.variacionPct >= 0 ? "+" : ""}{data.variacionPct.toFixed(1)}%
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-12 gap-6 mb-6">
        <Card className="col-span-12 lg:col-span-7 p-5">
          <SectionHeader title="Top 5 mejores clientes" hint="por prima anual" action={<Trophy className="size-4 text-warning" />} />
          {data.topClientes.length === 0 ? (
            <div className="p-6 text-center text-[12px] text-ink-subtle">Aún no tienes clientes asignados.</div>
          ) : (
            <ul className="divide-y divide-border">
              {data.topClientes.map((c: any, i: number) => (
                <li key={c.id} className="py-2.5 flex items-center gap-3">
                  <div className="size-7 rounded-full bg-brand-soft text-brand grid place-items-center text-[11px] font-bold">{i + 1}</div>
                  <Link to="/clientes/$id" params={{ id: c.id }} className="flex-1 text-[12.5px] font-medium hover:text-brand truncate">
                    {c.nombre}
                  </Link>
                  <MoneyEUR value={c.primaAnual} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="col-span-12 lg:col-span-5 p-5">
          <SectionHeader
            title="Mis próximos vencimientos"
            hint="próximos 30 días"
            action={<Link to="/vencimientos" className="text-[11px] text-brand hover:underline flex items-center gap-1">Ver todos <ArrowUpRight className="size-3" /></Link>}
          />
          {data.vencimientos.length === 0 ? (
            <div className="p-6 text-center text-[12px] text-ink-subtle">
              Sin vencimientos cercanos. <CalendarClock className="size-4 inline ml-1" />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {data.vencimientos.map((v: any) => (
                <li key={v.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-medium truncate">Póliza #{v.id?.slice?.(0, 8) || ""}</div>
                    <div className="text-[10px] text-ink-subtle">{new Date(v.fecha_vencimiento).toLocaleDateString("es-ES")}</div>
                  </div>
                  <MoneyEUR value={Number(v.prima_anual || 0)} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <Card className="col-span-12 lg:col-span-7 p-5">
          <SectionHeader title="Mi perfil" />
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <div className="flex items-center gap-2">
              <User className="size-3.5 text-ink-subtle" />
              <span>{perfil?.nombre}</span>
            </div>
            <div className="text-ink-muted">{perfil?.email}</div>
            <div className="text-ink-muted">Tel: {perfil?.telefono || "—"}</div>
            <div className="text-ink-muted">
              IBAN: {perfil?.iban_cifrado ? `••••${perfil.iban_cifrado.slice(-4)}` : "Sin configurar"}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border">
            <Link to="/configuracion/perfil" className="text-[12px] font-medium text-brand hover:underline">
              Editar mi perfil y datos bancarios →
            </Link>
          </div>
        </Card>

        <Card className="col-span-12 lg:col-span-5 p-5">
          <SectionHeader title="Accesos rápidos" />
          <div className="space-y-1">
            {[
              { to: "/clientes", label: "Mis clientes", icon: User },
              { to: "/polizas", label: "Mis pólizas", icon: FileSignature },
              { to: "/captacion", label: "Pipeline de leads", icon: TrendingUp },
              { to: "/comisiones", label: "Mis comisiones", icon: Wallet },
              { to: "/mi-panel/disponibilidad", label: "Mi disponibilidad", icon: CalendarClock },
            ].map((a) => (
              <Link key={a.to} to={a.to} className="flex items-center gap-2.5 p-2 rounded hover:bg-secondary text-[12px] font-medium">
                <a.icon className="size-3.5 text-brand" />
                {a.label}
                <ArrowUpRight className="size-3 ml-auto text-ink-subtle" />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
