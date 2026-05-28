import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shield, Trophy, TrendingUp, Users, FileText, Calendar } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, KpiCard, MoneyEUR, SectionHeader } from "@/components/app/ui-bits";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/dashboard-zona")({
  component: DashboardZonaPage,
  head: () => ({ meta: [{ title: "Dashboard de zona · Correduría OS" }] }),
});

interface ComercialStats {
  id: string;
  nombre: string;
  clientes: number;
  polizasActivas: number;
  primaTotal: number;
  comisiones: number;
}

interface ClienteStats {
  id: string;
  nombre: string;
  primaTotal: number;
  polizas: number;
}

interface DashboardData {
  zonaNombre: string;
  totalClientes: number;
  totalPolizasActivas: number;
  primaTotalZona: number;
  comisionesMes: number;
  topClientes: ClienteStats[];
  topComerciales: ComercialStats[];
  tendencias: { mes: string; polizas: number }[];
}

function DashboardZonaPage() {
  const { perfil, esJefeZona, esRoot, loading } = usePermissions();
  const [data, setData] = useState<DashboardData | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!perfil) return;
    if (!esJefeZona) { setBusy(false); return; }
    if (!perfil.zona_id) { setBusy(false); return; }

    (async () => {
      setBusy(true);

      // 1) Datos de la zona
      const { data: zona } = await supabase
        .from("zonas")
        .select("id, nombre")
        .eq("id", perfil.zona_id!)
        .maybeSingle();

      // 2) Comerciales de esa zona
      const { data: comerciales } = await supabase
        .from("usuarios")
        .select("id, nombre")
        .eq("rol", "comercial")
        .eq("activo", true)
        .eq("zona_id", perfil.zona_id!);

      const comercialIds = (comerciales || []).map((c: any) => c.id);

      // 3) Clientes asignados a esos comerciales + sus pólizas
      const { data: clientes } = comercialIds.length
        ? await supabase
            .from("clientes")
            .select("id, nombre_razon_social, comercial_asignado_id, polizas(id, prima_anual, comision_importe, estado, created_at)")
            .in("comercial_asignado_id", comercialIds)
        : { data: [] };

      // 4) Calcular KPIs
      let totalClientes = (clientes || []).length;
      let totalPolizasActivas = 0;
      let primaTotalZona = 0;
      let comisionesMes = 0;

      // por comercial
      const statsPorComercial = new Map<string, { clientes: number; polizasActivas: number; primaTotal: number; comisiones: number }>();
      // por cliente
      const statsPorCliente: ClienteStats[] = [];
      // tendencias últimos 4 meses
      const hoy = new Date();
      const meses: { key: string; label: string; ini: Date; fin: Date }[] = [];
      for (let i = 3; i >= 0; i--) {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        const fin = new Date(hoy.getFullYear(), hoy.getMonth() - i + 1, 1);
        meses.push({
          key: `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`,
          label: d.toLocaleDateString("es-ES", { month: "short", year: "2-digit" }),
          ini: d,
          fin,
        });
      }
      const tendencias = meses.map((m) => ({ mes: m.label, polizas: 0 }));

      (clientes || []).forEach((c: any) => {
        const polizasArr = c.polizas || [];
        const activas = polizasArr.filter((p: any) => p.estado === "activa");
        const primaCliente = activas.reduce((s: number, p: any) => s + Number(p.prima_anual || 0), 0);
        totalPolizasActivas += activas.length;
        primaTotalZona += primaCliente;

        // comisión mensual aproximada = comision_importe/12 ó prima * 0.1 / 12
        const comisionCli = activas.reduce(
          (s: number, p: any) => s + (Number(p.comision_importe || Number(p.prima_anual) * 0.1) / 12),
          0
        );
        comisionesMes += comisionCli;

        // por comercial
        const s = statsPorComercial.get(c.comercial_asignado_id) || { clientes: 0, polizasActivas: 0, primaTotal: 0, comisiones: 0 };
        s.clientes += 1;
        s.polizasActivas += activas.length;
        s.primaTotal += primaCliente;
        s.comisiones += comisionCli;
        statsPorComercial.set(c.comercial_asignado_id, s);

        // top cliente
        statsPorCliente.push({
          id: c.id,
          nombre: c.nombre_razon_social,
          primaTotal: primaCliente,
          polizas: activas.length,
        });

        // tendencias: contar pólizas creadas por mes
        polizasArr.forEach((p: any) => {
          if (!p.created_at) return;
          const created = new Date(p.created_at);
          meses.forEach((m, idx) => {
            if (created >= m.ini && created < m.fin) {
              tendencias[idx].polizas += 1;
            }
          });
        });
      });

      const topClientes = statsPorCliente
        .sort((a, b) => b.primaTotal - a.primaTotal)
        .slice(0, 5);

      const topComerciales: ComercialStats[] = (comerciales || [])
        .map((c: any) => ({
          id: c.id,
          nombre: c.nombre,
          ...(statsPorComercial.get(c.id) || { clientes: 0, polizasActivas: 0, primaTotal: 0, comisiones: 0 }),
        }))
        .sort((a, b) => b.primaTotal - a.primaTotal)
        .slice(0, 5);

      setData({
        zonaNombre: zona?.nombre || "Tu zona",
        totalClientes,
        totalPolizasActivas,
        primaTotalZona,
        comisionesMes,
        topClientes,
        topComerciales,
        tendencias,
      });
      setBusy(false);
    })();
  }, [perfil, esJefeZona]);

  if (loading || busy) {
    return (
      <PageShell title="Dashboard de zona">
        <Card className="p-8 text-center text-[13px] text-ink-subtle">Cargando…</Card>
      </PageShell>
    );
  }

  // Solo jefe_zona (root también puede para debug)
  if (!esJefeZona && !esRoot) {
    return (
      <PageShell title="Sin acceso">
        <Card className="p-8 text-center">
          <Shield className="size-8 text-ink-subtle mx-auto mb-3" />
          <p className="text-[13px] text-ink-subtle">Dashboard reservado a jefes de zona.</p>
        </Card>
      </PageShell>
    );
  }

  if (esJefeZona && !perfil?.zona_id) {
    return (
      <PageShell title="Dashboard de zona">
        <Card className="p-8 text-center text-[13px] text-ink-subtle">
          No tienes zona asignada. Pide a root que te asigne una zona en Configuración → Usuarios.
        </Card>
      </PageShell>
    );
  }

  if (!data) return null;

  const maxTendencia = Math.max(1, ...data.tendencias.map((t) => t.polizas));

  return (
    <PageShell
      title={`Dashboard · ${data.zonaNombre}`}
      subtitle="Resumen económico, ranking de comerciales y tendencia de captación"
    >
      <div className="grid grid-cols-4 gap-3 mb-6">
        <KpiCard label="Clientes" value={String(data.totalClientes)} hint="en la zona" />
        <KpiCard label="Pólizas activas" value={String(data.totalPolizasActivas)} hint="todas las del equipo" />
        <KpiCard label="Prima total" value={`${(data.primaTotalZona / 1000).toFixed(1)}k €`} hint="anual" />
        <KpiCard label="Comisiones mes" value={`${(data.comisionesMes).toFixed(0)} €`} delta="estimadas" deltaTone="success" />
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-6">
          <SectionHeader title="Top 5 clientes" hint="Por prima anual" action={<Trophy className="size-4 text-brand" />} />
          <Card>
            {data.topClientes.length === 0 ? (
              <div className="p-6 text-center text-[12px] text-ink-subtle">Sin clientes con pólizas en la zona.</div>
            ) : (
              <ul className="divide-y divide-border">
                {data.topClientes.map((c, i) => (
                  <li key={c.id} className="p-3 flex items-center gap-3">
                    <div className="size-8 rounded-md bg-brand-soft text-brand grid place-items-center text-[12px] font-bold">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <Link to="/clientes/$id" params={{ id: c.id }} className="text-[12.5px] font-medium hover:text-brand truncate block">
                        {c.nombre}
                      </Link>
                      <div className="text-[10px] text-ink-subtle">{c.polizas} pólizas activas</div>
                    </div>
                    <div className="text-[12.5px] font-semibold"><MoneyEUR value={c.primaTotal} /></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-6">
          <SectionHeader title="Top 5 comerciales" hint="Por prima gestionada" action={<Users className="size-4 text-brand" />} />
          <Card>
            {data.topComerciales.length === 0 ? (
              <div className="p-6 text-center text-[12px] text-ink-subtle">Sin comerciales en la zona.</div>
            ) : (
              <ul className="divide-y divide-border">
                {data.topComerciales.map((c, i) => (
                  <li key={c.id} className="p-3 flex items-center gap-3">
                    <div className="size-8 rounded-md bg-brand-soft text-brand grid place-items-center text-[12px] font-bold">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-medium truncate">{c.nombre}</div>
                      <div className="text-[10px] text-ink-subtle">
                        {c.clientes} clientes · {c.polizasActivas} pólizas activas
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[12.5px] font-semibold"><MoneyEUR value={c.primaTotal} /></div>
                      <div className="text-[10px] text-ink-subtle">comisión mes: <MoneyEUR value={c.comisiones} /></div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="col-span-12">
          <SectionHeader title="Tendencia últimos 4 meses" hint="Pólizas nuevas creadas" action={<TrendingUp className="size-4 text-brand" />} />
          <Card className="p-5">
            <div className="flex items-end gap-4 h-40">
              {data.tendencias.map((t) => {
                const altura = (t.polizas / maxTendencia) * 100;
                return (
                  <div key={t.mes} className="flex-1 flex flex-col items-center gap-2">
                    <div className="text-[11px] font-mono font-medium">{t.polizas}</div>
                    <div className="w-full bg-secondary/40 rounded relative" style={{ height: "100%" }}>
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-brand rounded transition-all"
                        style={{ height: `${altura}%`, minHeight: t.polizas > 0 ? "4px" : "0" }}
                      />
                    </div>
                    <div className="text-[10px] text-ink-subtle font-mono uppercase">{t.mes}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2 mt-4 text-[11px] text-ink-subtle">
              <FileText className="size-3" />
              Pólizas creadas por mes en la zona — incluye altas y conversiones desde presupuesto.
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
