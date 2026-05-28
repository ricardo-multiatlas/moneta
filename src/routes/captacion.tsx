import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, KpiCard, MoneyEUR, RamoChip, SectionHeader, StatusBadge, Modal } from "@/components/app/ui-bits";
import { RowActions } from "@/components/app/row-actions";
import { DetailModal } from "@/components/app/detail-modal";
import { supabase } from "@/lib/supabase";
import { generarFichaPDF, descargarBlob, imprimirBlob } from "@/lib/generic-pdf";
import { useDialog } from "@/components/app/dialog-provider";
import { useState } from "react";

export const Route = createFileRoute("/captacion")({
  component: CaptacionPage,
  head: () => ({ meta: [{ title: "Captación · Correduría OS" }] }),
  loader: async () => {
    // Fetch leads from Supabase
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, nombre, origen, interes, comercial_asignado_id, valor_estimado, fecha_contacto, estado, usuarios(nombre)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching leads:", error);
    }

    const adaptedLeads = leads?.map((l: any) => ({
      id: l.id,
      nombre: l.nombre,
      origen: l.origen,
      interes: l.interes,
      comercial: l.usuarios?.nombre || "Sin asignar",
      valorEstimado: Number(l.valor_estimado || 0),
      fechaContacto: l.fecha_contacto ? new Date(l.fecha_contacto).toLocaleDateString() : "-",
      estado: l.estado,
    })) || [];

    // ROI real por canal calculado desde los leads en DB
    const porCanal = new Map<string, { canal: string; leads: number; ganados: number; valorTotal: number }>();
    adaptedLeads.forEach((l: any) => {
      const k = l.origen || "Sin origen";
      const row = porCanal.get(k) || { canal: k, leads: 0, ganados: 0, valorTotal: 0 };
      row.leads += 1;
      if (l.estado === "Ganado") {
        row.ganados += 1;
        row.valorTotal += l.valorEstimado;
      }
      porCanal.set(k, row);
    });
    const canalesCaptacion = Array.from(porCanal.values()).map((r) => ({
      canal: r.canal,
      leads: r.leads,
      conversion: r.leads > 0 ? r.ganados / r.leads : 0,
      valorMedio: r.ganados > 0 ? r.valorTotal / r.ganados : 0,
    }));

    return { leads: adaptedLeads, canalesCaptacion };
  },
});

const ESTADOS = ["Nuevo", "Cualificado", "Propuesta", "Negociación", "Ganado"] as const;

function CaptacionPage() {
  const { leads, canalesCaptacion } = Route.useLoaderData();
  const router = useRouter();
  const { toast, confirm } = useDialog();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    nombre: "",
    origen: "Web SEO",
    interes: "Auto",
    valor_estimado: ""
  });

  const ganados = leads.filter((l: any) => l.estado === "Ganado");
  const totalGanado = ganados.reduce((s: any, l: any) => s + l.valorEstimado, 0);
  const activos = leads.filter((l: any) => !["Ganado", "Perdido"].includes(l.estado));
  const conversion = ganados.length / (leads.length || 1);

  const buildLeadPDF = (l: any): Blob =>
    generarFichaPDF({
      titulo: `Lead: ${l.nombre}`,
      subtitulo: `${l.origen} · Interés ${l.interes}`,
      bloques: [
        {
          titulo: "Información",
          filas: [
            ["Estado", l.estado],
            ["Comercial", l.comercial],
            ["Valor estimado prima", `${Number(l.valorEstimado || 0).toFixed(2)} €`],
            ["Primer contacto", l.fechaContacto],
          ],
        },
      ],
    });

  const descargarLeadPDF = (l: any) => descargarBlob(buildLeadPDF(l), `lead_${l.nombre.replace(/\s+/g, "_")}.pdf`);
  const imprimirLeadPDF = (l: any) => imprimirBlob(buildLeadPDF(l));

  const eliminarLead = async (l: any) => {
    const ok = await confirm({ message: `¿Eliminar lead "${l.nombre}"?`, tone: "danger" });
    if (!ok) return;
    const { error } = await supabase.from("leads").delete().eq("id", l.id);
    if (error) toast("Error: " + error.message, "error");
    else router.invalidate();
  };

  const avanzarLead = async (l: any) => {
    const flow: Record<string, string> = {
      Nuevo: "Cualificado",
      Cualificado: "Propuesta",
      Propuesta: "Negociación",
      Negociación: "Ganado",
    };
    if (l.estado === "Ganado") {
      const ok = await confirm({ message: `"${l.nombre}" ya está Ganado.\n¿Crear ficha de cliente a partir de este lead?`, tone: "brand" });
      if (!ok) return;

      // ¿Ya estaba asociado a un cliente?
      const { data: leadFull } = await supabase
        .from("leads")
        .select("cliente_convertido_id")
        .eq("id", l.id)
        .maybeSingle();
      if (leadFull?.cliente_convertido_id) {
        router.navigate({ to: "/clientes/$id", params: { id: leadFull.cliente_convertido_id } });
        return;
      }

      // ¿Existe ya un cliente con ese nombre?
      const { data: existente } = await supabase
        .from("clientes")
        .select("id")
        .eq("nombre_razon_social", l.nombre)
        .limit(1)
        .maybeSingle();

      let clienteId = existente?.id as string | undefined;
      if (!clienteId) {
        const { data: creado, error } = await supabase
          .from("clientes")
          .insert({ nombre_razon_social: l.nombre, tipo: "particular", estado: "Activo" })
          .select("id")
          .single();
        if (error) { toast("Error: " + error.message, "error"); return; }
        clienteId = creado.id;
      }

      // Asociar trazabilidad
      await supabase.from("leads").update({ cliente_convertido_id: clienteId }).eq("id", l.id);
      router.navigate({ to: "/clientes/$id", params: { id: clienteId! } });
      return;
    }
    const next = flow[l.estado];
    if (!next) return;
    const ok = await confirm({ message: `Avanzar "${l.nombre}" de ${l.estado} → ${next}?`, tone: "brand" });
    if (!ok) return;
    const { error } = await supabase.from("leads").update({ estado: next }).eq("id", l.id);
    if (error) { toast("Error: " + error.message, "error"); return; }
    router.invalidate();
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const { error } = await supabase.from("leads").insert({
      nombre: formData.nombre,
      origen: formData.origen,
      interes: formData.interes,
      valor_estimado: Number(formData.valor_estimado) || 0,
      fecha_contacto: new Date().toISOString(),
      estado: "Nuevo"
    });

    if (!error) {
      setIsModalOpen(false);
      setFormData({ nombre: "", origen: "Web SEO", interes: "Auto", valor_estimado: "" });
      router.invalidate();
    } else {
      toast("Error al guardar lead: " + error.message, "error");
    }
    
    setIsSubmitting(false);
  };

  return (
    <PageShell
      title="Captación"
      subtitle="Trazabilidad del lead desde su origen hasta póliza firmada. ROI por canal, conversión por comercial."
      action={
        <button onClick={() => setIsModalOpen(true)} className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 flex items-center gap-1.5 cursor-pointer">
          <Plus className="size-3.5" /> Nuevo lead
        </button>
      }
    >
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Nuevo Lead">
        <form onSubmit={handleManualSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Nombre del prospecto</label>
            <input required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} type="text" className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Origen</label>
              <select value={formData.origen} onChange={e => setFormData({...formData, origen: e.target.value})} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none">
                <option value="Web SEO">Web SEO</option>
                <option value="Campaña LinkedIn">Campaña LinkedIn</option>
                <option value="Referidos">Referidos</option>
                <option value="Puerta fría">Puerta fría</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Ramo de Interés</label>
              <select value={formData.interes} onChange={e => setFormData({...formData, interes: e.target.value})} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none">
                <option value="Auto">Auto</option>
                <option value="Hogar">Hogar</option>
                <option value="Vida">Vida</option>
                <option value="Salud">Salud</option>
                <option value="Comercio">Comercio</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Valor estimado prima (€)</label>
            <input required value={formData.valor_estimado} onChange={e => setFormData({...formData, valor_estimado: e.target.value})} type="number" className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setIsModalOpen(false)} className="text-[12px] font-medium py-1.5 px-4 rounded-md ring-1 ring-border hover:bg-secondary cursor-pointer">Cancelar</button>
            <button type="submit" disabled={isSubmitting} className="text-[12px] font-medium py-1.5 px-4 rounded-md bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50">
              {isSubmitting ? "Guardando..." : "Crear Lead"}
            </button>
          </div>
        </form>
      </Modal>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <KpiCard label="Leads activos" value={String(activos.length)} hint="en pipeline" />
        <KpiCard label="Ganados" value={String(ganados.length)} delta={`${(conversion * 100).toFixed(0)}% conv.`} deltaTone="success" />
        <KpiCard label="Valor ganado" value={`${(totalGanado).toFixed(0)} €`} hint="prima nueva anual" />
        <KpiCard label="Pipeline total" value={String(leads.length)} hint="todos los leads" />
      </div>

      <div className="grid grid-cols-12 gap-6 mb-8">
        <div className="col-span-12 lg:col-span-8">
          <SectionHeader title="Pipeline de oportunidades" hint="Click en un lead para avanzar etapa o convertirlo a cliente" />
          <div className="grid grid-cols-5 gap-2">
            {ESTADOS.map((estado) => {
              const items = leads.filter((l: any) => l.estado === estado);
              return (
                <div key={estado} className="bg-secondary/50 rounded-md p-2 min-h-[280px]">
                  <div className="flex items-center justify-between px-1 py-1.5 mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">{estado}</span>
                    <span className="text-[10px] font-mono text-ink-subtle">{items.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {items.map((l: any) => (
                      <div
                        key={l.id}
                        className="bg-surface rounded p-2.5 ring-1 ring-border hover:ring-brand/30 cursor-pointer transition-all"
                        onClick={() => avanzarLead(l)}
                      >
                        <div className="text-[11.5px] font-medium leading-tight">{l.nombre}</div>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <RamoChip ramo={l.interes} />
                        </div>
                        <div className="text-[10px] text-ink-subtle mt-1.5 flex items-center justify-between">
                          <span>{l.origen}</span>
                          <span className="font-mono"><MoneyEUR value={l.valorEstimado} /></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="col-span-12 lg:col-span-4 space-y-5">
          <Card className="p-5">
            <SectionHeader title="ROI por canal" hint="Calculado desde tus leads" />
            {canalesCaptacion.length === 0 ? (
              <div className="text-[12px] text-ink-subtle text-center py-6">
                Aún no hay leads para calcular ROI por canal.
              </div>
            ) : (
              <div className="space-y-4">
                {canalesCaptacion.map((c: any) => (
                  <div key={c.canal}>
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="font-medium">{c.canal}</span>
                      <span className="font-mono text-[11px] text-ink-muted">
                        {c.leads} leads · <MoneyEUR value={c.valorMedio} />
                      </span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand transition-all"
                        data-conv={Math.round(c.conversion * 100)}
                        style={{ width: `${c.conversion * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-ink-subtle">Conv. {Math.round(c.conversion * 100)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </aside>
      </div>

      <SectionHeader title="Todos los leads" />
      <Card>
        {leads.length === 0 ? (
          <div className="p-8 text-center text-ink-subtle text-sm">
            No hay leads registrados. Haz clic en "Nuevo lead".
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Lead</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Origen</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Interés</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Comercial</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Valor</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Contacto</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leads.map((l: any) => {
                const tone = l.estado === "Ganado" ? "success" : l.estado === "Perdido" ? "danger" : l.estado === "Negociación" ? "warning" : "info";
                return (
                  <tr key={l.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-[12.5px] font-medium">{l.nombre}</td>
                    <td className="px-4 py-3 text-[11.5px] text-ink-muted">{l.origen}</td>
                    <td className="px-4 py-3"><RamoChip ramo={l.interes} /></td>
                    <td className="px-4 py-3 text-[11.5px] text-ink-muted">{l.comercial}</td>
                    <td className="px-4 py-3 text-[12px]"><MoneyEUR value={l.valorEstimado} /></td>
                    <td className="px-4 py-3 text-[11px] text-ink-muted">{l.fechaContacto}</td>
                    <td className="px-4 py-3"><StatusBadge tone={tone as any}>{l.estado}</StatusBadge></td>
                    <td className="px-4 py-3">
                      <RowActions
                        actions={[
                          { icon: "view", label: "Ver datos", onClick: () => setViewing(l), tone: "brand" },
                          { icon: "edit", label: l.estado === "Ganado" ? "Convertir a cliente" : "Avanzar etapa", onClick: () => avanzarLead(l) },
                          { icon: "print", label: "Imprimir", onClick: () => imprimirLeadPDF(l) },
                          { icon: "download", label: "Descargar PDF", onClick: () => descargarLeadPDF(l) },
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
        title={viewing?.nombre || ""}
        subtitle={viewing ? `${viewing.origen} · Interés ${viewing.interes}` : undefined}
        rows={viewing ? [
          { label: "Origen", value: viewing.origen },
          { label: "Ramo de interés", value: <RamoChip ramo={viewing.interes} /> },
          { label: "Comercial", value: viewing.comercial },
          { label: "Valor estimado prima", value: <MoneyEUR value={Number(viewing.valorEstimado || 0)} /> },
          { label: "Primer contacto", value: viewing.fechaContacto },
          { label: "Estado", value: <StatusBadge tone={viewing.estado === "Ganado" ? "success" : viewing.estado === "Perdido" ? "danger" : "info"}>{viewing.estado}</StatusBadge> },
        ] : []}
      />
    </PageShell>
  );
}
