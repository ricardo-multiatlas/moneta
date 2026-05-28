import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown, Eye, EyeOff, Plus, Trash2, Settings, X } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, KpiCard, MoneyEUR, SectionHeader, StatusBadge } from "@/components/app/ui-bits";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useDialog } from "@/components/app/dialog-provider";

export const Route = createFileRoute("/mi-dashboard")({
  component: MiDashboardPage,
  head: () => ({ meta: [{ title: "Mi dashboard · Correduría OS" }] }),
});

type Widget = {
  id: string;
  user_id: string;
  widget_type: string;
  position: number;
  size: "small" | "medium" | "large" | "full";
  config: Record<string, any>;
  visible: boolean;
};

type WidgetDef = {
  type: string;
  label: string;
  description: string;
  defaultSize: Widget["size"];
};

const CATALOGO: WidgetDef[] = [
  { type: "kpi_polizas", label: "KPI · Pólizas activas", description: "Total de pólizas con estado=activa", defaultSize: "small" },
  { type: "kpi_vencimientos", label: "KPI · Vencimientos 60d", description: "Vencimientos próximos a 60 días", defaultSize: "small" },
  { type: "kpi_leads", label: "KPI · Leads activos", description: "Leads en estado Nuevo", defaultSize: "small" },
  { type: "kpi_clientes", label: "KPI · Total clientes", description: "Clientes en cartera", defaultSize: "small" },
  { type: "kpi_comisiones_mes", label: "KPI · Comisiones del mes", description: "Suma de comisiones del mes en curso", defaultSize: "small" },
  { type: "top_clientes", label: "Top 10 clientes", description: "Por prima total anual", defaultSize: "medium" },
  { type: "top_comerciales", label: "Top 10 comerciales", description: "Por prima en cartera", defaultSize: "medium" },
  { type: "vencimientos_proximos", label: "Vencimientos críticos", description: "Próximos 7 días sin aviso", defaultSize: "large" },
  { type: "ultimos_clientes", label: "Últimos clientes", description: "Últimos 6 clientes registrados", defaultSize: "medium" },
  { type: "leads_semana", label: "Leads por día (7d)", description: "Mini-bar chart de leads última semana", defaultSize: "small" },
  { type: "ranking_aseguradoras", label: "Ranking aseguradoras", description: "Por prima activa", defaultSize: "medium" },
  { type: "accesos_rapidos", label: "Accesos rápidos", description: "Links a módulos principales", defaultSize: "small" },
];

function MiDashboardPage() {
  const { user } = useAuth();
  const { toast, confirm } = useDialog();
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("dashboard_widgets")
        .select("*")
        .eq("user_id", user.id)
        .order("position", { ascending: true });
      setWidgets((data as Widget[]) || []);
      setLoading(false);
    })();
  }, [user]);

  const guardarPosiciones = async (next: Widget[]) => {
    setWidgets(next);
    // Persistir nuevas posiciones
    await Promise.all(
      next.map((w, idx) =>
        supabase.from("dashboard_widgets").update({ position: idx }).eq("id", w.id)
      )
    );
  };

  const mover = async (idx: number, dir: -1 | 1) => {
    const next = [...widgets];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    await guardarPosiciones(next);
  };

  const toggleVisible = async (w: Widget) => {
    const { data } = await supabase
      .from("dashboard_widgets")
      .update({ visible: !w.visible })
      .eq("id", w.id)
      .select("*")
      .maybeSingle();
    if (data) setWidgets((prev) => prev.map((x) => (x.id === w.id ? (data as Widget) : x)));
  };

  const cambiarSize = async (w: Widget, size: Widget["size"]) => {
    const { data } = await supabase
      .from("dashboard_widgets")
      .update({ size })
      .eq("id", w.id)
      .select("*")
      .maybeSingle();
    if (data) setWidgets((prev) => prev.map((x) => (x.id === w.id ? (data as Widget) : x)));
  };

  const eliminar = async (w: Widget) => {
    const ok = await confirm(`¿Quitar "${CATALOGO.find((c) => c.type === w.widget_type)?.label || w.widget_type}" del dashboard?`);
    if (!ok) return;
    await supabase.from("dashboard_widgets").delete().eq("id", w.id);
    setWidgets((prev) => prev.filter((x) => x.id !== w.id));
  };

  const agregar = async (def: WidgetDef) => {
    if (!user) return;
    const { data, error } = await supabase
      .from("dashboard_widgets")
      .insert({
        user_id: user.id,
        widget_type: def.type,
        position: widgets.length,
        size: def.defaultSize,
        config: {},
        visible: true,
      })
      .select("*")
      .maybeSingle();
    if (error) { toast("Error: " + error.message, "error"); return; }
    setWidgets((prev) => [...prev, data as Widget]);
    setAdding(false);
    toast("Widget añadido", "success");
  };

  const noAgregados = CATALOGO.filter((c) => !widgets.find((w) => w.widget_type === c.type));

  return (
    <PageShell
      title="Mi dashboard"
      subtitle="Personaliza tu vista con los widgets que más uses."
      action={
        <div className="flex gap-2">
          {widgets.length > 0 && (
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              className={[
                "text-[12px] py-1.5 px-3 rounded-md ring-1 ring-border flex items-center gap-1.5 cursor-pointer",
                editMode ? "bg-brand text-brand-foreground" : "hover:bg-secondary",
              ].join(" ")}
            >
              <Settings className="size-3.5" /> {editMode ? "Listo" : "Editar"}
            </button>
          )}
          {editMode && widgets.length > 0 && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="text-[12px] py-1.5 px-3 rounded-md bg-foreground text-background flex items-center gap-1.5 cursor-pointer hover:brightness-110"
            >
              <Plus className="size-3.5" /> Añadir widget
            </button>
          )}
        </div>
      }
    >
      {loading ? (
        <Card className="p-8 text-center text-[13px] text-ink-subtle">Cargando widgets…</Card>
      ) : widgets.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="text-[14px] font-semibold mb-2">Tu dashboard está vacío</div>
          <div className="text-[12px] text-ink-muted mb-5">Empieza añadiendo widgets del catálogo.</div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-[12px] py-1.5 px-3 rounded-md bg-brand text-brand-foreground inline-flex items-center gap-1.5 cursor-pointer hover:brightness-110"
          >
            <Plus className="size-3.5" /> Añadir widget
          </button>
        </Card>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          {widgets.filter((w) => w.visible || editMode).map((w, idx) => {
            const def = CATALOGO.find((c) => c.type === w.widget_type);
            const colSpan = {
              small: "col-span-12 md:col-span-3",
              medium: "col-span-12 md:col-span-6",
              large: "col-span-12 md:col-span-8",
              full: "col-span-12",
            }[w.size];
            return (
              <div key={w.id} className={[colSpan, !w.visible ? "opacity-50" : ""].join(" ")}>
                <div className="relative">
                  {editMode && (
                    <div className="absolute top-1 right-1 z-10 flex gap-0.5 bg-background ring-1 ring-border rounded-md p-0.5">
                      <button type="button" onClick={() => mover(idx, -1)} title="Subir" className="p-1 hover:bg-secondary rounded cursor-pointer"><ArrowUp className="size-3" /></button>
                      <button type="button" onClick={() => mover(idx, 1)} title="Bajar" className="p-1 hover:bg-secondary rounded cursor-pointer"><ArrowDown className="size-3" /></button>
                      <select
                        value={w.size}
                        onChange={(e) => cambiarSize(w, e.target.value as Widget["size"])}
                        className="text-[10px] bg-secondary border-0 rounded px-1 py-0.5 cursor-pointer"
                        title="Tamaño"
                      >
                        <option value="small">S</option>
                        <option value="medium">M</option>
                        <option value="large">L</option>
                        <option value="full">XL</option>
                      </select>
                      <button type="button" onClick={() => toggleVisible(w)} title={w.visible ? "Ocultar" : "Mostrar"} className="p-1 hover:bg-secondary rounded cursor-pointer">
                        {w.visible ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                      </button>
                      <button type="button" onClick={() => eliminar(w)} title="Eliminar" className="p-1 hover:bg-danger/10 text-danger rounded cursor-pointer"><Trash2 className="size-3" /></button>
                    </div>
                  )}
                  <WidgetRenderer type={w.widget_type} label={def?.label || w.widget_type} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" onClick={() => setAdding(false)}>
          <div className="bg-background rounded-xl ring-1 ring-border max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-[14px] font-semibold">Catálogo de widgets</h3>
                <p className="text-[11px] text-ink-subtle mt-0.5">Selecciona los que quieras añadir a tu dashboard.</p>
              </div>
              <button type="button" onClick={() => setAdding(false)} title="Cerrar" aria-label="Cerrar catálogo" className="p-1.5 hover:bg-secondary rounded cursor-pointer"><X className="size-4" /></button>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              {noAgregados.length === 0 ? (
                <div className="col-span-2 text-center text-[12px] text-ink-subtle py-8">Ya tienes todos los widgets disponibles.</div>
              ) : noAgregados.map((def) => (
                <button
                  key={def.type}
                  type="button"
                  onClick={() => agregar(def)}
                  className="text-left p-3 rounded-md ring-1 ring-border hover:bg-secondary cursor-pointer"
                >
                  <div className="text-[12.5px] font-medium">{def.label}</div>
                  <div className="text-[11px] text-ink-subtle mt-0.5">{def.description}</div>
                  <StatusBadge tone="neutral">{def.defaultSize.toUpperCase()}</StatusBadge>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

// Renderer simple por tipo de widget — fetcha sus propios datos
function WidgetRenderer({ type, label }: { type: string; label: string }) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        if (type === "kpi_polizas") {
          const { count } = await supabase.from("polizas").select("*", { count: "exact", head: true }).eq("estado", "activa");
          setData({ value: count ?? 0 });
        } else if (type === "kpi_vencimientos") {
          const hoy = new Date().toISOString().slice(0, 10);
          const en60 = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
          const { count } = await supabase.from("vencimientos").select("*", { count: "exact", head: true }).gte("fecha_vencimiento", hoy).lte("fecha_vencimiento", en60);
          setData({ value: count ?? 0 });
        } else if (type === "kpi_leads") {
          const { count } = await supabase.from("leads").select("*", { count: "exact", head: true }).eq("estado", "Nuevo");
          setData({ value: count ?? 0 });
        } else if (type === "kpi_clientes") {
          const { count } = await supabase.from("clientes").select("*", { count: "exact", head: true });
          setData({ value: count ?? 0 });
        } else if (type === "kpi_comisiones_mes") {
          const inicio = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
          const { data: coms } = await supabase.from("comisiones").select("importe_calculado").gte("fecha_calculo", inicio);
          const total = (coms || []).reduce((s: number, c: any) => s + Number(c.importe_calculado || 0), 0);
          setData({ value: total });
        } else if (type === "top_clientes") {
          const { data: cli } = await supabase.from("clientes").select("id, nombre_razon_social, polizas(prima_anual, estado)");
          const top = (cli || []).map((c: any) => ({
            id: c.id,
            nombre: c.nombre_razon_social,
            prima: (c.polizas || []).filter((p: any) => p.estado === "activa").reduce((s: number, p: any) => s + Number(p.prima_anual || 0), 0),
          })).sort((a, b) => b.prima - a.prima).slice(0, 10);
          setData({ items: top });
        } else if (type === "vencimientos_proximos") {
          const hoy = new Date().toISOString().slice(0, 10);
          const en7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
          const { data: vencs } = await supabase
            .from("vencimientos")
            .select("id, fecha_vencimiento, polizas(numero_poliza, ramo, prima_anual, clientes(nombre_razon_social))")
            .gte("fecha_vencimiento", hoy)
            .lte("fecha_vencimiento", en7)
            .order("fecha_vencimiento", { ascending: true });
          setData({ items: vencs || [] });
        } else if (type === "ultimos_clientes") {
          const { data: cli } = await supabase.from("clientes").select("id, nombre_razon_social, tipo").order("created_at", { ascending: false }).limit(6);
          setData({ items: cli || [] });
        } else if (type === "ranking_aseguradoras") {
          const { data: pols } = await supabase.from("polizas").select("aseguradora, prima_anual").eq("estado", "activa");
          const agg = new Map<string, number>();
          (pols || []).forEach((p: any) => agg.set(p.aseguradora || "Sin definir", (agg.get(p.aseguradora || "Sin definir") || 0) + Number(p.prima_anual || 0)));
          const items = Array.from(agg.entries()).map(([nombre, prima]) => ({ nombre, prima })).sort((a, b) => b.prima - a.prima).slice(0, 8);
          setData({ items });
        } else {
          setData({});
        }
      } catch {
        setData({ error: true });
      }
    })();
  }, [type]);

  if (!data) return <Card className="p-4 h-32 grid place-items-center"><div className="text-[11px] text-ink-subtle">Cargando…</div></Card>;

  if (type.startsWith("kpi_")) {
    const formatted = type === "kpi_comisiones_mes"
      ? new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(data.value || 0)
      : String(data.value ?? 0);
    return <KpiCard label={label} value={formatted} />;
  }

  if (type === "top_clientes") {
    return (
      <Card className="p-4">
        <SectionHeader title={label} hint="Por prima anual total" />
        {(data.items || []).length === 0 ? (
          <div className="text-[12px] text-ink-subtle text-center py-4">Sin datos</div>
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((c: any, i: number) => (
              <li key={c.id} className="py-2 flex items-center justify-between text-[12px]">
                <Link to="/clientes/$id" params={{ id: c.id }} className="hover:text-brand truncate flex-1">{i + 1}. {c.nombre}</Link>
                <span className="font-medium ml-2"><MoneyEUR value={c.prima} /></span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  if (type === "vencimientos_proximos") {
    return (
      <Card className="p-4">
        <SectionHeader title={label} hint="Próximos 7 días" action={<Link to="/vencimientos" className="text-[11px] text-brand hover:underline">Ver todos →</Link>} />
        {(data.items || []).length === 0 ? (
          <div className="text-[12px] text-ink-subtle text-center py-4">No hay vencimientos críticos</div>
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((v: any) => (
              <li key={v.id} className="py-2 text-[12px] flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium truncate">{v.polizas?.clientes?.nombre_razon_social || "—"}</div>
                  <div className="text-[10px] text-ink-subtle">{v.polizas?.ramo} · {v.fecha_vencimiento}</div>
                </div>
                <MoneyEUR value={v.polizas?.prima_anual || 0} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  if (type === "ultimos_clientes") {
    return (
      <Card className="p-4">
        <SectionHeader title={label} action={<Link to="/clientes" className="text-[11px] text-brand hover:underline">Ver todos →</Link>} />
        <ul className="divide-y divide-border">
          {(data.items || []).map((c: any) => (
            <li key={c.id} className="py-2 text-[12px] flex items-center justify-between">
              <Link to="/clientes/$id" params={{ id: c.id }} className="hover:text-brand truncate flex-1">{c.nombre_razon_social}</Link>
              <StatusBadge tone="neutral">{c.tipo || "—"}</StatusBadge>
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  if (type === "ranking_aseguradoras") {
    const max = Math.max(...(data.items || []).map((i: any) => i.prima), 1);
    return (
      <Card className="p-4">
        <SectionHeader title={label} hint="Por prima activa" />
        <ul className="space-y-1.5">
          {(data.items || []).map((it: any) => (
            <li key={it.nombre} className="text-[12px]">
              <div className="flex justify-between mb-0.5">
                <span className="truncate">{it.nombre}</span>
                <MoneyEUR value={it.prima} />
              </div>
              <div className="h-1.5 bg-secondary rounded overflow-hidden">
                <div className="h-full bg-brand" style={{ width: `${(it.prima / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  return (
    <Card className="p-4 h-32 grid place-items-center">
      <div className="text-[11px] text-ink-subtle">{label}</div>
    </Card>
  );
}
