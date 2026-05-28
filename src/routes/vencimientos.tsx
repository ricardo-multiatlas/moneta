import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { Mail, MessageSquare, CheckCircle2, CalendarDays } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, KpiCard, MoneyEUR, RamoChip, SectionHeader } from "@/components/app/ui-bits";
import { RowActions } from "@/components/app/row-actions";
import { DetailModal } from "@/components/app/detail-modal";
import { supabase } from "@/lib/supabase";
import { useState } from "react";
import { generarFichaPDF, descargarBlob, imprimirBlob } from "@/lib/generic-pdf";
import { useDialog } from "@/components/app/dialog-provider";

export const Route = createFileRoute("/vencimientos")({
  component: VencimientosPage,
  head: () => ({ meta: [{ title: "Vencimientos · Correduría OS" }] }),
  loader: async () => {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + 60);

    const { data: vencimientosData, error } = await supabase
      .from("vencimientos")
      .select(`
        id,
        fecha_vencimiento,
        estado,
        polizas(
          id,
          numero_poliza,
          ramo,
          aseguradora,
          prima_anual,
          fecha_inicio,
          fecha_vencimiento,
          pdf_url,
          usuarios(nombre),
          clientes(nombre_razon_social, nif_cif, email, telefono)
        )
      `)
      .gte("fecha_vencimiento", today.toISOString().split("T")[0])
      .lte("fecha_vencimiento", futureDate.toISOString().split("T")[0])
      .order("fecha_vencimiento", { ascending: true });

    if (error) {
      console.error("Error fetching vencimientos:", error);
      return { vencimientos: [] };
    }

    const adaptedVencimientos = vencimientosData?.map((v: any) => {
      const vDate = new Date(v.fecha_vencimiento);
      const diffTime = Math.abs(vDate.getTime() - today.getTime());
      const diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const p = v.polizas || {};
      return {
        id: v.id,
        polizaId: p.id || null,
        diasRestantes,
        fechaVencimiento: v.fecha_vencimiento,
        cliente: p.clientes?.nombre_razon_social || "Desconocido",
        ramo: p.ramo || "-",
        aseguradora: p.aseguradora || "-",
        numeroPoliza: p.numero_poliza || "-",
        comercial: p.usuarios?.nombre || "Sin asignar",
        prima: p.prima_anual || 0,
        estadoAviso: v.estado === "pendiente" ? "No avisado" : v.estado === "avisado" ? "Aviso enviado" : "Renovado",
        estadoDB: v.estado,
      };
    }) || [];

    return { vencimientos: adaptedVencimientos };
  },
});

function VencimientosPage() {
  const { vencimientos } = Route.useLoaderData();
  const router = useRouter();
  const { toast, confirm } = useDialog();
  const [viewing, setViewing] = useState<any | null>(null);

  const criticos = vencimientos.filter((v: any) => v.diasRestantes <= 7);
  const proximos = vencimientos.filter((v: any) => v.diasRestantes > 7 && v.diasRestantes <= 30);
  const futuros = vencimientos.filter((v: any) => v.diasRestantes > 30);
  const avisados = vencimientos.filter((v: any) => v.estadoDB === "avisado");

  const buildVencimientoPDF = (v: any): Blob =>
    generarFichaPDF({
      titulo: `Aviso de vencimiento`,
      subtitulo: `Póliza ${v.numeroPoliza} · ${v.cliente}`,
      bloques: [
        {
          titulo: "Datos",
          filas: [
            ["Ramo", v.ramo],
            ["Aseguradora", v.aseguradora],
            ["Fecha vencimiento", v.fechaVencimiento],
            ["Días restantes", v.diasRestantes],
            ["Prima anual", `${Number(v.prima || 0).toFixed(2)} €`],
            ["Comercial responsable", v.comercial],
            ["Estado del aviso", v.estadoAviso],
          ],
        },
      ],
    });
  const descargarVenc = (v: any) => descargarBlob(buildVencimientoPDF(v), `vencimiento_${v.numeroPoliza}.pdf`);
  const imprimirVenc = (v: any) => imprimirBlob(buildVencimientoPDF(v));

  const enviarEmailReal = async (ids: string[]) => {
    const { data, error } = await supabase.functions.invoke("enviar-aviso-vencimiento", {
      body: { ids },
    });
    if (error) {
      // Fallback: si la Edge Function no está desplegada, marcamos local
      const ok = await confirm({
        message: `La función de envío no está desplegada aún (${error.message}).\n¿Marcar como avisado de todas formas?`,
        tone: "brand",
      });
      if (ok) {
        await supabase.from("vencimientos").update({ estado: "avisado" }).in("id", ids);
        router.invalidate();
      }
      return null;
    }
    router.invalidate();
    return data;
  };

  const marcarAvisado = async (id: string) => {
    const res = await enviarEmailReal([id]);
    if (res) toast(`${res.enviados} email(s) enviados`, "success");
  };

  const marcarRenovado = async (id: string, cliente: string) => {
    const confirmed = await confirm({ message: `¿Marcar la póliza de ${cliente} como RENOVADA?`, tone: "brand" });
    if (confirmed) {
      await supabase.from("vencimientos").update({ estado: "renovado" }).eq("id", id);
      router.invalidate();
    }
  };

  const enviarAvisoWhatsApp = async (cliente: string, dias: number) => {
    await confirm({
      title: "WhatsApp no conectado",
      message: `WhatsApp Business no está conectado todavía.\nPlantilla preparada:\n\n"Estimado/a ${cliente}, su póliza vence en ${dias} días. Contáctenos para renovarla."`,
      confirmLabel: "OK",
      cancelLabel: "Cerrar",
      tone: "brand",
    });
  };

  const enviarAvisosLote = async (items: any[]) => {
    const pendientes = items.filter((v) => v.estadoDB === "pendiente");
    if (pendientes.length === 0) {
      toast("Todos los avisos de este grupo ya han sido enviados.", "info");
      return;
    }
    const ids = pendientes.map((v) => v.id);
    const res = await enviarEmailReal(ids);
    if (res) toast(`${res.enviados}/${pendientes.length} emails enviados correctamente`, "success");
  };

  return (
    <PageShell
      title="Vencimientos"
      subtitle="El sistema vigila día a día qué pólizas vencen en los próximos 60 días. Cero pólizas perdidas por olvido."
      action={
        <Link to="/vencimientos/calendario" className="text-[12px] font-medium py-1.5 px-3 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
          <CalendarDays className="size-3.5" /> Ver calendario →
        </Link>
      }
    >
      <div className="grid grid-cols-4 gap-3 mb-6">
        <KpiCard label="Vencen en 7 días" value={String(criticos.length)} delta="Crítico" deltaTone="danger" />
        <KpiCard label="Vencen en 30 días" value={String(proximos.length)} delta="Atención" deltaTone="warning" />
        <KpiCard label="Vencen en 60 días" value={String(vencimientos.length)} hint="ventana total" />
        <KpiCard label="Avisos enviados" value={String(avisados.length)} delta="esta semana" deltaTone="success" hint="email + WhatsApp" />
      </div>

      {[
        { label: "Críticos · próximos 7 días", items: criticos, tone: "danger" as const },
        { label: "Próximos · 8 a 30 días", items: proximos, tone: "warning" as const },
        { label: "Futuros · 31 a 60 días", items: futuros, tone: "neutral" as const },
      ].map((group) => (
        <div key={group.label} className="mb-8">
          <SectionHeader
            title={group.label}
            hint={`${group.items.length} pólizas`}
            action={
              <button
                onClick={() => enviarAvisosLote(group.items)}
                className="text-[11px] font-medium py-1 px-2.5 rounded ring-1 ring-border hover:bg-secondary flex items-center gap-1 cursor-pointer"
              >
                <Mail className="size-3" /> Enviar avisos por lote
              </button>
            }
          />
          {group.items.length === 0 ? (
            <Card className="p-6 text-[12px] text-ink-subtle text-center">Sin vencimientos en este rango.</Card>
          ) : (
            <Card>
              <div className="divide-y divide-border">
                {group.items.map((v: any) => (
                  <div key={v.id} className="p-4 grid grid-cols-12 gap-3 items-center hover:bg-secondary/30 transition-colors">
                    <div className="col-span-1 text-center">
                      <div className={[
                        "inline-flex flex-col items-center justify-center size-12 rounded-md border",
                        group.tone === "danger" ? "bg-danger/10 border-danger/20 text-danger"
                          : group.tone === "warning" ? "bg-warning/10 border-warning/25 text-warning"
                          : "bg-secondary border-border text-ink-muted",
                      ].join(" ")}>
                        <span className="text-[9px] font-bold uppercase tracking-wider">D-{v.diasRestantes}</span>
                        <span className="text-[10px] font-mono leading-none mt-0.5">{v.fechaVencimiento.slice(5)}</span>
                      </div>
                    </div>
                    <div className="col-span-3">
                      <div className="text-[13px] font-medium truncate">{v.cliente}</div>
                      <div className="text-[11px] text-ink-subtle flex items-center gap-1.5 mt-0.5">
                        <RamoChip ramo={v.ramo} /> <span className="truncate">· {v.aseguradora} · <span className="font-mono">{v.numeroPoliza}</span></span>
                      </div>
                    </div>
                    <div className="col-span-2 text-[11.5px] text-ink-muted truncate">{v.comercial}</div>
                    <div className="col-span-1 text-[12px]"><MoneyEUR value={v.prima} /></div>
                    <div className="col-span-2 text-[11px] text-ink-muted flex items-center gap-1 min-w-0">
                      {(v.estadoDB === "avisado" || v.estadoDB === "renovado") && (
                        <CheckCircle2 className="size-3.5 text-success shrink-0" />
                      )}
                      <span className="truncate">{v.estadoAviso}</span>
                    </div>
                    <div className="col-span-3 flex justify-end items-center gap-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => marcarAvisado(v.id)}
                        disabled={v.estadoDB !== "pendiente"}
                        className="p-1.5 rounded hover:bg-secondary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Enviar aviso por email"
                      >
                        <Mail className="size-3.5 text-ink-muted" />
                      </button>
                      <button
                        type="button"
                        onClick={() => enviarAvisoWhatsApp(v.cliente, v.diasRestantes)}
                        className="p-1.5 rounded hover:bg-secondary cursor-pointer"
                        title="WhatsApp (plantilla)"
                      >
                        <MessageSquare className="size-3.5 text-ink-muted" />
                      </button>
                      <button
                        type="button"
                        onClick={() => marcarRenovado(v.id, v.cliente)}
                        disabled={v.estadoDB === "renovado"}
                        className="text-[11px] font-medium py-1 px-2.5 rounded bg-foreground text-background cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                      >
                        Renovar
                      </button>
                      <RowActions
                        actions={[
                          { icon: "view", label: "Ver datos", onClick: () => setViewing(v), tone: "brand" },
                          { icon: "edit", label: "Editar póliza", to: "/polizas/$id", params: { id: v.polizaId }, disabled: !v.polizaId },
                          { icon: "print", label: "Imprimir aviso", onClick: () => imprimirVenc(v) },
                          { icon: "download", label: "Descargar PDF", onClick: () => descargarVenc(v) },
                        ]}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      ))}

      <DetailModal
        isOpen={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `Vencimiento ${viewing.numeroPoliza}` : ""}
        subtitle={viewing ? `${viewing.cliente} · ${viewing.ramo} · ${viewing.aseguradora}` : undefined}
        rows={viewing ? [
          { label: "Cliente", value: viewing.cliente },
          { label: "Nº póliza", value: <span className="font-mono">{viewing.numeroPoliza}</span> },
          { label: "Ramo", value: <RamoChip ramo={viewing.ramo} /> },
          { label: "Aseguradora", value: viewing.aseguradora },
          { label: "Fecha vencimiento", value: <span className="font-mono">{viewing.fechaVencimiento}</span> },
          { label: "Días restantes", value: `D-${viewing.diasRestantes}` },
          { label: "Prima anual", value: <MoneyEUR value={Number(viewing.prima || 0)} /> },
          { label: "Comercial", value: viewing.comercial },
          { label: "Estado aviso", value: viewing.estadoAviso },
        ] : []}
        fullViewTo={viewing?.polizaId ? "/polizas/$id" : undefined}
        fullViewParams={viewing?.polizaId ? { id: viewing.polizaId } : undefined}
      />
    </PageShell>
  );
}
