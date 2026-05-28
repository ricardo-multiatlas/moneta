import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, List } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, StatusBadge } from "@/components/app/ui-bits";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/vencimientos/calendario")({
  component: CalendarioVencimientosPage,
  head: () => ({ meta: [{ title: "Calendario vencimientos · Correduría OS" }] }),
  loader: async () => {
    const today = new Date();
    const inicio = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];
    const fin = new Date(today.getFullYear(), today.getMonth() + 3, 0).toISOString().split("T")[0];

    const { data } = await supabase
      .from("vencimientos")
      .select(`
        id, fecha_vencimiento, estado,
        polizas(id, numero_poliza, ramo, prima_anual, clientes(nombre_razon_social))
      `)
      .gte("fecha_vencimiento", inicio)
      .lte("fecha_vencimiento", fin)
      .order("fecha_vencimiento", { ascending: true });

    return { vencimientos: data || [] };
  },
});

function CalendarioVencimientosPage() {
  const { vencimientos } = Route.useLoaderData();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0..11

  // Map fecha → vencimientos
  const porFecha = useMemo(() => {
    const m = new Map<string, any[]>();
    vencimientos.forEach((v: any) => {
      const arr = m.get(v.fecha_vencimiento) || [];
      arr.push(v);
      m.set(v.fecha_vencimiento, arr);
    });
    return m;
  }, [vencimientos]);

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  // Lunes = 0
  const firstWeekday = (firstDayOfMonth.getDay() + 6) % 7;

  const cells: Array<{ date: Date | null; key: string }> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ date: null, key: `pad-${i}` });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    cells.push({ date, key: date.toISOString() });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, key: `tail-${cells.length}` });

  const monthName = new Date(year, month, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });

  const prevMonth = () => {
    if (month === 0) { setYear(year - 1); setMonth(11); }
    else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(year + 1); setMonth(0); }
    else setMonth(month + 1);
  };

  const fechaIso = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };
  const todayIso = fechaIso(today);

  return (
    <PageShell
      title="Calendario de vencimientos"
      subtitle="Vista mensual de pólizas que vencen — visualiza la carga del mes de un vistazo."
      action={
        <div className="flex items-center gap-2">
          <Link to="/vencimientos" className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
            <List className="size-3.5" /> Volver a lista
          </Link>
        </div>
      }
    >
      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <button type="button" onClick={prevMonth} className="p-1.5 rounded hover:bg-secondary cursor-pointer" title="Mes anterior">
            <ChevronLeft className="size-4" />
          </button>
          <h2 className="text-[14px] font-semibold capitalize">{monthName}</h2>
          <button type="button" onClick={nextMonth} className="p-1.5 rounded hover:bg-secondary cursor-pointer" title="Mes siguiente">
            <ChevronRight className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
            <div key={d} className="text-[10px] font-medium uppercase tracking-widest text-ink-subtle text-center py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((c) => {
            if (!c.date) {
              return <div key={c.key} className="min-h-[88px] bg-secondary/20 rounded ring-1 ring-border/40" />;
            }
            const iso = fechaIso(c.date);
            const items = porFecha.get(iso) || [];
            const isToday = iso === todayIso;
            return (
              <div
                key={c.key}
                className={[
                  "min-h-[88px] rounded ring-1 p-1.5 bg-surface overflow-hidden",
                  isToday ? "ring-brand bg-brand-soft/40" : "ring-border/60",
                ].join(" ")}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={["text-[11px] font-mono", isToday ? "text-brand font-bold" : "text-ink-muted"].join(" ")}>
                    {c.date.getDate()}
                  </span>
                  {items.length > 0 && (
                    <span className="text-[9px] font-mono text-ink-subtle">{items.length}</span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {items.slice(0, 3).map((v: any) => {
                    const p = v.polizas || {};
                    const cliente = p.clientes?.nombre_razon_social || "—";
                    const dias = Math.ceil((new Date(v.fecha_vencimiento).getTime() - today.getTime()) / 86400000);
                    const tone = dias < 7 ? "danger" : dias < 30 ? "warning" : "neutral";
                    return (
                      <div key={v.id} className="text-[10px] truncate" title={`${p.numero_poliza} · ${cliente}`}>
                        <StatusBadge tone={tone as any}>{p.numero_poliza || "—"}</StatusBadge>
                        <span className="ml-1 text-ink-muted">{cliente}</span>
                      </div>
                    );
                  })}
                  {items.length > 3 && (
                    <div className="text-[9px] text-ink-subtle font-mono">+{items.length - 3} más</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="flex items-center gap-3 text-[11px] text-ink-subtle">
        <span>Leyenda:</span>
        <span className="inline-flex items-center gap-1"><StatusBadge tone="danger">·</StatusBadge> &lt;7 días</span>
        <span className="inline-flex items-center gap-1"><StatusBadge tone="warning">·</StatusBadge> &lt;30 días</span>
        <span className="inline-flex items-center gap-1"><StatusBadge tone="neutral">·</StatusBadge> &gt;30 días</span>
      </div>
    </PageShell>
  );
}

