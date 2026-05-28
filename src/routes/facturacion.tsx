import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Plus, FileDown } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, KpiCard, MoneyEUR, SectionHeader, StatusBadge, Modal } from "@/components/app/ui-bits";
import { supabase } from "@/lib/supabase";
import { exportarExcel } from "@/lib/exportar";
import { generarFichaPDF, descargarBlob, imprimirBlob } from "@/lib/generic-pdf";
import { RowActions } from "@/components/app/row-actions";
import { DetailModal } from "@/components/app/detail-modal";
import { useDialog } from "@/components/app/dialog-provider";
import { useState } from "react";

export const Route = createFileRoute("/facturacion")({
  component: FacturacionPage,
  head: () => ({ meta: [{ title: "Facturación · Correduría OS" }] }),
  loader: async () => {
    // Fetch actual facturas
    const { data: facturasRaw, error } = await supabase
      .from("facturas")
      .select(`
        id, 
        numero_factura, 
        importe_total, 
        fecha_emision,
        fecha_vencimiento,
        estado,
        clientes(nombre_razon_social),
        polizas(numero_poliza)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching facturas:", error);
      return { facturas: [] };
    }

    const facturas = facturasRaw?.map((f: any) => ({
      id: f.id,
      numero: f.numero_factura,
      cliente: f.clientes?.nombre_razon_social || "Desconocido",
      concepto: f.polizas?.numero_poliza ? `Minuta póliza ${f.polizas.numero_poliza}` : "Factura general",
      fechaEmision: f.fecha_emision ? new Date(f.fecha_emision).toLocaleDateString() : "-",
      fechaVencimiento: f.fecha_vencimiento ? new Date(f.fecha_vencimiento).toLocaleDateString() : "-",
      importe: f.importe_total || 0,
      estado: f.estado === "emitida" ? "Emitida" : f.estado === "pagada" ? "Pagada" : f.estado === "vencida" ? "Vencida" : "Anulada",
    })) || [];

    return { facturas };
  },
});

function FacturacionPage() {
  const { facturas } = Route.useLoaderData();
  const router = useRouter();
  const { toast } = useDialog();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    cliente_nombre: "",
    importe: "",
    estado: "emitida"
  });

  const buildFacturaPDF = (f: any): Blob => {
    const total = Number(f.importe || 0);
    const base = +(total / 1.21).toFixed(2);
    const cuota = +(total - base).toFixed(2);
    return generarFichaPDF({
      titulo: `Factura ${f.numero}`,
      subtitulo: `Cliente: ${f.cliente}`,
      bloques: [
        {
          titulo: "Datos de la factura",
          filas: [
            ["Concepto", f.concepto],
            ["Fecha emisión", f.fechaEmision],
            ["Fecha vencimiento", f.fechaVencimiento],
            ["Estado", f.estado],
          ],
        },
        {
          titulo: "Importes",
          filas: [
            ["Base imponible", `${base.toFixed(2)} €`],
            ["IVA (21%)", `${cuota.toFixed(2)} €`],
            ["Total", `${total.toFixed(2)} €`],
          ],
        },
      ],
    });
  };

  const descargarFactura = (f: any) => descargarBlob(buildFacturaPDF(f), `factura_${f.numero}.pdf`);
  const imprimirFactura = (f: any) => imprimirBlob(buildFacturaPDF(f));

  const exportarA3 = () => {
    if (facturas.length === 0) {
      toast("No hay facturas para exportar.", "warning");
      return;
    }
    // Asiento contable estilo A3/Contasol/Sage
    const rows = facturas.map((f: any) => {
      const total = Number(f.importe || 0);
      const base = +(total / 1.21).toFixed(2);
      const cuota = +(total - base).toFixed(2);
      return {
        Fecha: f.fechaEmision,
        Numero: f.numero,
        Cliente: f.cliente,
        Concepto: f.concepto,
        Base: base,
        "IVA%": 21,
        Cuota_IVA: cuota,
        Total: total,
        Cuenta_Cliente: "430000",
        Cuenta_Venta: "705000",
      };
    });
    exportarExcel(
      `facturas_a3_${new Date().toISOString().slice(0, 10)}.xlsx`,
      "Facturas",
      rows
    );
  };

  const emitido = facturas.filter((f: any) => f.estado === "Emitida" || f.estado === "Pagada").reduce((s: any, f: any) => s + f.importe, 0);
  const cobrado = facturas.filter((f: any) => f.estado === "Pagada").reduce((s: any, f: any) => s + f.importe, 0);
  const vencido = facturas.filter((f: any) => f.estado === "Vencida").reduce((s: any, f: any) => s + f.importe, 0);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const nombre = formData.cliente_nombre.trim();
    if (!nombre) { setIsSubmitting(false); return; }

    // Reusar cliente existente si lo hay; si no, crearlo con campos válidos
    const { data: existente } = await supabase
      .from("clientes")
      .select("id")
      .eq("nombre_razon_social", nombre)
      .limit(1)
      .maybeSingle();

    let clienteId = existente?.id as string | undefined;
    if (!clienteId) {
      const { data: created, error: errCli } = await supabase
        .from("clientes")
        .insert({ nombre_razon_social: nombre, tipo: "particular", estado: "Activo" })
        .select("id")
        .single();
      if (errCli) {
        toast("Error al crear cliente: " + errCli.message, "error");
        setIsSubmitting(false);
        return;
      }
      clienteId = created.id;
    }

    const { error } = await supabase.from("facturas").insert({
      cliente_id: clienteId,
      numero_factura: `FAC-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
      concepto: "Factura general",
      importe_total: Number(formData.importe),
      fecha_emision: new Date().toISOString().split('T')[0],
      fecha_vencimiento: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
      estado: formData.estado
    });

    setIsSubmitting(false);
    if (error) {
      toast("Error al guardar factura: " + error.message, "error");
    } else {
      setIsModalOpen(false);
      setFormData({ cliente_nombre: "", importe: "", estado: "emitida" });
      router.invalidate();
    }
  };

  return (
    <PageShell
      title="Facturación"
      subtitle="Emisión de minutas y facturas conectadas a las pólizas firmadas. Exportación a A3, Contasol o Sage."
      action={
        <div className="flex items-center gap-2">
          <button type="button" onClick={exportarA3} className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
            <FileDown className="size-3.5" /> Exportar A3 / Contasol
          </button>
          <button onClick={() => setIsModalOpen(true)} className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 flex items-center gap-1.5 cursor-pointer">
            <Plus className="size-3.5" /> Nueva factura
          </button>
        </div>
      }
    >
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Nueva Factura Manual">
        <form onSubmit={handleManualSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Cliente a facturar</label>
            <input required value={formData.cliente_nombre} onChange={e => setFormData({...formData, cliente_nombre: e.target.value})} type="text" className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" placeholder="Nombre o Razón Social" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Importe total (€)</label>
              <input required value={formData.importe} onChange={e => setFormData({...formData, importe: e.target.value})} type="number" step="0.01" className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Estado inicial</label>
              <select value={formData.estado} onChange={e => setFormData({...formData, estado: e.target.value})} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none">
                <option value="emitida">Emitida</option>
                <option value="pagada">Pagada</option>
                <option value="vencida">Vencida</option>
              </select>
            </div>
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setIsModalOpen(false)} className="text-[12px] font-medium py-1.5 px-4 rounded-md ring-1 ring-border hover:bg-secondary cursor-pointer">Cancelar</button>
            <button type="submit" disabled={isSubmitting} className="text-[12px] font-medium py-1.5 px-4 rounded-md bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50">
              {isSubmitting ? "Guardando..." : "Emitir Factura"}
            </button>
          </div>
        </form>
      </Modal>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <KpiCard label="Emitido mes" value={`${(emitido).toFixed(0)} €`} hint="mayo 2026" />
        <KpiCard label="Cobrado" value={`${cobrado.toFixed(0)} €`} delta={`${emitido > 0 ? Math.round((cobrado / emitido) * 100) : 0}%`} deltaTone="success" />
        <KpiCard label="Vencido" value={`${vencido.toFixed(0)} €`} delta="reclamar" deltaTone="danger" />
        <KpiCard label="Total facturas" value={String(facturas.length)} hint="emitidas en el sistema" />
      </div>

      <SectionHeader
        title="Facturas y minutas"
        hint="Vinculadas a póliza y comisión correspondiente"
      />
      <Card>
        {facturas.length === 0 ? (
          <div className="p-8 text-center text-ink-subtle text-sm">
            No hay facturas registradas. Crea una nueva.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Nº factura</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Cliente</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Concepto</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Emisión</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Vencimiento</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Importe</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {facturas.map((f: any) => {
                const tone = f.estado === "Pagada" ? "success" : f.estado === "Emitida" ? "info" : f.estado === "Vencida" ? "danger" : "neutral";
                return (
                  <tr key={f.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-[11px] font-mono">{f.numero}</td>
                    <td className="px-4 py-3 text-[12.5px] font-medium">{f.cliente}</td>
                    <td className="px-4 py-3 text-[12px] text-ink-muted">{f.concepto}</td>
                    <td className="px-4 py-3 text-[11px] text-ink-muted">{f.fechaEmision}</td>
                    <td className="px-4 py-3 text-[11px] text-ink-muted">{f.fechaVencimiento}</td>
                    <td className="px-4 py-3 text-[12px] font-medium"><MoneyEUR value={f.importe} /></td>
                    <td className="px-4 py-3"><StatusBadge tone={tone as any}>{f.estado}</StatusBadge></td>
                    <td className="px-4 py-3">
                      <RowActions
                        actions={[
                          { icon: "view", label: "Ver datos", onClick: () => setViewing(f), tone: "brand" },
                          { icon: "edit", label: "Editar (próximo)", disabled: true },
                          { icon: "print", label: "Imprimir", onClick: () => imprimirFactura(f) },
                          { icon: "download", label: "Descargar PDF", onClick: () => descargarFactura(f) },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <DetailModal
        isOpen={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `Factura ${viewing.numero}` : ""}
        subtitle={viewing ? `Cliente: ${viewing.cliente}` : undefined}
        rows={viewing ? (() => {
          const total = Number(viewing.importe || 0);
          const base = +(total / 1.21).toFixed(2);
          const cuota = +(total - base).toFixed(2);
          return [
            { label: "Concepto", value: viewing.concepto },
            { label: "Fecha emisión", value: viewing.fechaEmision },
            { label: "Fecha vencimiento", value: viewing.fechaVencimiento },
            { label: "Base imponible", value: <MoneyEUR value={base} /> },
            { label: "IVA (21%)", value: <MoneyEUR value={cuota} /> },
            { label: "Total", value: <strong><MoneyEUR value={total} /></strong> },
            { label: "Estado", value: <StatusBadge tone={viewing.estado === "Pagada" ? "success" : viewing.estado === "Vencida" ? "danger" : "info"}>{viewing.estado}</StatusBadge> },
          ];
        })() : []}
      />
    </PageShell>
  );
}
