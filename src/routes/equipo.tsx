import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Users, Trophy, TrendingUp, Shield, UserPlus, Plus } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, KpiCard, MoneyEUR, SectionHeader } from "@/components/app/ui-bits";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/equipo")({
  component: EquipoPage,
  head: () => ({ meta: [{ title: "Mi equipo · Correduría OS" }] }),
});

function EquipoPage() {
  const { perfil, esJefeZona, esRoot, loading } = usePermissions();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!perfil) return;
    (async () => {
      setBusy(true);
      // Si es root: ve todos los comerciales agrupados por zona
      // Si es jefe_zona: solo su zona
      let comercialesQuery = supabase
        .from("usuarios")
        .select("id, nombre, email, telefono, zona_id, activo, zonas!usuarios_zona_id_fkey(nombre)")
        .eq("rol", "comercial")
        .eq("activo", true);

      if (esJefeZona && perfil.zona_id) {
        comercialesQuery = comercialesQuery.eq("zona_id", perfil.zona_id);
      }

      const { data: comerciales } = await comercialesQuery;

      // Para cada comercial, calcular: clientes, pólizas activas, prima total
      const ids = (comerciales || []).map((c: any) => c.id);
      const { data: clientes } = ids.length
        ? await supabase
            .from("clientes")
            .select("comercial_asignado_id, polizas(prima_anual, estado)")
            .in("comercial_asignado_id", ids)
        : { data: [] };

      const stats = new Map<string, { clientes: number; polizasActivas: number; primaTotal: number }>();
      (clientes || []).forEach((c: any) => {
        const s = stats.get(c.comercial_asignado_id) || { clientes: 0, polizasActivas: 0, primaTotal: 0 };
        s.clientes += 1;
        const activas = (c.polizas || []).filter((p: any) => p.estado === "activa");
        s.polizasActivas += activas.length;
        s.primaTotal += activas.reduce((sum: number, p: any) => sum + Number(p.prima_anual || 0), 0);
        stats.set(c.comercial_asignado_id, s);
      });

      const ranking = (comerciales || [])
        .map((c: any) => ({ ...c, ...(stats.get(c.id) || { clientes: 0, polizasActivas: 0, primaTotal: 0 }) }))
        .sort((a: any, b: any) => b.primaTotal - a.primaTotal);

      const totales = ranking.reduce(
        (acc: any, c: any) => ({
          clientes: acc.clientes + c.clientes,
          polizasActivas: acc.polizasActivas + c.polizasActivas,
          primaTotal: acc.primaTotal + c.primaTotal,
        }),
        { clientes: 0, polizasActivas: 0, primaTotal: 0 }
      );

      setData({ ranking, totales, totalComerciales: ranking.length });
      setBusy(false);
    })();
  }, [perfil, esJefeZona]);

  if (loading || busy) {
    return (
      <PageShell title="Mi equipo">
        <Card className="p-8 text-center text-[13px] text-ink-subtle">Cargando…</Card>
      </PageShell>
    );
  }

  if (!esJefeZona && !esRoot) {
    return (
      <PageShell title="Sin acceso">
        <Card className="p-8 text-center">
          <Shield className="size-8 text-ink-subtle mx-auto mb-3" />
          <p className="text-[13px] text-ink-subtle">Esta vista es para jefes de zona o root.</p>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={esRoot ? "Equipo comercial global" : "Mi equipo de zona"}
      subtitle={esRoot ? "Todos los comerciales activos" : "Comerciales asignados a tu zona"}
      action={
        <div className="flex items-center gap-2">
          <Link
            to="/clientes"
            className="text-[12px] font-medium py-1.5 px-3 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer"
          >
            <Users className="size-3.5" /> Ver clientes
          </Link>
          <Link
            to="/configuracion/usuarios"
            search={{ nuevo: "comercial" }}
            className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 flex items-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="size-3.5" /> Añadir comercial
          </Link>
        </div>
      }
    >
      <div className="grid grid-cols-4 gap-3 mb-6">
        <KpiCard label="Comerciales" value={String(data.totalComerciales)} hint="activos" />
        <KpiCard label="Clientes" value={String(data.totales.clientes)} hint="bajo el equipo" />
        <KpiCard label="Pólizas activas" value={String(data.totales.polizasActivas)} hint="cartera total" />
        <KpiCard label="Prima total" value={`${(data.totales.primaTotal / 1000).toFixed(1)}k €`} delta="anual" deltaTone="success" />
      </div>

      <Card>
        <div className="px-4 pt-4">
          <SectionHeader title="Ranking de comerciales" hint="por prima anual de su cartera" />
        </div>
        {data.ranking.length === 0 ? (
          <div className="p-8 text-center text-[12px] text-ink-subtle">
            {esJefeZona ? "Sin comerciales en tu zona aún." : "Sin comerciales activos en el sistema."}
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">#</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Comercial</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Zona</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Clientes</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Pólizas</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Prima</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.ranking.map((c: any, i: number) => (
                <tr key={c.id} className="hover:bg-secondary/30">
                  <td className="px-4 py-3 text-[12px] font-mono">
                    {i === 0 ? <Trophy className="size-4 text-warning" /> : i + 1}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[12.5px] font-medium">{c.nombre}</div>
                    <div className="text-[10px] text-ink-subtle">{c.email}</div>
                  </td>
                  <td className="px-4 py-3 text-[11.5px] text-ink-muted">{c.zonas?.nombre || "—"}</td>
                  <td className="px-4 py-3 text-[12px] font-mono">{c.clientes}</td>
                  <td className="px-4 py-3 text-[12px] font-mono">{c.polizasActivas}</td>
                  <td className="px-4 py-3 text-[12px]"><MoneyEUR value={c.primaTotal} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </PageShell>
  );
}
