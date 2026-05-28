import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Calculator, Sparkles, AlertCircle, ArrowRight, History } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, MoneyEUR, RamoChip, SectionHeader, StatusBadge } from "@/components/app/ui-bits";
import { useDialog } from "@/components/app/dialog-provider";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/tarificador")({
  component: TarificadorPage,
  head: () => ({ meta: [{ title: "Tarificador · Correduría OS" }] }),
});

const RAMOS = ["Auto","Hogar","Vida","Salud","Comercio","Decesos"] as const;

interface CotizacionFake {
  aseguradora: string;
  prima_anual: number;
  comision_pct: number;
  coberturas: string[];
}

/**
 * NOTA TÉCNICA:
 * Las cotizaciones reales requieren integración con APIs de cada aseguradora
 * (Mapfre Connect, Allianz Direct, etc.) que tienen contratos comerciales,
 * sandbox y certificación específicos. Esta vista enseña el flujo y devuelve
 * cotizaciones SIMULADAS basadas en heurística (zona, edad, ramo).
 * El backend real reemplaza `simularCotizaciones()` por llamadas a las APIs.
 */
function simularCotizaciones(ramo: string, valor: number, edad: number): CotizacionFake[] {
  const base = Math.max(valor * 0.04, 200) * (1 + (Math.max(0, edad - 30) * 0.005));
  const aseguradoras = [
    { nombre: "Mapfre",   factor: 1.00 },
    { nombre: "Allianz",  factor: 0.95 },
    { nombre: "Axa",      factor: 1.08 },
    { nombre: "Generali", factor: 0.92 },
    { nombre: "Reale",    factor: 1.04 },
  ];
  return aseguradoras.map(a => ({
    aseguradora: a.nombre,
    prima_anual: Math.round(base * a.factor * 100) / 100,
    comision_pct: ramo === "Vida" ? 18 : ramo === "Decesos" ? 22 : 12,
    coberturas: ramo === "Auto"
      ? ["Terceros ampliado", "Lunas", "Asistencia 24h", "Robo e incendio"]
      : ramo === "Hogar"
      ? ["Continente", "Contenido", "RC familiar", "Asistencia hogar"]
      : ["Cobertura base", "Asistencia 24h"],
  })).sort((a, b) => a.prima_anual - b.prima_anual);
}

interface CotizacionHist {
  id: string;
  cliente_nombre: string | null;
  ramo: string;
  valor_asegurado: number | null;
  edad_tomador: number | null;
  resultados: any;
  presupuesto_id: string | null;
  created_at: string;
}

function TarificadorPage() {
  const navigate = useNavigate();
  const { toast, confirm } = useDialog();
  const { perfil } = usePermissions();
  const [form, setForm] = useState({ ramo: "Auto", valor: "15000", edad: "35", cliente: "" });
  const [cotizaciones, setCotizaciones] = useState<CotizacionFake[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [historico, setHistorico] = useState<CotizacionHist[]>([]);
  const [historicoMissing, setHistoricoMissing] = useState(false);
  const [loadingHist, setLoadingHist] = useState(true);

  const cargarHistorico = async () => {
    setLoadingHist(true);
    try {
      const { data, error } = await supabase
        .from("tarificador_cotizaciones")
        .select("id, cliente_nombre, ramo, valor_asegurado, edad_tomador, resultados, presupuesto_id, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) {
        setHistoricoMissing(true);
        setHistorico([]);
      } else {
        setHistoricoMissing(false);
        setHistorico((data as CotizacionHist[]) || []);
      }
    } catch {
      setHistoricoMissing(true);
      setHistorico([]);
    } finally {
      setLoadingHist(false);
    }
  };

  useEffect(() => {
    void cargarHistorico();
  }, []);

  const cotizar = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    // Simular latencia de API
    await new Promise(r => setTimeout(r, 800));
    setCotizaciones(simularCotizaciones(form.ramo, Number(form.valor), Number(form.edad)));
    setBusy(false);
  };

  const elegir = async (c: CotizacionFake) => {
    const ok = await confirm({
      title: "Generar presupuesto",
      message: `¿Crear un presupuesto con estos datos?\n\nAseguradora: ${c.aseguradora}\nRamo: ${form.ramo}\nPrima anual: ${c.prima_anual} €`,
      confirmLabel: "Crear",
      tone: "brand",
    });
    if (!ok) return;

    setBusy(true);

    // 1. Crear presupuesto en `presupuestos` (siempre)
    const year = new Date().getFullYear();
    const sufijo = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
    const { data: presupuesto, error: errPres } = await supabase
      .from("presupuestos")
      .insert({
        cliente_id: null,
        cliente_nombre: form.cliente || `Cotización ${form.ramo}`,
        ramo: form.ramo,
        aseguradora: c.aseguradora,
        prima_anual: c.prima_anual,
        fecha_validez: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
        estado: "borrador",
        notas: `Generado desde tarificador · coberturas: ${c.coberturas.join(", ")} · comisión ${c.comision_pct}%`,
        comercial_id: perfil?.id || null,
        numero: `PRES-${year}-${sufijo}`,
      })
      .select("id")
      .single();

    if (errPres) {
      setBusy(false);
      toast("No se pudo crear presupuesto: " + errPres.message, "error");
      return;
    }

    // 2. Intentar guardar histórico de cotización (DEFENSIVO — tabla puede no existir)
    try {
      await supabase.from("tarificador_cotizaciones").insert({
        cliente_id: null,
        cliente_nombre: form.cliente || null,
        comercial_id: perfil?.id || null,
        ramo: form.ramo,
        valor_asegurado: Number(form.valor),
        edad_tomador: Number(form.edad),
        resultados: cotizaciones,
        presupuesto_id: presupuesto?.id || null,
      });
    } catch {
      // Tabla no existe aún (migración v0.7 pendiente) — continuar silenciosamente
    }

    setBusy(false);
    toast("Presupuesto creado en borrador", "success");
    navigate({ to: "/presupuestos" });
  };

  return (
    <PageShell
      title="Tarificador"
      subtitle="Comparativa rápida de aseguradoras. Genera presupuesto desde aquí."
    >
      <Card className="p-4 mb-4 border-dashed border-2 border-warning/30 bg-warning/5">
        <div className="flex items-start gap-2 text-[12px]">
          <AlertCircle className="size-4 text-warning shrink-0 mt-0.5" />
          <div>
            <strong>Modo demostración.</strong> Las cotizaciones que ves abajo son simuladas con una fórmula simple (base × factor por aseguradora).
            La integración real con Mapfre / Allianz / Axa requiere contratos comerciales con cada compañía y sus APIs sandbox; cuando estén,
            sustituimos <code className="font-mono">simularCotizaciones()</code> por las llamadas reales sin tocar el resto.
          </div>
        </div>
      </Card>

      <Card className="p-4 mb-6">
        <SectionHeader
          title="Histórico de cotizaciones"
          hint={historicoMissing ? "Activar migración v0.7 para guardar histórico" : `Últimas ${historico.length} cotizaciones guardadas`}
          action={<History className="size-4 text-brand" />}
        />
        {historicoMissing ? (
          <div className="text-[11.5px] text-warning bg-warning/5 ring-1 ring-warning/20 rounded p-3">
            La tabla <code className="font-mono">tarificador_cotizaciones</code> no existe todavía. Activa la migración v0.7 para empezar a guardar el histórico de cotizaciones.
          </div>
        ) : loadingHist ? (
          <div className="text-[12px] text-ink-subtle">Cargando…</div>
        ) : historico.length === 0 ? (
          <div className="text-[12px] text-ink-subtle">Aún no se ha guardado ninguna cotización.</div>
        ) : (
          <ul className="divide-y divide-border">
            {historico.map((h) => (
              <li key={h.id} className="py-2 flex items-center gap-3 text-[11.5px]">
                <RamoChip ramo={h.ramo} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{h.cliente_nombre || "Sin cliente"}</div>
                  <div className="text-[10px] text-ink-subtle font-mono">
                    {new Date(h.created_at).toLocaleString()} · valor {Number(h.valor_asegurado || 0).toLocaleString("es-ES")} € · edad {h.edad_tomador ?? "—"}
                  </div>
                </div>
                {h.presupuesto_id && <StatusBadge tone="success">Convertida</StatusBadge>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-12 gap-6">
        <Card className="col-span-12 lg:col-span-5 p-5">
          <SectionHeader title="Datos del riesgo" hint="Para cotizar" />
          <form onSubmit={cotizar} className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Ramo</label>
              <select title="Ramo" value={form.ramo} onChange={e => setForm({ ...form, ramo: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none">
                {RAMOS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-ink-subtle mb-1">Valor asegurado (€)</label>
                <input title="Valor asegurado" placeholder="0" type="number" required value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-ink-subtle mb-1">Edad tomador</label>
                <input title="Edad tomador" placeholder="0" type="number" required value={form.edad} onChange={e => setForm({ ...form, edad: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Cliente (opcional)</label>
              <input value={form.cliente} placeholder="Nombre" onChange={e => setForm({ ...form, cliente: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
            <button type="submit" disabled={busy} className="w-full text-[12px] py-2 rounded bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
              <Calculator className="size-3.5" /> {busy ? "Cotizando con todas las aseguradoras…" : "Cotizar"}
            </button>
          </form>
        </Card>

        <div className="col-span-12 lg:col-span-7">
          <SectionHeader title="Cotizaciones" hint={cotizaciones ? `${cotizaciones.length} aseguradoras` : "Pulsa Cotizar para ver opciones"} action={<Sparkles className="size-4 text-brand" />} />
          {!cotizaciones ? (
            <Card className="p-10 text-center text-[12px] text-ink-subtle">
              Introduce los datos del riesgo a la izquierda y pulsa <strong>Cotizar</strong>.
            </Card>
          ) : (
            <div className="space-y-2">
              {cotizaciones.map((c, i) => (
                <Card key={c.aseguradora} className={["p-4 flex items-center gap-4", i === 0 ? "ring-2 ring-brand" : ""].join(" ")}>
                  <div className="size-10 rounded bg-brand-soft text-brand grid place-items-center text-[11px] font-bold">{c.aseguradora.slice(0,2).toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold">{c.aseguradora}</span>
                      {i === 0 && <StatusBadge tone="success">Mejor precio</StatusBadge>}
                      <RamoChip ramo={form.ramo} />
                    </div>
                    <div className="text-[10px] text-ink-subtle mt-1 truncate">{c.coberturas.join(" · ")}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[16px] font-semibold font-display"><MoneyEUR value={c.prima_anual} /></div>
                    <div className="text-[10px] text-ink-subtle">comisión {c.comision_pct}%</div>
                  </div>
                  <button type="button" onClick={() => elegir(c)} className="text-[11px] py-1.5 px-3 rounded bg-foreground text-background cursor-pointer flex items-center gap-1.5">
                    Elegir <ArrowRight className="size-3" />
                  </button>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
