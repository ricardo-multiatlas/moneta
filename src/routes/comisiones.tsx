import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Upload, AlertCircle, CheckCircle2, Sparkles, Loader2, FileSpreadsheet, ThumbsUp, ThumbsDown, Filter } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { PageShell } from "@/components/app/page-shell";
import { Card, KpiCard, MoneyEUR, SectionHeader, StatusBadge, Modal } from "@/components/app/ui-bits";
import { supabase } from "@/lib/supabase";
import { extractComisionFn } from "@/lib/ai-comisiones";
import { useDialog } from "@/components/app/dialog-provider";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/comisiones")({
  component: ComisionesPage,
  head: () => ({ meta: [{ title: "Comisiones · Correduría OS" }] }),
  loader: async () => {
    const { data: polizas } = await supabase
      .from("polizas")
      .select(`
        id, numero_poliza, aseguradora, prima_anual, comision_importe,
        clientes(comercial_asignado_id)
      `)
      .eq("estado", "activa");

    const { data: reportes } = await supabase
      .from("comisiones_reportes")
      .select(`
        id, aseguradora, mes_reportado, importe_declarado, importe_calculado, diferencia, estado, created_at,
        comisiones_lineas(id, numero_poliza, tomador, importe_declarado, importe_esperado, diferencia, estado_match)
      `)
      .order("created_at", { ascending: false });

    const { data: comerciales } = await supabase
      .from("usuarios")
      .select("id, nombre")
      .eq("rol", "comercial")
      .order("nombre");

    return { polizas: polizas || [], reportes: reportes || [], comerciales: comerciales || [] };
  },
});

function calcularInformes(polizas: any[], reportes: any[]) {
  const aseguradorasMap = new Map<string, any>();
  polizas.forEach((p) => {
    const a = p.aseguradora || "Desconocida";
    const data = aseguradorasMap.get(a) || {
      aseguradora: a,
      polizas: 0,
      calculadoSistema: 0,
    };
    data.polizas += 1;
    const comision = Number(p.comision_importe || (Number(p.prima_anual) * 0.1));
    data.calculadoSistema += comision;
    aseguradorasMap.set(a, data);
  });

  return Array.from(aseguradorasMap.values()).map((a) => {
    const reporte = reportes.find((r) => r.aseguradora.toLowerCase() === a.aseguradora.toLowerCase());
    const declarado = reporte ? Number(reporte.importe_declarado || 0) : 0;
    const diferencia = a.calculadoSistema - declarado;
    let estado: string = "Pendiente subir";
    if (reporte) {
      if (reporte.estado === "Aprobado" || reporte.estado === "Rechazado") estado = reporte.estado;
      else estado = Math.abs(diferencia) < 1 ? "Conciliado" : "Discrepancia";
    }
    return {
      id: a.aseguradora,
      aseguradora: a.aseguradora,
      periodo: reporte?.mes_reportado || "Mes actual",
      polizas: a.polizas,
      calculadoSistema: a.calculadoSistema,
      declaradoAseguradora: declarado,
      diferencia,
      estado,
      reporteId: reporte?.id,
      lineas: reporte?.comisiones_lineas || [],
    };
  });
}

function ComisionesPage() {
  const { polizas, reportes, comerciales } = Route.useLoaderData();
  const router = useRouter();
  const { toast, confirm, prompt } = useDialog();
  const { esRoot, perfil } = usePermissions();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractStep, setExtractStep] = useState<string>("");
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [filtroComercial, setFiltroComercial] = useState<string>("");

  const polizasFiltradas = useMemo(() => {
    if (!filtroComercial) return polizas;
    return polizas.filter((p: any) => p.clientes?.comercial_asignado_id === filtroComercial);
  }, [polizas, filtroComercial]);

  const informesComision = useMemo(
    () => calcularInformes(polizasFiltradas, reportes),
    [polizasFiltradas, reportes]
  );

  const totalCalculado = informesComision.reduce((s: number, i: any) => s + i.calculadoSistema, 0);
  const totalDeclarado = informesComision.reduce((s: number, i: any) => s + i.declaradoAseguradora, 0);
  const diferenciaTotal = totalCalculado - totalDeclarado;
  const recibidos = informesComision.filter((i: any) => i.estado !== "Pendiente subir").length;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsExtracting(true);
    setExtractStep("Leyendo archivo…");

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        setExtractStep("Analizando con IA…");

        const res = await extractComisionFn({
          data: { fileBase64: base64, mimeType: file.type || "application/pdf" },
        });

        if (!res.success) {
          toast("Error analizando informe: " + res.error, "error");
          setIsExtracting(false);
          setExtractStep("");
          return;
        }

        const { aseguradora, periodo, lineas, importe_total } = res.data;
        setExtractStep("Cruzando con tus pólizas…");

        // Buscar pólizas de esa aseguradora para hacer match
        const { data: polizasAseg } = await supabase
          .from("polizas")
          .select("id, numero_poliza, prima_anual, comision_importe, clientes(nombre_razon_social)")
          .ilike("aseguradora", aseguradora);

        const polizasMap = new Map<string, any>();
        (polizasAseg || []).forEach((p: any) => polizasMap.set(p.numero_poliza, p));

        // Crear reporte
        const { data: reporte, error: errRep } = await supabase
          .from("comisiones_reportes")
          .insert({
            aseguradora,
            mes_reportado: periodo,
            importe_declarado: importe_total,
            importe_calculado: 0,
            diferencia: 0,
            estado: "Pendiente subir",
          })
          .select("id")
          .single();

        if (errRep || !reporte) {
          toast("Error guardando reporte: " + errRep?.message, "error");
          setIsExtracting(false);
          setExtractStep("");
          return;
        }

        // Insertar líneas + match
        let calculadoTotal = 0;
        const lineasInsert = lineas.map((l) => {
          const pol = polizasMap.get(l.numero_poliza);
          const esperado = pol ? Number(pol.comision_importe || Number(pol.prima_anual) * 0.1) : 0;
          calculadoTotal += esperado;
          return {
            reporte_id: reporte.id,
            numero_poliza: l.numero_poliza,
            tomador: l.tomador || pol?.clientes?.nombre_razon_social || null,
            importe_declarado: l.importe_declarado,
            importe_esperado: esperado,
            diferencia: esperado - l.importe_declarado,
            poliza_id: pol?.id || null,
            estado_match: pol ? "match_exacto" : "sin_match",
          };
        });

        if (lineasInsert.length > 0) {
          await supabase.from("comisiones_lineas").insert(lineasInsert);
        }

        const diferencia = calculadoTotal - importe_total;
        const estadoFinal = Math.abs(diferencia) < 1 ? "Conciliado" : "Discrepancia";
        await supabase
          .from("comisiones_reportes")
          .update({
            importe_calculado: calculadoTotal,
            diferencia,
            estado: estadoFinal,
          })
          .eq("id", reporte.id);

        await confirm({
          title: "Informe procesado",
          message: `Aseguradora: ${aseguradora}\nPeriodo: ${periodo}\nLíneas: ${lineas.length}\nDeclarado: ${importe_total.toFixed(2)}€\nCalculado por sistema: ${calculadoTotal.toFixed(2)}€\nDiferencia: ${diferencia.toFixed(2)}€\nEstado: ${estadoFinal}`,
          confirmLabel: "OK",
          cancelLabel: "Cerrar",
          tone: "brand",
        });
        router.invalidate();
        setIsExtracting(false);
        setExtractStep("");
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast("Error procesando archivo: " + err.message, "error");
      setIsExtracting(false);
      setExtractStep("");
    }
  };

  const aprobarReporte = async (reporteId: string) => {
    const ok = await confirm({ message: "¿Aprobar este informe de comisiones?", tone: "brand" });
    if (!ok) return;
    const { error } = await supabase.from("comisiones_reportes").update({
      estado: "Aprobado",
      aprobado_por: perfil?.id,
      aprobado_at: new Date().toISOString(),
    }).eq("id", reporteId);
    if (error) toast("Error: " + error.message, "error");
    else { toast("Informe aprobado", "success"); router.invalidate(); }
  };

  const rechazarReporte = async (reporteId: string) => {
    const nota = await prompt({
      title: "Rechazar informe",
      message: "Motivo del rechazo (opcional):",
      placeholder: "Diferencia no explicada, falta de soporte…",
    });
    if (nota === null) return;
    const { error } = await supabase.from("comisiones_reportes").update({
      estado: "Rechazado",
    }).eq("id", reporteId);
    if (error) toast("Error: " + error.message, "error");
    else {
      if (nota) {
        // Registramos motivo en comunicaciones para trazabilidad
        await supabase.from("comunicaciones").insert({
          tipo: "nota",
          asunto: "Rechazo informe comisiones",
          contenido: `Reporte ${reporteId} rechazado. Motivo: ${nota}`,
          fecha: new Date().toISOString(),
        });
      }
      toast("Informe rechazado", "success");
      router.invalidate();
    }
  };

  const detalle = informesComision.find((i: any) => i.id === detalleId);

  return (
    <PageShell
      title="Reconciliación de comisiones"
      subtitle="Sube el informe mensual de cada aseguradora — PDF o Excel — y la IA lo cruza con vuestras pólizas. Identifica diferencias, errores y comisiones impagadas."
      action={
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isExtracting}
          className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          {isExtracting ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          {isExtracting ? extractStep : "Subir informe"}
        </button>
      }
    >
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,image/*"
        onChange={handleFileUpload}
        title="Subir informe de aseguradora"
        placeholder="informe.pdf"
      />

      <Card className="p-4 mb-6 border-dashed border-2 border-brand/20 bg-brand-soft/30">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-md bg-brand text-brand-foreground grid place-items-center">
            {isExtracting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          </div>
          <div className="flex-1">
            <div className="text-[13px] font-medium">Conciliación de comisiones con IA</div>
            <div className="text-[11.5px] text-ink-muted mt-0.5">
              Arrastra el informe mensual (PDF, Excel, CSV o imagen). La IA extrae todas las líneas y las cruza contra tus pólizas activas.
            </div>
          </div>
          <button
            type="button"
            disabled={isExtracting}
            onClick={() => fileInputRef.current?.click()}
            className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-foreground text-background cursor-pointer disabled:opacity-50"
          >
            {isExtracting ? extractStep : "Seleccionar archivo"}
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <KpiCard label="Sistema calcula" value={`${(totalCalculado / 1000).toFixed(1)}k €`} hint="comisión esperada" />
        <KpiCard label="Aseguradoras declaran" value={`${(totalDeclarado / 1000).toFixed(1)}k €`} hint="recibido" />
        <KpiCard
          label="Diferencia a reclamar"
          value={`${(Math.abs(diferenciaTotal) / 1000).toFixed(2)}k €`}
          delta={`${informesComision.filter((i: any) => i.estado === "Discrepancia").length} con discrepancia`}
          deltaTone={Math.abs(diferenciaTotal) > 1 ? "danger" : "success"}
        />
        <KpiCard
          label="Informes recibidos"
          value={`${recibidos}/${informesComision.length}`}
          hint="aseguradoras del periodo"
        />
      </div>

      <SectionHeader
        title="Informes por aseguradora"
        hint="Estado de conciliación del periodo en curso"
        action={
          <div className="flex items-center gap-1.5 ring-1 ring-border rounded-md px-2 py-1 bg-surface">
            <Filter className="size-3.5 text-ink-subtle" />
            <label className="text-[11px] text-ink-subtle">Comercial:</label>
            <select
              title="Filtrar por comercial"
              value={filtroComercial}
              onChange={(e) => setFiltroComercial(e.target.value)}
              className="text-[12px] font-medium bg-transparent border-0 outline-none cursor-pointer pr-1"
            >
              <option value="">Todos</option>
              {comerciales.map((c: any) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
        }
      />

      {informesComision.length === 0 ? (
        <Card className="p-8 text-center text-ink-subtle text-sm">
          No hay pólizas activas para calcular comisiones. Crea pólizas para empezar.
        </Card>
      ) : (
        <Card>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Aseguradora</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Periodo</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Pólizas</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Sistema calcula</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Aseg. declara</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Diferencia</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {informesComision.map((i: any) => {
                const tone =
                  i.estado === "Aprobado" ? "success" :
                  i.estado === "Rechazado" ? "danger" :
                  i.estado === "Conciliado" ? "success" :
                  i.estado === "Discrepancia" ? "danger" : "neutral";
                const puedeAprobar = esRoot && i.reporteId && (i.estado === "Conciliado" || i.estado === "Discrepancia");
                return (
                  <tr key={i.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-[12.5px] font-medium">{i.aseguradora}</td>
                    <td className="px-4 py-3 text-[11px] text-ink-muted">{i.periodo}</td>
                    <td className="px-4 py-3 text-[12px] font-mono">{i.polizas}</td>
                    <td className="px-4 py-3 text-[12px]"><MoneyEUR value={i.calculadoSistema} /></td>
                    <td className="px-4 py-3 text-[12px] text-ink-muted"><MoneyEUR value={i.declaradoAseguradora} /></td>
                    <td className={["px-4 py-3 text-[12px] font-medium", i.diferencia > 0 ? "text-danger" : i.diferencia < 0 ? "text-warning" : "text-success"].join(" ")}>
                      <div className="flex items-center gap-1">
                        {Math.abs(i.diferencia) < 1 ? <CheckCircle2 className="size-3.5" /> : <AlertCircle className="size-3.5" />}
                        <MoneyEUR value={Math.abs(i.diferencia)} />
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge tone={tone as any}>{i.estado}</StatusBadge></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {puedeAprobar && (
                          <>
                            <button
                              type="button"
                              onClick={() => aprobarReporte(i.reporteId)}
                              title="Aprobar informe"
                              className="p-1 rounded text-success hover:bg-success/10 cursor-pointer"
                            >
                              <ThumbsUp className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => rechazarReporte(i.reporteId)}
                              title="Rechazar informe"
                              className="p-1 rounded text-danger hover:bg-danger/10 cursor-pointer"
                            >
                              <ThumbsDown className="size-3.5" />
                            </button>
                          </>
                        )}
                        {i.reporteId ? (
                          <button type="button" onClick={() => setDetalleId(i.id)} className="text-[11px] font-medium text-brand hover:underline cursor-pointer">
                            Ver detalle
                          </button>
                        ) : (
                          <button type="button" onClick={() => fileInputRef.current?.click()} className="text-[11px] font-medium text-brand hover:underline cursor-pointer">
                            Subir informe
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Modal isOpen={!!detalle} onClose={() => setDetalleId(null)} title={`Detalle — ${detalle?.aseguradora || ""}`}>
        {detalle && (
          <div className="space-y-3">
            <div className="text-[11px] text-ink-muted">
              {detalle.lineas.length} línea{detalle.lineas.length === 1 ? "" : "s"} extraídas del informe.
            </div>
            {detalle.lineas.length === 0 ? (
              <div className="text-[12px] text-ink-subtle text-center py-6">
                Aún no hay líneas. Sube un informe para procesarlas con IA.
              </div>
            ) : (
              <div className="max-h-96 overflow-auto rounded ring-1 ring-border">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-secondary/40 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 font-medium text-ink-subtle">Póliza</th>
                      <th className="px-2 py-1.5 font-medium text-ink-subtle">Tomador</th>
                      <th className="px-2 py-1.5 font-medium text-ink-subtle text-right">Declarado</th>
                      <th className="px-2 py-1.5 font-medium text-ink-subtle text-right">Esperado</th>
                      <th className="px-2 py-1.5 font-medium text-ink-subtle">Match</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {detalle.lineas.map((l: any) => (
                      <tr key={l.id}>
                        <td className="px-2 py-1.5 font-mono">{l.numero_poliza}</td>
                        <td className="px-2 py-1.5 text-ink-muted">{l.tomador || "—"}</td>
                        <td className="px-2 py-1.5 text-right"><MoneyEUR value={Number(l.importe_declarado || 0)} /></td>
                        <td className="px-2 py-1.5 text-right"><MoneyEUR value={Number(l.importe_esperado || 0)} /></td>
                        <td className="px-2 py-1.5">
                          {l.estado_match === "match_exacto" ? (
                            <span className="inline-flex items-center gap-1 text-success">
                              <CheckCircle2 className="size-3" /> OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-warning">
                              <AlertCircle className="size-3" /> Sin póliza
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center gap-2 pt-2">
              <FileSpreadsheet className="size-3.5 text-ink-subtle" />
              <span className="text-[11px] text-ink-subtle">
                Exporta este detalle desde la herramienta de tu navegador (PDF).
              </span>
            </div>
          </div>
        )}
      </Modal>
    </PageShell>
  );
}
