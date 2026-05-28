import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Play, Save, Download, ArrowLeft, FileBarChart } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, SectionHeader, StatusBadge } from "@/components/app/ui-bits";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { exportarExcel } from "@/lib/exportar";
import { useDialog } from "@/components/app/dialog-provider";

export const Route = createFileRoute("/reportes/constructor")({
  component: ConstructorPage,
  head: () => ({ meta: [{ title: "Constructor de reportes · Correduría OS" }] }),
});

type Entidad = "polizas" | "clientes" | "vencimientos" | "leads" | "comisiones" | "presupuestos" | "facturas" | "liquidaciones" | "siniestros" | "comunicaciones";
type Operador = "=" | "!=" | ">" | "<" | ">=" | "<=" | "like" | "in" | "is null" | "not null";
type Filtro = { campo: string; operador: Operador; valor: string };
type Orden = { campo: string; direccion: "asc" | "desc" };
type Reporte = {
  id: string;
  user_id: string;
  nombre: string;
  descripcion: string | null;
  entidad: Entidad;
  columnas: string[];
  filtros: Filtro[];
  orden: Orden[];
  compartido: boolean;
  ultima_ejecucion: string | null;
};

const ENTIDADES: Record<Entidad, { label: string; columnas: { campo: string; label: string; tipo?: "fecha" | "num" | "bool" }[] }> = {
  polizas: {
    label: "Pólizas",
    columnas: [
      { campo: "numero_poliza", label: "Nº Póliza" },
      { campo: "ramo", label: "Ramo" },
      { campo: "aseguradora", label: "Aseguradora" },
      { campo: "prima_anual", label: "Prima anual", tipo: "num" },
      { campo: "comision_importe", label: "Comisión", tipo: "num" },
      { campo: "fecha_inicio", label: "Fecha inicio", tipo: "fecha" },
      { campo: "fecha_vencimiento", label: "Fecha vencimiento", tipo: "fecha" },
      { campo: "estado", label: "Estado" },
      { campo: "cliente_id", label: "ID Cliente" },
      { campo: "created_at", label: "Creado", tipo: "fecha" },
    ],
  },
  clientes: {
    label: "Clientes",
    columnas: [
      { campo: "nombre_razon_social", label: "Nombre / Razón social" },
      { campo: "nif_cif", label: "NIF/CIF" },
      { campo: "tipo", label: "Tipo" },
      { campo: "email", label: "Email" },
      { campo: "telefono", label: "Teléfono" },
      { campo: "estado", label: "Estado" },
      { campo: "comercial_asignado_id", label: "ID Comercial" },
      { campo: "created_at", label: "Creado", tipo: "fecha" },
    ],
  },
  vencimientos: {
    label: "Vencimientos",
    columnas: [
      { campo: "fecha_vencimiento", label: "Fecha vencimiento", tipo: "fecha" },
      { campo: "estado", label: "Estado" },
      { campo: "poliza_id", label: "ID Póliza" },
      { campo: "fecha_aviso", label: "Fecha aviso", tipo: "fecha" },
    ],
  },
  leads: {
    label: "Leads",
    columnas: [
      { campo: "nombre", label: "Nombre" },
      { campo: "email", label: "Email" },
      { campo: "telefono", label: "Teléfono" },
      { campo: "estado", label: "Estado" },
      { campo: "fuente", label: "Fuente" },
      { campo: "created_at", label: "Creado", tipo: "fecha" },
    ],
  },
  comisiones: {
    label: "Comisiones",
    columnas: [
      { campo: "importe_calculado", label: "Importe", tipo: "num" },
      { campo: "estado", label: "Estado" },
      { campo: "fecha_calculo", label: "Fecha cálculo", tipo: "fecha" },
      { campo: "comercial_id", label: "ID Comercial" },
      { campo: "poliza_id", label: "ID Póliza" },
    ],
  },
  presupuestos: {
    label: "Presupuestos",
    columnas: [
      { campo: "ramo", label: "Ramo" },
      { campo: "aseguradora", label: "Aseguradora" },
      { campo: "prima_estimada", label: "Prima estimada", tipo: "num" },
      { campo: "estado", label: "Estado" },
      { campo: "fecha_envio", label: "Fecha envío", tipo: "fecha" },
      { campo: "cliente_id", label: "ID Cliente" },
    ],
  },
  facturas: {
    label: "Facturas",
    columnas: [
      { campo: "numero_factura", label: "Nº Factura" },
      { campo: "importe", label: "Importe", tipo: "num" },
      { campo: "fecha_emision", label: "Fecha emisión", tipo: "fecha" },
      { campo: "estado", label: "Estado" },
    ],
  },
  liquidaciones: {
    label: "Liquidaciones",
    columnas: [
      { campo: "mes", label: "Mes" },
      { campo: "comercial_id", label: "ID Comercial" },
      { campo: "total_comisiones", label: "Total comisiones", tipo: "num" },
      { campo: "estado", label: "Estado" },
    ],
  },
  siniestros: {
    label: "Siniestros",
    columnas: [
      { campo: "numero_siniestro", label: "Nº Siniestro" },
      { campo: "fecha_siniestro", label: "Fecha", tipo: "fecha" },
      { campo: "tipo", label: "Tipo" },
      { campo: "estado", label: "Estado" },
      { campo: "importe_estimado", label: "Importe estimado", tipo: "num" },
    ],
  },
  comunicaciones: {
    label: "Comunicaciones",
    columnas: [
      { campo: "tipo", label: "Tipo" },
      { campo: "canal", label: "Canal" },
      { campo: "fecha", label: "Fecha", tipo: "fecha" },
      { campo: "cliente_id", label: "ID Cliente" },
    ],
  },
};

function ConstructorPage() {
  const { user } = useAuth();
  const { toast, confirm, prompt } = useDialog();
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Reporte | null>(null);
  const [creating, setCreating] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("reportes_personalizados")
        .select("*")
        .order("created_at", { ascending: false });
      setReportes((data as Reporte[]) || []);
      setLoading(false);
    })();
  }, [user]);

  const nuevoReporte = (): Reporte => ({
    id: "",
    user_id: user?.id || "",
    nombre: "Nuevo reporte",
    descripcion: null,
    entidad: "polizas",
    columnas: ENTIDADES.polizas.columnas.slice(0, 4).map((c) => c.campo),
    filtros: [],
    orden: [],
    compartido: false,
    ultima_ejecucion: null,
  });

  const guardar = async (r: Reporte) => {
    if (!user) return;
    const payload = {
      user_id: user.id,
      nombre: r.nombre,
      descripcion: r.descripcion,
      entidad: r.entidad,
      columnas: r.columnas,
      filtros: r.filtros,
      orden: r.orden,
      compartido: r.compartido,
    };
    if (r.id) {
      const { data, error } = await supabase.from("reportes_personalizados").update(payload).eq("id", r.id).select("*").maybeSingle();
      if (error) { toast("Error: " + error.message, "error"); return; }
      setReportes((prev) => prev.map((x) => (x.id === r.id ? (data as Reporte) : x)));
      toast("Reporte actualizado", "success");
    } else {
      const { data, error } = await supabase.from("reportes_personalizados").insert(payload).select("*").maybeSingle();
      if (error) { toast("Error: " + error.message, "error"); return; }
      setReportes((prev) => [data as Reporte, ...prev]);
      toast("Reporte creado", "success");
    }
    setEditing(null);
    setCreating(false);
  };

  const eliminar = async (r: Reporte) => {
    const ok = await confirm(`¿Eliminar "${r.nombre}"? Esta acción no se puede deshacer.`);
    if (!ok) return;
    await supabase.from("reportes_personalizados").delete().eq("id", r.id);
    setReportes((prev) => prev.filter((x) => x.id !== r.id));
    toast("Reporte eliminado", "success");
  };

  const ejecutar = async (r: Reporte) => {
    setRunning(true);
    try {
      let q = supabase.from(r.entidad).select(r.columnas.join(", "));
      r.filtros.forEach((f) => {
        if (f.operador === "is null") q = q.is(f.campo, null);
        else if (f.operador === "not null") q = q.not(f.campo, "is", null);
        else if (f.operador === "in") q = q.in(f.campo, f.valor.split(",").map((s) => s.trim()));
        else if (f.operador === "like") q = q.like(f.campo, `%${f.valor}%`);
        else if (f.operador === "=") q = q.eq(f.campo, f.valor);
        else if (f.operador === "!=") q = q.neq(f.campo, f.valor);
        else if (f.operador === ">") q = q.gt(f.campo, f.valor);
        else if (f.operador === "<") q = q.lt(f.campo, f.valor);
        else if (f.operador === ">=") q = q.gte(f.campo, f.valor);
        else if (f.operador === "<=") q = q.lte(f.campo, f.valor);
      });
      r.orden.forEach((o) => { q = q.order(o.campo, { ascending: o.direccion === "asc" }); });
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) { toast("Sin resultados con esos filtros.", "warning"); return; }
      // Renombrar columnas a labels legibles
      const labelByCampo = new Map(ENTIDADES[r.entidad].columnas.map((c) => [c.campo, c.label]));
      const rows = (data as any[]).map((row) => {
        const out: Record<string, any> = {};
        r.columnas.forEach((c) => { out[labelByCampo.get(c) || c] = row[c]; });
        return out;
      });
      exportarExcel(`${r.nombre.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`, r.nombre.slice(0, 30), rows);
      toast(`${rows.length} filas exportadas`, "success");
      // Marcar última ejecución
      if (r.id) await supabase.from("reportes_personalizados").update({ ultima_ejecucion: new Date().toISOString() }).eq("id", r.id);
    } catch (e: any) {
      toast("Error: " + e.message, "error");
    } finally {
      setRunning(false);
    }
  };

  const reporteActivo = editing || (creating ? nuevoReporte() : null);

  if (reporteActivo) {
    return (
      <PageShell
        title={editing ? "Editar reporte" : "Nuevo reporte"}
        subtitle="Define qué datos quieres exportar y guarda la plantilla para reutilizar."
        action={
          <button
            type="button"
            onClick={() => { setEditing(null); setCreating(false); }}
            className="text-[12px] py-1.5 px-3 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="size-3.5" /> Volver
          </button>
        }
      >
        <EditorReporte reporte={reporteActivo} onSave={guardar} onRun={ejecutar} running={running} />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Constructor de reportes"
      subtitle="Crea reportes personalizados con los campos y filtros que necesites."
      action={
        <div className="flex gap-2">
          <Link to="/reportes" className="text-[12px] py-1.5 px-3 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
            <FileBarChart className="size-3.5" /> Reportes predefinidos
          </Link>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="text-[12px] py-1.5 px-3 rounded-md bg-brand text-brand-foreground flex items-center gap-1.5 cursor-pointer hover:brightness-110"
          >
            <Plus className="size-3.5" /> Nuevo reporte
          </button>
        </div>
      }
    >
      <SectionHeader title="Mis reportes guardados" hint="Solo tú los ves a menos que los marques como compartidos." />
      {loading ? (
        <Card className="p-8 text-center text-[13px] text-ink-subtle">Cargando reportes…</Card>
      ) : reportes.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="text-[14px] font-semibold mb-2">No tienes reportes guardados</div>
          <div className="text-[12px] text-ink-muted mb-5">Crea uno para empezar a generar exportaciones a medida.</div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="text-[12px] py-1.5 px-3 rounded-md bg-brand text-brand-foreground inline-flex items-center gap-1.5 cursor-pointer hover:brightness-110"
          >
            <Plus className="size-3.5" /> Crear primer reporte
          </button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reportes.map((r) => (
            <Card key={r.id} className="p-4 flex flex-col">
              <div className="flex items-start justify-between mb-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold truncate">{r.nombre}</div>
                  <div className="text-[10px] text-ink-subtle uppercase tracking-widest mt-0.5">{ENTIDADES[r.entidad]?.label || r.entidad}</div>
                </div>
                {r.compartido && <StatusBadge tone="info">Compartido</StatusBadge>}
              </div>
              {r.descripcion && <div className="text-[11px] text-ink-muted mb-2">{r.descripcion}</div>}
              <div className="text-[11px] text-ink-subtle mb-3">
                {r.columnas.length} columna{r.columnas.length !== 1 ? "s" : ""} · {r.filtros.length} filtro{r.filtros.length !== 1 ? "s" : ""}
              </div>
              {r.ultima_ejecucion && (
                <div className="text-[10px] text-ink-subtle font-mono mb-3">Última: {new Date(r.ultima_ejecucion).toLocaleString("es-ES")}</div>
              )}
              <div className="flex gap-1.5 mt-auto">
                <button
                  type="button"
                  onClick={() => ejecutar(r)}
                  disabled={running}
                  className="flex-1 text-[11px] py-1.5 px-2 rounded bg-foreground text-background hover:brightness-110 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  <Download className="size-3" /> Ejecutar
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(r)}
                  className="text-[11px] py-1.5 px-2 rounded ring-1 ring-border hover:bg-secondary cursor-pointer"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => eliminar(r)}
                  className="text-[11px] py-1.5 px-2 rounded hover:bg-danger/10 text-danger cursor-pointer"
                  title="Eliminar"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}

function EditorReporte({ reporte, onSave, onRun, running }: { reporte: Reporte; onSave: (r: Reporte) => void; onRun: (r: Reporte) => void; running: boolean }) {
  const [r, setR] = useState<Reporte>(reporte);
  const cols = ENTIDADES[r.entidad]?.columnas || [];

  const toggleCol = (campo: string) => {
    setR((prev) => ({
      ...prev,
      columnas: prev.columnas.includes(campo) ? prev.columnas.filter((c) => c !== campo) : [...prev.columnas, campo],
    }));
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionHeader title="Información básica" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Nombre</label>
            <input
              type="text"
              value={r.nombre}
              onChange={(e) => setR({ ...r, nombre: e.target.value })}
              className="w-full bg-secondary border-0 rounded px-3 py-1.5 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Entidad</label>
            <select
              value={r.entidad}
              onChange={(e) => {
                const ent = e.target.value as Entidad;
                setR({ ...r, entidad: ent, columnas: ENTIDADES[ent].columnas.slice(0, 4).map((c) => c.campo), filtros: [], orden: [] });
              }}
              className="w-full bg-secondary border-0 rounded px-3 py-1.5 text-[12px] ring-1 ring-border cursor-pointer"
            >
              {Object.entries(ENTIDADES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Descripción (opcional)</label>
            <input
              type="text"
              value={r.descripcion || ""}
              onChange={(e) => setR({ ...r, descripcion: e.target.value || null })}
              className="w-full bg-secondary border-0 rounded px-3 py-1.5 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none"
              placeholder="Para qué sirve este reporte"
            />
          </div>
          <label className="md:col-span-2 flex items-center gap-2 text-[12px] cursor-pointer">
            <input type="checkbox" checked={r.compartido} onChange={(e) => setR({ ...r, compartido: e.target.checked })} className="cursor-pointer" />
            Compartido — visible para todos los usuarios
          </label>
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeader title="Columnas" hint="Marca las que quieras incluir en el Excel." />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {cols.map((c) => (
            <label key={c.campo} className="flex items-center gap-2 text-[12px] p-2 rounded hover:bg-secondary cursor-pointer">
              <input type="checkbox" checked={r.columnas.includes(c.campo)} onChange={() => toggleCol(c.campo)} className="cursor-pointer" />
              {c.label}
            </label>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeader title="Filtros" action={
          <button
            type="button"
            onClick={() => setR({ ...r, filtros: [...r.filtros, { campo: cols[0]?.campo || "", operador: "=", valor: "" }] })}
            className="text-[11px] py-1 px-2 rounded ring-1 ring-border hover:bg-secondary flex items-center gap-1 cursor-pointer"
          >
            <Plus className="size-3" /> Añadir filtro
          </button>
        } />
        {r.filtros.length === 0 ? (
          <div className="text-[12px] text-ink-subtle text-center py-4">Sin filtros — exportará todos los registros.</div>
        ) : (
          <div className="space-y-2">
            {r.filtros.map((f, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <select
                  value={f.campo}
                  onChange={(e) => { const next = [...r.filtros]; next[i].campo = e.target.value; setR({ ...r, filtros: next }); }}
                  className="col-span-4 bg-secondary border-0 rounded px-2 py-1 text-[11px] ring-1 ring-border cursor-pointer"
                >
                  {cols.map((c) => <option key={c.campo} value={c.campo}>{c.label}</option>)}
                </select>
                <select
                  value={f.operador}
                  onChange={(e) => { const next = [...r.filtros]; next[i].operador = e.target.value as Operador; setR({ ...r, filtros: next }); }}
                  className="col-span-3 bg-secondary border-0 rounded px-2 py-1 text-[11px] ring-1 ring-border cursor-pointer"
                >
                  {["=", "!=", ">", "<", ">=", "<=", "like", "in", "is null", "not null"].map((op) => <option key={op} value={op}>{op}</option>)}
                </select>
                <input
                  type="text"
                  value={f.valor}
                  onChange={(e) => { const next = [...r.filtros]; next[i].valor = e.target.value; setR({ ...r, filtros: next }); }}
                  placeholder={f.operador === "in" ? "valor1, valor2" : "valor"}
                  disabled={f.operador === "is null" || f.operador === "not null"}
                  className="col-span-4 bg-secondary border-0 rounded px-2 py-1 text-[11px] ring-1 ring-border disabled:opacity-40"
                />
                <button
                  type="button"
                  onClick={() => setR({ ...r, filtros: r.filtros.filter((_, j) => j !== i) })}
                  className="col-span-1 p-1 rounded hover:bg-danger/10 text-danger cursor-pointer flex items-center justify-center"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <SectionHeader title="Orden" action={
          <button
            type="button"
            onClick={() => setR({ ...r, orden: [...r.orden, { campo: cols[0]?.campo || "", direccion: "asc" }] })}
            className="text-[11px] py-1 px-2 rounded ring-1 ring-border hover:bg-secondary flex items-center gap-1 cursor-pointer"
          >
            <Plus className="size-3" /> Añadir orden
          </button>
        } />
        {r.orden.length === 0 ? (
          <div className="text-[12px] text-ink-subtle text-center py-4">Sin orden — usará el orden por defecto de la tabla.</div>
        ) : (
          <div className="space-y-2">
            {r.orden.map((o, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <select
                  value={o.campo}
                  onChange={(e) => { const next = [...r.orden]; next[i].campo = e.target.value; setR({ ...r, orden: next }); }}
                  className="col-span-7 bg-secondary border-0 rounded px-2 py-1 text-[11px] ring-1 ring-border cursor-pointer"
                >
                  {cols.map((c) => <option key={c.campo} value={c.campo}>{c.label}</option>)}
                </select>
                <select
                  value={o.direccion}
                  onChange={(e) => { const next = [...r.orden]; next[i].direccion = e.target.value as "asc" | "desc"; setR({ ...r, orden: next }); }}
                  className="col-span-4 bg-secondary border-0 rounded px-2 py-1 text-[11px] ring-1 ring-border cursor-pointer"
                >
                  <option value="asc">Ascendente</option>
                  <option value="desc">Descendente</option>
                </select>
                <button
                  type="button"
                  onClick={() => setR({ ...r, orden: r.orden.filter((_, j) => j !== i) })}
                  className="col-span-1 p-1 rounded hover:bg-danger/10 text-danger cursor-pointer flex items-center justify-center"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex gap-2 sticky bottom-0 bg-background py-3 border-t border-border">
        <button
          type="button"
          onClick={() => onSave(r)}
          disabled={r.columnas.length === 0 || !r.nombre.trim()}
          className="text-[12px] py-2 px-4 rounded-md bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
        >
          <Save className="size-3.5" /> Guardar
        </button>
        <button
          type="button"
          onClick={() => onRun(r)}
          disabled={running || r.columnas.length === 0}
          className="text-[12px] py-2 px-4 rounded-md bg-foreground text-background hover:brightness-110 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
        >
          <Play className="size-3.5" /> {running ? "Ejecutando…" : "Ejecutar ahora"}
        </button>
      </div>
    </div>
  );
}
