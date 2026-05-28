import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, FileBarChart, Users, AlertTriangle, MessageSquare, Building2 } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, SectionHeader } from "@/components/app/ui-bits";
import { supabase } from "@/lib/supabase";
import { exportarExcel } from "@/lib/exportar";
import { useDialog } from "@/components/app/dialog-provider";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/reportes")({
  component: ReportesPage,
  head: () => ({ meta: [{ title: "Reportes · Correduría OS" }] }),
});

function ReportesPage() {
  const { esRoot, esJefeZona, loading } = usePermissions();
  const { toast } = useDialog();
  const [busy, setBusy] = useState<string | null>(null);
  const [mes, setMes] = useState<string>(new Date().toISOString().slice(0, 7));

  if (!loading && !esRoot && !esJefeZona) {
    return (
      <PageShell title="Sin acceso">
        <Card className="p-8 text-center text-[13px] text-ink-subtle">
          Reportes solo disponibles para root o jefes de zona.
        </Card>
      </PageShell>
    );
  }

  const generarVentasPorComercial = async () => {
    setBusy("ventas");
    try {
      const [yyyy, mm] = mes.split("-").map(Number);
      const inicio = new Date(yyyy, mm - 1, 1).toISOString().split("T")[0];
      const fin = new Date(yyyy, mm, 0).toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("polizas")
        .select(`
          numero_poliza, ramo, aseguradora, prima_anual, fecha_inicio, estado,
          clientes(nombre_razon_social, comercial:usuarios!clientes_comercial_asignado_id_fkey(nombre, email))
        `)
        .gte("fecha_inicio", inicio)
        .lte("fecha_inicio", fin);
      if (error) throw new Error(error.message);

      // Agrupar por comercial
      const agg = new Map<string, { Comercial: string; Email: string; Polizas: number; PrimaTotal: number }>();
      (data || []).forEach((p: any) => {
        const com = p.clientes?.comercial?.nombre || "Sin asignar";
        const email = p.clientes?.comercial?.email || "";
        const prev = agg.get(com) || { Comercial: com, Email: email, Polizas: 0, PrimaTotal: 0 };
        prev.Polizas += 1;
        prev.PrimaTotal += Number(p.prima_anual || 0);
        agg.set(com, prev);
      });
      const rows = Array.from(agg.values()).map((r) => ({
        Comercial: r.Comercial,
        Email: r.Email,
        "Pólizas vendidas": r.Polizas,
        "Prima total (€)": Number(r.PrimaTotal.toFixed(2)),
      }));
      if (rows.length === 0) { toast("Sin ventas en el periodo seleccionado.", "warning"); return; }
      exportarExcel(`ventas_por_comercial_${mes}.xlsx`, "Ventas", rows);
      toast(`Reporte generado (${rows.length} comerciales)`, "success");
    } catch (e: any) {
      toast("Error: " + e.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const generarCaducidadesPorZona = async () => {
    setBusy("caducidades");
    try {
      const hoy = new Date().toISOString().split("T")[0];
      const en60 = new Date(Date.now() + 60 * 86400000).toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("vencimientos")
        .select(`
          id, fecha_vencimiento,
          polizas(numero_poliza, prima_anual, clientes(nombre_razon_social, comercial:usuarios!clientes_comercial_asignado_id_fkey(nombre, zonas!usuarios_zona_id_fkey(nombre))))
        `)
        .gte("fecha_vencimiento", hoy)
        .lte("fecha_vencimiento", en60);
      if (error) throw new Error(error.message);

      const agg = new Map<string, { Zona: string; Vencimientos: number; PrimaEnRiesgo: number }>();
      (data || []).forEach((v: any) => {
        const zona = v.polizas?.clientes?.comercial?.zonas?.nombre || "Sin zona";
        const prev = agg.get(zona) || { Zona: zona, Vencimientos: 0, PrimaEnRiesgo: 0 };
        prev.Vencimientos += 1;
        prev.PrimaEnRiesgo += Number(v.polizas?.prima_anual || 0);
        agg.set(zona, prev);
      });
      const rows = Array.from(agg.values()).map((r) => ({
        Zona: r.Zona,
        "Vencimientos próx. 60d": r.Vencimientos,
        "Prima en riesgo (€)": Number(r.PrimaEnRiesgo.toFixed(2)),
      }));
      if (rows.length === 0) { toast("Sin vencimientos en próximos 60 días.", "warning"); return; }
      exportarExcel(`caducidades_por_zona_${hoy}.xlsx`, "Caducidades", rows);
      toast(`Reporte generado (${rows.length} zonas)`, "success");
    } catch (e: any) {
      toast("Error: " + e.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const generarDocPendiente = async () => {
    setBusy("doc");
    try {
      const { data, error } = await supabase
        .from("clientes")
        .select("nombre_razon_social, nif_cif, email, telefono, dni_url, comercial:usuarios!clientes_comercial_asignado_id_fkey(nombre)");
      if (error) throw new Error(error.message);
      const pendientes = (data || []).filter((c: any) => !c.dni_url || !c.email);
      const rows = pendientes.map((c: any) => ({
        Cliente: c.nombre_razon_social,
        "NIF/CIF": c.nif_cif || "—",
        Email: c.email || "(falta)",
        Teléfono: c.telefono || "—",
        "DNI subido": c.dni_url ? "Sí" : "NO",
        Comercial: c.comercial?.nombre || "Sin asignar",
      }));
      if (rows.length === 0) { toast("Todos los clientes tienen email y DNI.", "success"); return; }
      exportarExcel(`documentacion_pendiente_${new Date().toISOString().slice(0, 10)}.xlsx`, "Doc pendiente", rows);
      toast(`Reporte generado (${rows.length} clientes pendientes)`, "success");
    } catch (e: any) {
      toast("Error: " + e.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const generarSeguimiento = async () => {
    setBusy("seguim");
    try {
      const limite = new Date(Date.now() - 60 * 86400000).toISOString();
      const { data: clientes, error } = await supabase
        .from("clientes")
        .select("id, nombre_razon_social, email, telefono, comercial:usuarios!clientes_comercial_asignado_id_fkey(nombre)");
      if (error) throw new Error(error.message);

      const { data: comms } = await supabase
        .from("comunicaciones")
        .select("cliente_id, fecha")
        .gte("fecha", limite);
      const conActividad = new Set((comms || []).map((c: any) => c.cliente_id));

      const inactivos = (clientes || []).filter((c: any) => !conActividad.has(c.id));
      const rows = inactivos.map((c: any) => ({
        Cliente: c.nombre_razon_social,
        Email: c.email || "—",
        Teléfono: c.telefono || "—",
        Comercial: c.comercial?.nombre || "Sin asignar",
        "Sin actividad desde": "+60 días",
      }));
      if (rows.length === 0) { toast("Todos los clientes han sido contactados en los últimos 60 días.", "success"); return; }
      exportarExcel(`seguimiento_clientes_${new Date().toISOString().slice(0, 10)}.xlsx`, "Seguimiento", rows);
      toast(`Reporte generado (${rows.length} clientes sin actividad)`, "success");
    } catch (e: any) {
      toast("Error: " + e.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const generarRankingAseguradoras = async () => {
    setBusy("ranking");
    try {
      const { data, error } = await supabase
        .from("polizas")
        .select("aseguradora, prima_anual, estado")
        .eq("estado", "activa");
      if (error) throw new Error(error.message);
      const agg = new Map<string, { Aseguradora: string; Polizas: number; PrimaTotal: number }>();
      (data || []).forEach((p: any) => {
        const a = p.aseguradora || "Sin definir";
        const prev = agg.get(a) || { Aseguradora: a, Polizas: 0, PrimaTotal: 0 };
        prev.Polizas += 1;
        prev.PrimaTotal += Number(p.prima_anual || 0);
        agg.set(a, prev);
      });
      const rows = Array.from(agg.values())
        .sort((a, b) => b.PrimaTotal - a.PrimaTotal)
        .map((r) => ({
          Aseguradora: r.Aseguradora,
          "Pólizas activas": r.Polizas,
          "Prima total (€)": Number(r.PrimaTotal.toFixed(2)),
        }));
      if (rows.length === 0) { toast("Sin pólizas activas.", "warning"); return; }
      exportarExcel(`ranking_aseguradoras_${new Date().toISOString().slice(0, 10)}.xlsx`, "Aseguradoras", rows);
      toast(`Reporte generado (${rows.length} aseguradoras)`, "success");
    } catch (e: any) {
      toast("Error: " + e.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const reportes = [
    {
      key: "ventas",
      title: "Ventas por comercial",
      desc: "Suma de pólizas vendidas y prima del periodo elegido, agrupado por comercial.",
      Icon: FileBarChart,
      action: generarVentasPorComercial,
      extra: (
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-ink-subtle uppercase tracking-widest">Mes:</label>
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            title="Mes a reportar"
            className="bg-secondary border-0 rounded px-2 py-1 text-[11px] ring-1 ring-border focus:ring-brand/30 outline-none font-mono"
          />
        </div>
      ),
    },
    {
      key: "caducidades",
      title: "Caducidades por zona",
      desc: "Conteo de vencimientos próximos (60 días) agrupado por zona comercial.",
      Icon: AlertTriangle,
      action: generarCaducidadesPorZona,
    },
    {
      key: "doc",
      title: "Documentación pendiente",
      desc: "Clientes sin DNI subido o sin email registrado.",
      Icon: Users,
      action: generarDocPendiente,
    },
    {
      key: "seguim",
      title: "Seguimiento de clientes",
      desc: "Clientes sin actividad (comunicaciones) registrada en >60 días.",
      Icon: MessageSquare,
      action: generarSeguimiento,
    },
    {
      key: "ranking",
      title: "Ranking aseguradoras",
      desc: "Pólizas activas y prima total por aseguradora.",
      Icon: Building2,
      action: generarRankingAseguradoras,
    },
  ];

  return (
    <PageShell
      title="Reportes"
      subtitle="Genera reportes Excel de ventas, vencimientos, documentación y rankings."
    >
      <SectionHeader title="Reportes disponibles" hint="Cada uno exporta a .xlsx" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reportes.map((r) => (
          <Card key={r.key} className="p-5 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-md bg-brand-soft text-brand grid place-items-center shrink-0">
                <r.Icon className="size-4" />
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-semibold">{r.title}</div>
                <div className="text-[11.5px] text-ink-muted mt-0.5">{r.desc}</div>
              </div>
            </div>
            {r.extra && <div>{r.extra}</div>}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={r.action}
                disabled={busy !== null}
                className="text-[12px] py-1.5 px-3 rounded bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Download className="size-3.5" />
                {busy === r.key ? "Generando…" : "Generar Excel"}
              </button>
            </div>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
