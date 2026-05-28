import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Wallet, Calculator, FileDown, Shield } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, KpiCard, MoneyEUR, SectionHeader, StatusBadge } from "@/components/app/ui-bits";
import { RowActions } from "@/components/app/row-actions";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/use-permissions";
import { exportarExcel } from "@/lib/exportar";
import { generarFichaPDF, descargarBlob } from "@/lib/generic-pdf";
import { useDialog } from "@/components/app/dialog-provider";

export const Route = createFileRoute("/liquidaciones")({
  component: LiquidacionesPage,
  head: () => ({ meta: [{ title: "Liquidaciones · Correduría OS" }] }),
  loader: async () => {
    const { data: liquidaciones } = await supabase
      .from("liquidaciones")
      .select(`id, comercial_id, periodo, importe_bruto, importe_neto, retencion, estado, pagada_at, created_at,
               comercial:usuarios!liquidaciones_comercial_id_fkey(nombre, email, iban_cifrado)`)
      .order("periodo", { ascending: false });
    const { data: comerciales } = await supabase
      .from("usuarios").select("id, nombre, email, iban_cifrado")
      .eq("rol", "comercial").eq("activo", true);
    return { liquidaciones: liquidaciones || [], comerciales: comerciales || [] };
  },
});

function LiquidacionesPage() {
  const { liquidaciones, comerciales } = Route.useLoaderData();
  const router = useRouter();
  const { puedeModificarComisiones, loading, esRoot } = usePermissions();
  const { toast, confirm } = useDialog();
  const [busy, setBusy] = useState(false);

  if (loading) return <PageShell title="Liquidaciones"><Card className="p-8 text-[13px] text-center text-ink-subtle">Cargando…</Card></PageShell>;

  if (!esRoot) {
    return (
      <PageShell title="Sin acceso">
        <Card className="p-8 text-center">
          <Shield className="size-8 text-ink-subtle mx-auto mb-3" />
          <p className="text-[13px] text-ink-subtle">Las liquidaciones solo las gestiona root.</p>
        </Card>
      </PageShell>
    );
  }

  const periodo = `${new Date().getFullYear()}-${(new Date().getMonth() + 1).toString().padStart(2, "0")}`;

  const calcularMes = async () => {
    const ok = await confirm({ message: `Generar liquidaciones del periodo ${periodo}?\nSe calculará para cada comercial activo sumando 1/12 de la comisión de cada póliza activa que tenga asignada.`, tone: "brand" });
    if (!ok) return;
    setBusy(true);
    for (const com of comerciales) {
      let importe = 0;

      // Intentar usar la RPC `calcular_liquidacion_comercial` (v0.7) que aplica reglas_comision.
      // Si la función no existe (migración v0.7 pendiente) o devuelve null, caemos al cálculo viejo.
      const { data: rpcData, error: rpcErr } = await supabase
        .rpc("calcular_liquidacion_comercial", { p_comercial_id: com.id });

      if (!rpcErr && rpcData !== null && rpcData !== undefined) {
        importe = Number(rpcData);
      } else {
        // Fallback: cálculo manual 1/12 con comision_importe ó prima * 0.1
        const { data: clientes } = await supabase
          .from("clientes")
          .select("id, polizas(prima_anual, comision_importe, estado)")
          .eq("comercial_asignado_id", com.id);
        importe = (clientes || []).flatMap((c: any) => c.polizas || [])
          .filter((p: any) => p.estado === "activa")
          .reduce((s: number, p: any) => s + Number(p.comision_importe || Number(p.prima_anual) * 0.1) / 12, 0);
      }

      const retencion = 0.15;
      const neto = importe * (1 - retencion);
      await supabase.from("liquidaciones").upsert({
        comercial_id: com.id,
        periodo,
        importe_bruto: importe,
        importe_neto: neto,
        retencion: retencion * 100,
        estado: "borrador",
      }, { onConflict: "comercial_id,periodo" });
    }
    setBusy(false);
    router.invalidate();
    toast(`Liquidaciones del ${periodo} generadas para ${comerciales.length} comercial${comerciales.length === 1 ? "" : "es"}.`, "success");
  };

  const cambiarEstado = async (l: any, nuevo: string) => {
    const patch: any = { estado: nuevo };
    if (nuevo === "pagada") patch.pagada_at = new Date().toISOString();
    await supabase.from("liquidaciones").update(patch).eq("id", l.id);
    router.invalidate();
  };

  const exportarNominas = () => {
    if (liquidaciones.length === 0) { toast("No hay liquidaciones.", "warning"); return; }
    const rows = liquidaciones.map((l: any) => ({
      Periodo: l.periodo,
      Comercial: l.comercial?.nombre || "",
      Email: l.comercial?.email || "",
      IBAN: l.comercial?.iban_cifrado || "",
      "Bruto (€)": Number(l.importe_bruto || 0),
      "Retención (%)": l.retencion,
      "Neto (€)": Number(l.importe_neto || 0),
      Estado: l.estado,
    }));
    exportarExcel(`liquidaciones_${periodo}.xlsx`, "Nóminas", rows);
  };

  const justificantePDF = (l: any) => {
    const blob = generarFichaPDF({
      titulo: `Justificante liquidación ${l.periodo}`,
      subtitulo: l.comercial?.nombre || "",
      bloques: [
        {
          titulo: "Importes",
          filas: [
            ["Periodo", l.periodo],
            ["Bruto", `${Number(l.importe_bruto).toFixed(2)} €`],
            ["Retención", `${l.retencion}%`],
            ["Neto a pagar", `${Number(l.importe_neto).toFixed(2)} €`],
            ["Estado", l.estado],
            ["IBAN", l.comercial?.iban_cifrado || "Sin configurar"],
          ],
        },
      ],
    });
    descargarBlob(blob, `liquidacion_${l.comercial?.nombre?.replace(/\s+/g, "_")}_${l.periodo}.pdf`);
  };

  const totalBruto = liquidaciones.reduce((s: number, l: any) => s + Number(l.importe_bruto || 0), 0);
  const totalNeto = liquidaciones.reduce((s: number, l: any) => s + Number(l.importe_neto || 0), 0);
  const pendientesPago = liquidaciones.filter((l: any) => l.estado === "borrador" || l.estado === "aprobada").length;

  return (
    <PageShell
      title="Liquidaciones de comisiones"
      subtitle="Nómina mensual de comerciales. Cálculo automático y exportable a gestoría."
      action={
        <div className="flex items-center gap-2">
          <button type="button" onClick={exportarNominas} className="text-[12px] py-1.5 px-3 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
            <FileDown className="size-3.5" /> Exportar Excel
          </button>
          {puedeModificarComisiones && (
            <button type="button" onClick={calcularMes} disabled={busy} className="text-[12px] py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
              <Calculator className="size-3.5" /> {busy ? "Calculando…" : `Generar liquidaciones de ${periodo}`}
            </button>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-4 gap-3 mb-6">
        <KpiCard label="Total bruto" value={`${(totalBruto / 1000).toFixed(2)}k €`} hint="acumulado" />
        <KpiCard label="Total neto" value={`${(totalNeto / 1000).toFixed(2)}k €`} hint="a pagar" />
        <KpiCard label="Pendientes pago" value={String(pendientesPago)} delta="por liquidar" deltaTone="warning" />
        <KpiCard label="Comerciales activos" value={String(comerciales.length)} hint="con liquidación posible" />
      </div>

      <Card>
        <div className="px-4 pt-4">
          <SectionHeader
            title={liquidaciones.length === 0 ? "Liquidaciones de comisiones" : `${liquidaciones.length} liquidaci${liquidaciones.length === 1 ? "ón" : "ones"} registrada${liquidaciones.length === 1 ? "" : "s"}`}
            hint={liquidaciones.length === 0 ? `Aún no hay ninguna. Pulsa "Generar liquidaciones de ${periodo}" arriba para crearlas.` : "Cada fila representa la nómina de un comercial en el periodo indicado"}
          />
        </div>
        {liquidaciones.length === 0 ? (
          <div className="p-8 text-center text-[12px] text-ink-subtle">
            No hay liquidaciones registradas todavía.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Periodo</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Comercial</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Bruto</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Retención</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Neto</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {liquidaciones.map((l: any) => (
                <tr key={l.id} className="hover:bg-secondary/30">
                  <td className="px-4 py-3 text-[11px] font-mono">{l.periodo}</td>
                  <td className="px-4 py-3 text-[12.5px] font-medium">{l.comercial?.nombre || "—"}</td>
                  <td className="px-4 py-3 text-[12px]"><MoneyEUR value={Number(l.importe_bruto)} /></td>
                  <td className="px-4 py-3 text-[11.5px] text-ink-muted">{l.retencion}%</td>
                  <td className="px-4 py-3 text-[12px] font-medium"><MoneyEUR value={Number(l.importe_neto)} /></td>
                  <td className="px-4 py-3"><StatusBadge tone={l.estado === "pagada" ? "success" : l.estado === "aprobada" ? "info" : l.estado === "cancelada" ? "danger" : "neutral"}>{l.estado}</StatusBadge></td>
                  <td className="px-4 py-3">
                    <RowActions
                      actions={[
                        { icon: "check", label: l.estado === "borrador" ? "Aprobar" : l.estado === "aprobada" ? "Marcar pagada" : "Completada", disabled: l.estado === "pagada" || l.estado === "cancelada", onClick: () => cambiarEstado(l, l.estado === "borrador" ? "aprobada" : "pagada"), tone: "brand" },
                        { icon: "x", label: "Cancelar", disabled: l.estado === "pagada" || l.estado === "cancelada", onClick: () => cambiarEstado(l, "cancelada"), tone: "danger" },
                        { icon: "download", label: "Descargar justificante PDF", onClick: () => justificantePDF(l) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </PageShell>
  );
}
