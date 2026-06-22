import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Upload, Plus, Sparkles, Loader2 } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, MoneyEUR, RamoChip, StatusBadge, Modal } from "@/components/app/ui-bits";
import { supabase } from "@/lib/supabase";
import { generarPolizaPDF, subirPolizaPDF } from "@/lib/polizas-pdf";
import { descargarBlob, imprimirBlob } from "@/lib/generic-pdf";
import { RowActions } from "@/components/app/row-actions";
import { DetailModal } from "@/components/app/detail-modal";
import { Paginador } from "@/components/app/paginador";
import { useDialog } from "@/components/app/dialog-provider";
import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { mistral } from "@ai-sdk/mistral";
import { z } from "zod";
import { useState, useRef, useEffect } from "react";

// Server function for AI Extraction
export const extractPolicyFn = createServerFn({ method: "POST" })
  .inputValidator((d: { pdfBase64: string }) => d)
  .handler(async ({ data }) => {
    try {
      if (!process.env.MISTRAL_API_KEY) {
        return { success: false as const, error: "MISTRAL_API_KEY no configurada — IA deshabilitada temporalmente" };
      }
      const result = await generateObject({
        model: mistral("mistral-medium-latest"),
        schema: z.object({
          numero_poliza: z.string().describe("Número identificador de la póliza"),
          aseguradora: z.string().describe("Nombre de la compañía aseguradora (ej. Mapfre, Allianz)"),
          ramo: z.string().describe("Ramo del seguro (ej. Auto, Hogar, Vida, Salud)"),
          prima_anual: z.number().describe("Importe total anual de la prima en euros sin moneda"),
          fecha_vencimiento: z.string().describe("Fecha de vencimiento en formato YYYY-MM-DD"),
          cliente_nombre: z.string().describe("Nombre completo o Razón Social del Tomador"),
          cliente_nif: z.string().describe("NIF/CIF del Tomador"),
        }),
        messages: [
          {
            role: "system",
            content: "Responde en espanol. La respuesta debe ser un JSON valido segun el schema indicado.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extrae los datos principales de esta póliza de seguros." },
              { type: "file", data: data.pdfBase64, mediaType: "application/pdf" }
            ]
          }
        ]
      });

      return { success: true as const, data: result.object };
    } catch (error: any) {
      console.error("AI Extraction Error:", error);
      return { success: false as const, error: error.message as string };
    }
  });

const polizasSearchSchema = z.object({
  nueva: z.enum(["manual"]).optional(),
  page: z.coerce.number().int().positive().default(1).catch(1),
  pageSize: z.coerce.number().int().positive().default(50).catch(50),
  q: z.string().optional().catch(undefined),
  estado: z.enum(["", "activa", "cancelada", "renovacion"]).default("").catch(""),
});

export const Route = createFileRoute("/polizas")({
  component: PolizasPage,
  head: () => ({ meta: [{ title: "Pólizas · Correduría OS" }] }),
  validateSearch: polizasSearchSchema,
  loaderDeps: ({ search }) => ({ page: search.page, pageSize: search.pageSize, q: search.q, estado: search.estado }),
  loader: async ({ deps: { page, pageSize, q, estado } }) => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = supabase
      .from("polizas")
      .select(`
        id, cliente_id, numero_poliza, ramo, aseguradora, prima_anual, comision_importe,
        fecha_inicio, fecha_vencimiento, estado, pdf_url,
        clientes(nombre_razon_social, nif_cif, email, telefono)
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (q && q.trim()) {
      const term = q.trim();
      query = query.or(`numero_poliza.ilike.%${term}%,aseguradora.ilike.%${term}%,ramo.ilike.%${term}%`);
    }
    if (estado) query = query.eq("estado", estado);

    const { data: polizas, error, count } = await query;
    if (error) return { polizas: [], total: 0 };

    const adaptedPolizas = polizas?.map((p: any) => ({
      id: p.id,
      numero: p.numero_poliza,
      cliente: p.clientes?.nombre_razon_social || "Desconocido",
      cliente_id: p.cliente_id,
      cliente_nif: p.clientes?.nif_cif,
      cliente_email: p.clientes?.email,
      cliente_telefono: p.clientes?.telefono,
      ramo: p.ramo,
      aseguradora: p.aseguradora,
      prima: p.prima_anual,
      comision: p.comision_importe || (p.prima_anual * 0.1),
      vencimiento: p.fecha_vencimiento ? new Date(p.fecha_vencimiento).toLocaleDateString() : "-",
      fecha_inicio: p.fecha_inicio,
      fecha_vencimiento_raw: p.fecha_vencimiento,
      pdf_url: p.pdf_url,
      estado: p.estado === "activa" ? "Vigente" : p.estado === "cancelada" ? "Anulada" : "En renovación",
    })) || [];

    return { polizas: adaptedPolizas, total: count || 0 };
  },
});

function PolizasPage() {
  const { polizas, total } = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const updateSearch = (patch: Record<string, any>) => {
    router.navigate({ to: "/polizas", search: (prev: any) => ({ ...prev, ...patch }) });
  };
  const { toast, confirm } = useDialog();
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);

  // Abrir modal automáticamente si llega ?nueva=manual desde el topbar
  useEffect(() => {
    if (search.nueva === "manual") {
      setIsModalOpen(true);
      router.navigate({ to: "/polizas", search: {}, replace: true });
    }
  }, [search.nueva, router]);

  const buildPDFFor = (p: any): Blob => {
    return generarPolizaPDF({
      numero_poliza: p.numero,
      ramo: p.ramo,
      aseguradora: p.aseguradora,
      prima_anual: Number(p.prima),
      fecha_inicio: p.fecha_inicio,
      fecha_vencimiento: p.fecha_vencimiento_raw,
      cliente_nombre: p.cliente,
      cliente_nif: p.cliente_nif,
      cliente_email: p.cliente_email,
      cliente_telefono: p.cliente_telefono,
    });
  };

  const descargarPDF = (p: any) => {
    if (p.pdf_url) {
      window.open(p.pdf_url, "_blank", "noopener,noreferrer");
    } else {
      descargarBlob(buildPDFFor(p), `poliza_${p.numero}.pdf`);
    }
  };

  const imprimirPDF = (p: any) => {
    if (p.pdf_url) {
      const w = window.open(p.pdf_url, "_blank");
      if (w) w.addEventListener("load", () => w.print(), { once: true });
    } else {
      imprimirBlob(buildPDFFor(p));
    }
  };
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    cliente_nombre: "",
    numero_poliza: "",
    aseguradora: "",
    ramo: "Auto",
    prima_anual: "",
    fecha_vencimiento: ""
  });

  const ensureCliente = async (nombre: string) => {
    const trimmed = nombre.trim();
    if (!trimmed) return null;
    const { data: existing } = await supabase
      .from("clientes")
      .select("id")
      .eq("nombre_razon_social", trimmed)
      .limit(1)
      .maybeSingle();
    if (existing?.id) return existing.id as string;

    const { data: created, error } = await supabase
      .from("clientes")
      .insert({
        nombre_razon_social: trimmed,
        tipo: "particular",
        estado: "Activo",
      })
      .select("id")
      .single();
    if (error) {
      toast("Error creando cliente: " + error.message, "error");
      return null;
    }
    return created.id as string;
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const clienteId = await ensureCliente(formData.cliente_nombre);
    if (!clienteId) { setIsSubmitting(false); return; }

    const fecha_inicio = new Date().toISOString().split("T")[0];
    const fecha_vencimiento = formData.fecha_vencimiento || fecha_inicio;

    const { data: nueva, error } = await supabase
      .from("polizas")
      .insert({
        cliente_id: clienteId,
        numero_poliza: formData.numero_poliza,
        ramo: formData.ramo,
        aseguradora: formData.aseguradora,
        prima_anual: Number(formData.prima_anual),
        fecha_inicio,
        fecha_vencimiento,
        estado: "activa",
      })
      .select("id")
      .single();

    if (error || !nueva) {
      setIsSubmitting(false);
      toast("Error al guardar póliza: " + error?.message, "error");
      return;
    }

    // Generar PDF de la póliza y subirlo a Storage
    try {
      const { data: cli } = await supabase
        .from("clientes")
        .select("nombre_razon_social, nif_cif, email, telefono")
        .eq("id", clienteId)
        .maybeSingle();

      const blob = generarPolizaPDF({
        numero_poliza: formData.numero_poliza,
        ramo: formData.ramo,
        aseguradora: formData.aseguradora,
        prima_anual: Number(formData.prima_anual),
        fecha_inicio,
        fecha_vencimiento,
        cliente_nombre: cli?.nombre_razon_social || formData.cliente_nombre,
        cliente_nif: cli?.nif_cif,
        cliente_email: cli?.email,
        cliente_telefono: cli?.telefono,
      });
      const url = await subirPolizaPDF(nueva.id, blob, `poliza_${formData.numero_poliza}.pdf`);
      if (url) {
        await supabase.from("polizas").update({ pdf_url: url }).eq("id", nueva.id);
      }
    } catch (pdfErr) {
      console.warn("PDF de póliza no se pudo generar/subir:", pdfErr);
    }

    setIsSubmitting(false);
    setIsModalOpen(false);
    setFormData({ cliente_nombre: "", numero_poliza: "", aseguradora: "", ramo: "Auto", prima_anual: "", fecha_vencimiento: "" });
    router.invalidate();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Str = (reader.result as string).split(",")[1];

        const response = await extractPolicyFn({ data: { pdfBase64: base64Str } });

        if (!response.success || !response.data) {
          toast("Error al extraer los datos: " + response.error, "error");
          setIsExtracting(false);
          return;
        }

        const { cliente_nombre, cliente_nif, numero_poliza, aseguradora, ramo, prima_anual, fecha_vencimiento } = response.data;
        const fecha_inicio = new Date().toISOString().split("T")[0];
        const fecha_venc = fecha_vencimiento || fecha_inicio;

        // 1. ensureCliente (reusar si existe)
        const clienteId = await ensureCliente(cliente_nombre);
        if (!clienteId) { setIsExtracting(false); return; }

        // 1b. completar NIF si lo extrajo la IA y no estaba
        if (cliente_nif) {
          await supabase.from("clientes").update({ nif_cif: cliente_nif }).eq("id", clienteId);
        }

        // 2. Insertar la póliza
        const { data: nueva, error: errPol } = await supabase
          .from("polizas")
          .insert({
            cliente_id: clienteId,
            numero_poliza,
            ramo,
            aseguradora,
            prima_anual,
            fecha_inicio,
            fecha_vencimiento: fecha_venc,
            estado: "activa",
            datos_extraidos: response.data,
          })
          .select("id")
          .single();

        if (errPol || !nueva) {
          toast("Error guardando póliza: " + errPol?.message, "error");
          setIsExtracting(false);
          return;
        }

        // 3. Subir el PDF original a Storage y persistir url
        try {
          const url = await subirPolizaPDF(nueva.id, file, `${numero_poliza}_original.pdf`);
          if (url) {
            await supabase.from("polizas").update({ pdf_url: url }).eq("id", nueva.id);
          }
        } catch (e) {
          console.warn("No se pudo subir el PDF original:", e);
        }

        await confirm({
          title: "Póliza guardada",
          message: `Aseguradora: ${aseguradora}\nCliente: ${cliente_nombre}\nPrima: ${prima_anual}€\n\nEl PDF original quedó almacenado y vinculado a la póliza.`,
          confirmLabel: "OK",
          cancelLabel: "Cerrar",
          tone: "brand",
        });
        router.invalidate();
        setIsExtracting(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error(error);
      setIsExtracting(false);
      toast("Error procesando el archivo PDF", "error");
    }
  };

  return (
    <PageShell
      title="Pólizas"
      subtitle="Sube el PDF de la aseguradora y la IA extrae los datos en segundos. Histórico completo de modificaciones y anexos."
      action={
        <div className="flex items-center gap-2">
          <button className="text-[12px] font-medium py-1.5 px-3 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <Upload className="size-3.5" /> Subir PDF aseguradora
          </button>
          <button onClick={() => setIsModalOpen(true)} className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 flex items-center gap-1.5 cursor-pointer">
            <Plus className="size-3.5" /> Alta manual
          </button>
        </div>
      }
    >
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Alta manual de póliza">
        <form onSubmit={handleManualSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Nombre del Cliente / Tomador</label>
            <input required value={formData.cliente_nombre} onChange={e => setFormData({...formData, cliente_nombre: e.target.value})} type="text" className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" placeholder="Ej. Juan Pérez" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Nº Póliza</label>
              <input required value={formData.numero_poliza} onChange={e => setFormData({...formData, numero_poliza: e.target.value})} type="text" className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Aseguradora</label>
              <input required value={formData.aseguradora} onChange={e => setFormData({...formData, aseguradora: e.target.value})} type="text" className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" placeholder="Ej. Mapfre" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Ramo</label>
              <select value={formData.ramo} onChange={e => setFormData({...formData, ramo: e.target.value})} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none">
                <option value="Auto">Auto</option>
                <option value="Hogar">Hogar</option>
                <option value="Vida">Vida</option>
                <option value="Salud">Salud</option>
                <option value="RC">RC</option>
                <option value="Comercio">Comercio</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Prima (€)</label>
              <input required value={formData.prima_anual} onChange={e => setFormData({...formData, prima_anual: e.target.value})} type="number" step="0.01" className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Vencimiento</label>
              <input required value={formData.fecha_vencimiento} onChange={e => setFormData({...formData, fecha_vencimiento: e.target.value})} type="date" className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setIsModalOpen(false)} className="text-[12px] font-medium py-1.5 px-4 rounded-md ring-1 ring-border hover:bg-secondary cursor-pointer">Cancelar</button>
            <button type="submit" disabled={isSubmitting} className="text-[12px] font-medium py-1.5 px-4 rounded-md bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50">
              {isSubmitting ? "Guardando..." : "Guardar Póliza"}
            </button>
          </div>
        </form>
      </Modal>

      <input type="file" ref={fileInputRef} className="hidden" accept="application/pdf" onChange={handleFileUpload} />

      <Card className="p-4 mb-6 border-dashed border-2 border-brand/20 bg-brand-soft/30">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-md bg-brand text-brand-foreground grid place-items-center">
            {isExtracting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          </div>
          <div className="flex-1">
            <div className="text-[13px] font-medium">Alta de póliza con IA en 2 minutos</div>
            <div className="text-[11.5px] text-ink-muted mt-0.5">
              Arrastra el PDF de Mapfre, Allianz, Axa o cualquier aseguradora. Extraemos tomador, asegurado, garantías, primas y vencimiento.
            </div>
          </div>
          <button 
            disabled={isExtracting}
            onClick={() => fileInputRef.current?.click()}
            className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-foreground text-background cursor-pointer disabled:opacity-50"
          >
            {isExtracting ? "Analizando PDF..." : "Seleccionar archivo"}
          </button>
        </div>
      </Card>

      <Card>
        {polizas.length === 0 ? (
          <div className="p-8 text-center text-ink-subtle text-sm">
            No hay pólizas registradas. Sube un PDF o crea una póliza manual.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Nº póliza</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Cliente</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Ramo</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Aseguradora</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Prima</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Comisión</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Vencimiento</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {polizas.map((p: any) => {
                const tone = p.estado === "Vigente" ? "success" : p.estado === "En renovación" ? "warning" : p.estado === "Pendiente firma" ? "info" : "neutral";
                return (
                  <tr key={p.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-[11px] font-mono">{p.numero}</td>
                    <td className="px-4 py-3 text-[12.5px] font-medium">{p.cliente}</td>
                    <td className="px-4 py-3"><RamoChip ramo={p.ramo} /></td>
                    <td className="px-4 py-3 text-[12px] text-ink-muted">{p.aseguradora}</td>
                    <td className="px-4 py-3 text-[12px]"><MoneyEUR value={p.prima} /></td>
                    <td className="px-4 py-3 text-[12px] text-ink-muted"><MoneyEUR value={p.comision} /></td>
                    <td className="px-4 py-3 text-[11px] font-mono text-ink-muted">{p.vencimiento}</td>
                    <td className="px-4 py-3"><StatusBadge tone={tone as any}>{p.estado}</StatusBadge></td>
                    <td className="px-4 py-3">
                      <RowActions
                        actions={[
                          { icon: "view", label: "Ver datos", onClick: () => setViewing(p), tone: "brand" },
                          { icon: "edit", label: "Editar (abrir ficha)", onClick: () => { window.location.href = `/polizas/${p.id}`; } },
                          { icon: "print", label: "Imprimir póliza", onClick: () => imprimirPDF(p) },
                          { icon: "download", label: "Descargar PDF", onClick: () => descargarPDF(p) },
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
        title={viewing ? `Póliza ${viewing.numero}` : ""}
        subtitle={viewing ? `${viewing.ramo} · ${viewing.aseguradora}` : undefined}
        rows={viewing ? [
          { label: "Cliente", value: viewing.cliente },
          { label: "NIF/CIF", value: viewing.cliente_nif || "—" },
          { label: "Ramo", value: <RamoChip ramo={viewing.ramo} /> },
          { label: "Aseguradora", value: viewing.aseguradora },
          { label: "Prima anual", value: <MoneyEUR value={Number(viewing.prima)} /> },
          { label: "Comisión", value: <MoneyEUR value={Number(viewing.comision)} /> },
          { label: "Fecha inicio", value: viewing.fecha_inicio ? new Date(viewing.fecha_inicio).toLocaleDateString() : "—" },
          { label: "Fecha vencimiento", value: viewing.vencimiento },
          { label: "Estado", value: <StatusBadge tone={viewing.estado === "Vigente" ? "success" : "neutral"}>{viewing.estado}</StatusBadge> },
          { label: "PDF archivado", value: viewing.pdf_url ? "Sí" : "No" },
        ] : []}
        fullViewTo="/polizas/$id"
        fullViewParams={viewing ? { id: viewing.id } : undefined}
      />
    </PageShell>
  );
}
