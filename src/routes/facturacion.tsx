import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Plus, FileDown, ChevronDown } from "lucide-react";
import { z } from "zod";
import { PageShell } from "@/components/app/page-shell";
import { Card, KpiCard, MoneyEUR, SectionHeader, StatusBadge, Modal } from "@/components/app/ui-bits";
import { supabase } from "@/lib/supabase";
import { exportarExcel } from "@/lib/exportar";
import {
  exportarFacturasA3,
  exportarFacturasContasol,
  exportarFacturasSage50,
  type FacturaContable,
} from "@/lib/exportar-contable";
import { generarFichaPDF, descargarBlob, imprimirBlob } from "@/lib/generic-pdf";
import { RowActions } from "@/components/app/row-actions";
import { DetailModal } from "@/components/app/detail-modal";
import { Paginador } from "@/components/app/paginador";
import { useDialog } from "@/components/app/dialog-provider";
import { useEffect, useRef, useState } from "react";

const searchSchema = z.object({
  page: z.coerce.number().int().positive().default(1).catch(1),
  pageSize: z.coerce.number().int().positive().default(50).catch(50),
});

export const Route = createFileRoute("/facturacion")({
  component: FacturacionPage,
  head: () => ({ meta: [{ title: "Facturación · Correduría OS" }] }),
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ page: search.page, pageSize: search.pageSize }),
  loader: async ({ deps: { page, pageSize } }) => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data: facturasRaw, error, count } = await supabase
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
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("Error fetching facturas:", error);
      return { facturas: [], total: 0 };
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

    return { facturas, total: count || 0 };
  },
});

function FacturacionPage() {
  const { facturas, total } = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const updateSearch = (patch: Record<string, any>) => {
    router.navigate({ to: "/facturacion", search: (prev: any) => ({ ...prev, ...patch }) });
  };
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

  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [exportMenuOpen]);

  /**
   * Convierte una fecha que llega como locale string (toLocaleDateString) a ISO yyyy-mm-dd.
   * Devuelve cadena vacía si no es parseable.
   */
  const toIsoDate = (s: string): string => {
    if (!s) return "";
    // dd/mm/yyyy o d/m/yyyy
    const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) {
      const [, d, mo, y] = m;
      return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    const t = Date.parse(s);
    if (!isNaN(t)) return new Date(t).toISOString().slice(0, 10);
    return "";
  };

  /**
   * Construye los registros FacturaContable a partir de las facturas cargadas.
   * En correduría la comisión de mediación está EXENTA de IVA (art. 20.Uno.16 LIVA),
   * por lo que tipoIva = 0, cuotaIva = 0 y total = base.
   */
  const buildFacturasContables = (): FacturaContable[] => {
    return facturas.map((f: any): FacturaContable => {
      const total = Number(f.importe || 0);
      return {
        numero: String(f.numero || ""),
        fecha: toIsoDate(f.fechaEmision) || new Date().toISOString().slice(0, 10),
        nif: "",
        nombre: String(f.cliente || ""),
        base: total,
        tipoIva: 0,
        cuotaIva: 0,
        total,
        concepto: f.concepto ? String(f.concepto) : `FRA ${f.numero}`,
      };
    });
  };

  const descargarCSV = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExport = (formato: "a3" | "contasol" | "sage50" | "excel") => {
    setExportMenuOpen(false);
    if (facturas.length === 0) {
      toast("No hay facturas para exportar.", "warning");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    if (formato === "excel") {
      const rows = facturas.map((f: any) => {
        const total = Number(f.importe || 0);
        return {
          Fecha: f.fechaEmision,
          Numero: f.numero,
          Cliente: f.cliente,
          Concepto: f.concepto,
          Base: total,
          "IVA%": 0,
          Cuota_IVA: 0,
          Total: total,
          Cuenta_Cliente: "43000001",
          Cuenta_Venta: "70500000",
        };
      });
      exportarExcel(`facturas_${stamp}.xlsx`, "Facturas", rows);
      return;
    }
    const items = buildFacturasContables();
    if (formato === "a3") {
      descargarCSV(exportarFacturasA3(items), `facturas_a3_${stamp}.csv`);
    } else if (formato === "contasol") {
      descargarCSV(exportarFacturasContasol(items), `facturas_contasol_${stamp}.csv`);
    } else if (formato === "sage50") {
      descargarCSV(exportarFacturasSage50(items), `facturas_sage50_${stamp}.csv`);
    }
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
          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setExportMenuOpen(o => !o)}
              className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer"
            >
              <FileDown className="size-3.5" /> Exportar contabilidad
              <ChevronDown className="size-3" />
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 mt-1 w-56 rounded-md border border-border bg-popover shadow-lg z-50 py-1 text-[12px]">
                <button type="button" onClick={() => handleExport("a3")} className="w-full text-left px-3 py-1.5 hover:bg-secondary cursor-pointer">A3 (CSV)</button>
                <button type="button" onClick={() => handleExport("contasol")} className="w-full text-left px-3 py-1.5 hover:bg-secondary cursor-pointer">Contasol (CSV)</button>
                <button type="button" onClick={() => handleExport("sage50")} className="w-full text-left px-3 py-1.5 hover:bg-secondary cursor-pointer">Sage 50 (CSV)</button>
                <div className="my-1 border-t border-border" />
                <button type="button" onClick={() => handleExport("excel")} className="w-full text-left px-3 py-1.5 hover:bg-secondary cursor-pointer">Excel genérico</button>
              </div>
            )}
          </div>
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
        {total > 0 && (
          <Paginador
            page={search.page}
            pageSize={search.pageSize}
            total={total}
            onChange={(p) => updateSearch({ page: p })}
            onPageSizeChange={(s) => updateSearch({ pageSize: s, page: 1 })}
          />
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
