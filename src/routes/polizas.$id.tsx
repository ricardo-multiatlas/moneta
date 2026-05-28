import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Plus, FileText, AlertTriangle, History, Trash2, Upload, Download, Printer, FileWarning, Mail, MessageSquare, PhoneCall, NotebookPen, Users as UsersIcon } from "lucide-react";
import { useRef, useState } from "react";
import { PageShell } from "@/components/app/page-shell";
import { Card, MoneyEUR, RamoChip, SectionHeader, StatusBadge, Modal } from "@/components/app/ui-bits";
import { supabase } from "@/lib/supabase";
import { generarPolizaPDF, subirPolizaPDF } from "@/lib/polizas-pdf";
import { useDialog } from "@/components/app/dialog-provider";
import { auditMutate } from "@/lib/audit-mutate";

export const Route = createFileRoute("/polizas/$id")({
  component: PolizaDetallePage,
  head: () => ({ meta: [{ title: "Póliza · Correduría OS" }] }),
  loader: async ({ params }) => {
    const { data: poliza } = await supabase
      .from("polizas")
      .select(`
        id, numero_poliza, ramo, aseguradora, prima_anual, comision_importe, comision_porcentaje,
        fecha_emision, fecha_inicio, fecha_vencimiento, estado, pdf_url, datos_extraidos,
        clientes(id, nombre_razon_social, nif_cif, email, telefono)
      `)
      .eq("id", params.id)
      .maybeSingle();

    if (!poliza) {
      return { poliza: null, anexos: [], siniestros: [], historial: [], contactos: [] };
    }

    const [{ data: anexos }, { data: siniestros }, { data: historial }, { data: contactos }] = await Promise.all([
      supabase
        .from("polizas_anexos")
        .select("id, tipo, nombre, descripcion, file_url, created_at")
        .eq("poliza_id", params.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("siniestros")
        .select("id, fecha_ocurrencia, fecha_apertura, descripcion, importe_estimado, importe_pagado, estado, referencia_aseguradora")
        .eq("poliza_id", params.id)
        .order("fecha_ocurrencia", { ascending: false }),
      supabase
        .from("audit_logs")
        .select("id, occurred_at, action, actor_email, diff")
        .eq("table_name", "polizas")
        .eq("record_id", params.id)
        .order("occurred_at", { ascending: false })
        .limit(20),
      supabase
        .from("comunicaciones")
        .select("id, tipo, asunto, contenido, fecha")
        .eq("poliza_id", params.id)
        .order("fecha", { ascending: false }),
    ]);

    return {
      poliza,
      anexos: anexos || [],
      siniestros: siniestros || [],
      historial: historial || [],
      contactos: contactos || [],
    };
  },
});

function PolizaDetallePage() {
  const { poliza, anexos, siniestros, historial, contactos } = Route.useLoaderData();
  const router = useRouter();
  const { toast, confirm } = useDialog();
  const [showAnexo, setShowAnexo] = useState(false);
  const [showSiniestro, setShowSiniestro] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [anexoData, setAnexoData] = useState({ tipo: "documento", nombre: "", descripcion: "" });
  const [siniestroData, setSiniestroData] = useState({
    fecha_ocurrencia: new Date().toISOString().slice(0, 10),
    descripcion: "",
    importe_estimado: "",
    referencia_aseguradora: "",
  });

  if (!poliza) {
    return (
      <PageShell title="Póliza no encontrada">
        <Card className="p-8 text-center">
          <p className="text-[13px] text-ink-subtle mb-4">No se encontró la póliza solicitada.</p>
          <Link to="/polizas" className="text-[12px] font-medium text-brand hover:underline">
            ← Volver al listado
          </Link>
        </Card>
      </PageShell>
    );
  }

  const cliente = (poliza as any).clientes;
  const comision = Number(poliza.comision_importe || Number(poliza.prima_anual) * 0.1);

  const guardarAnexo = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);

    let file_url: string | null = null;
    const file = fileRef.current?.files?.[0];
    if (file) {
      const path = `${poliza.id}/${Date.now()}_${file.name}`;
      const { error: errUp } = await supabase.storage.from("polizas-pdf").upload(path, file);
      if (errUp) {
        toast("Error subiendo archivo: " + errUp.message, "error");
        setBusy(false);
        return;
      }
      const { data: pub } = supabase.storage.from("polizas-pdf").getPublicUrl(path);
      file_url = pub?.publicUrl || null;
    }

    const { error } = await supabase.from("polizas_anexos").insert({
      poliza_id: poliza.id,
      tipo: anexoData.tipo,
      nombre: anexoData.nombre,
      descripcion: anexoData.descripcion || null,
      file_url,
    });
    setBusy(false);
    if (error) {
      toast("Error: " + error.message, "error");
    } else {
      setShowAnexo(false);
      setAnexoData({ tipo: "documento", nombre: "", descripcion: "" });
      if (fileRef.current) fileRef.current.value = "";
      router.invalidate();
    }
  };

  const guardarSiniestro = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("siniestros").insert({
      poliza_id: poliza.id,
      fecha_ocurrencia: siniestroData.fecha_ocurrencia,
      descripcion: siniestroData.descripcion,
      importe_estimado: siniestroData.importe_estimado ? Number(siniestroData.importe_estimado) : null,
      referencia_aseguradora: siniestroData.referencia_aseguradora || null,
      estado: "abierto",
    });
    setBusy(false);
    if (error) {
      toast("Error: " + error.message, "error");
    } else {
      setShowSiniestro(false);
      setSiniestroData({
        fecha_ocurrencia: new Date().toISOString().slice(0, 10),
        descripcion: "",
        importe_estimado: "",
        referencia_aseguradora: "",
      });
      router.invalidate();
    }
  };

  const eliminar = async () => {
    const ok = await confirm({ message: `¿Eliminar la póliza ${poliza.numero_poliza}?\nSe borrarán sus vencimientos, anexos y siniestros.`, tone: "danger" });
    if (!ok) return;
    setBusy(true);
    const { error } = await auditMutate({ action: "delete", table: "polizas", match: { id: poliza.id } });
    setBusy(false);
    if (error) toast("Error: " + error.message, "error");
    else router.navigate({ to: "/polizas" });
  };

  const descargarPDF = () => {
    if (poliza.pdf_url) {
      window.open(poliza.pdf_url, "_blank", "noopener,noreferrer");
      return;
    }
    // Sin PDF guardado: generamos uno al vuelo
    const blob = generarPolizaPDF({
      numero_poliza: poliza.numero_poliza,
      ramo: poliza.ramo,
      aseguradora: poliza.aseguradora,
      prima_anual: Number(poliza.prima_anual),
      fecha_inicio: poliza.fecha_inicio,
      fecha_vencimiento: poliza.fecha_vencimiento,
      cliente_nombre: cliente?.nombre_razon_social || "Sin tomador",
      cliente_nif: cliente?.nif_cif,
      cliente_email: cliente?.email,
      cliente_telefono: cliente?.telefono,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `poliza_${poliza.numero_poliza}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const imprimirPDF = () => {
    if (poliza.pdf_url) {
      const w = window.open(poliza.pdf_url, "_blank");
      if (w) w.addEventListener("load", () => w.print(), { once: true });
      return;
    }
    const blob = generarPolizaPDF({
      numero_poliza: poliza.numero_poliza,
      ramo: poliza.ramo,
      aseguradora: poliza.aseguradora,
      prima_anual: Number(poliza.prima_anual),
      fecha_inicio: poliza.fecha_inicio,
      fecha_vencimiento: poliza.fecha_vencimiento,
      cliente_nombre: cliente?.nombre_razon_social || "Sin tomador",
      cliente_nif: cliente?.nif_cif,
      cliente_email: cliente?.email,
      cliente_telefono: cliente?.telefono,
    });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (w) w.addEventListener("load", () => w.print(), { once: true });
  };

  const generarYSubirPDF = async () => {
    setBusy(true);
    try {
      const blob = generarPolizaPDF({
        numero_poliza: poliza.numero_poliza,
        ramo: poliza.ramo,
        aseguradora: poliza.aseguradora,
        prima_anual: Number(poliza.prima_anual),
        fecha_inicio: poliza.fecha_inicio,
        fecha_vencimiento: poliza.fecha_vencimiento,
        cliente_nombre: cliente?.nombre_razon_social || "Sin tomador",
        cliente_nif: cliente?.nif_cif,
        cliente_email: cliente?.email,
        cliente_telefono: cliente?.telefono,
      });
      const url = await subirPolizaPDF(poliza.id, blob, `poliza_${poliza.numero_poliza}.pdf`);
      if (url) {
        await supabase.from("polizas").update({ pdf_url: url }).eq("id", poliza.id);
        router.invalidate();
      } else {
        toast("No se pudo subir. Comprueba que el bucket 'polizas-pdf' existe (migración v2).", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell
      title={`Póliza ${poliza.numero_poliza}`}
      subtitle={`${poliza.ramo} · ${poliza.aseguradora} · ${cliente?.nombre_razon_social || "Sin cliente"}`}
      action={
        <div className="flex items-center gap-2">
          <Link to="/polizas" className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
            <ArrowLeft className="size-3.5" /> Volver
          </Link>
          <button type="button" onClick={descargarPDF} className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
            <Download className="size-3.5" /> Descargar PDF
          </button>
          <button type="button" onClick={imprimirPDF} className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
            <Printer className="size-3.5" /> Imprimir
          </button>
          <button type="button" onClick={eliminar} disabled={busy} className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-danger/30 text-danger hover:bg-danger/5 flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
            <Trash2 className="size-3.5" /> Eliminar
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-12 lg:col-span-8 space-y-6">
          <Card className="p-5">
            <SectionHeader title="Datos de la póliza" />
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12px]">
              <Row k="Número" v={<span className="font-mono">{poliza.numero_poliza}</span>} />
              <Row k="Ramo" v={<RamoChip ramo={poliza.ramo} />} />
              <Row k="Aseguradora" v={poliza.aseguradora} />
              <Row k="Estado" v={<StatusBadge tone={poliza.estado === "activa" ? "success" : poliza.estado === "cancelada" ? "danger" : "warning"}>{poliza.estado}</StatusBadge>} />
              <Row k="Fecha emisión" v={poliza.fecha_emision ? new Date(poliza.fecha_emision).toLocaleDateString() : "—"} />
              <Row k="Fecha inicio" v={new Date(poliza.fecha_inicio).toLocaleDateString()} />
              <Row k="Fecha vencimiento" v={<span className="font-mono">{new Date(poliza.fecha_vencimiento).toLocaleDateString()}</span>} />
              <Row k="Prima anual" v={<MoneyEUR value={Number(poliza.prima_anual)} />} />
              <Row k="Comisión" v={<><MoneyEUR value={comision} /> {poliza.comision_porcentaje && <span className="text-ink-subtle">({poliza.comision_porcentaje}%)</span>}</>} />
            </div>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h2 className="text-[13px] font-semibold tracking-tight">Documento de la póliza</h2>
                <p className="text-[11px] text-ink-subtle mt-0.5">
                  {poliza.pdf_url ? "PDF almacenado · puedes verlo, descargarlo e imprimirlo" : "Sin PDF guardado · puedes generar uno y archivarlo"}
                </p>
              </div>
              {!poliza.pdf_url && (
                <button type="button" onClick={generarYSubirPDF} disabled={busy} className="text-[11px] font-medium py-1 px-2.5 rounded ring-1 ring-brand bg-brand-soft text-brand hover:brightness-105 flex items-center gap-1 cursor-pointer disabled:opacity-50">
                  <Upload className="size-3" /> {busy ? "Generando…" : "Generar y archivar PDF"}
                </button>
              )}
            </div>
            {poliza.pdf_url ? (
              <div className="bg-secondary/40">
                <iframe
                  src={poliza.pdf_url}
                  title={`PDF póliza ${poliza.numero_poliza}`}
                  className="w-full h-[600px] bg-white"
                />
              </div>
            ) : (
              <div className="p-10 text-center text-[12px] text-ink-subtle flex flex-col items-center gap-2">
                <FileWarning className="size-6 text-ink-subtle" />
                Esta póliza aún no tiene PDF guardado.
                <br />
                Pulsa "Generar y archivar PDF" para crear uno con los datos actuales.
              </div>
            )}
          </Card>

          <div>
            <SectionHeader
              title="Anexos y documentos"
              hint={`${anexos.length} archivos`}
              action={
                <button type="button" onClick={() => setShowAnexo(true)} className="text-[11px] font-medium py-1 px-2.5 rounded ring-1 ring-border hover:bg-secondary flex items-center gap-1 cursor-pointer">
                  <Plus className="size-3" /> Añadir anexo
                </button>
              }
            />
            <Card>
              {anexos.length === 0 ? (
                <div className="p-6 text-center text-[12px] text-ink-subtle">Sin anexos. Sube cláusulas, suplementos, recibos.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {anexos.map((a: any) => (
                    <li key={a.id} className="p-3 flex items-center gap-3">
                      <FileText className="size-4 text-ink-subtle" />
                      <div className="flex-1">
                        <div className="text-[12.5px] font-medium">{a.nombre}</div>
                        <div className="text-[10px] text-ink-subtle mt-0.5">
                          {a.tipo} · {new Date(a.created_at).toLocaleDateString()}
                          {a.descripcion && ` · ${a.descripcion}`}
                        </div>
                      </div>
                      {a.file_url && (
                        <a href={a.file_url} target="_blank" rel="noreferrer" className="text-[11px] text-brand hover:underline">Abrir</a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div>
            <SectionHeader
              title="Siniestros"
              hint={`${siniestros.length} registrados · ${siniestros.filter((s: any) => s.estado !== "cerrado").length} abiertos`}
              action={
                <button type="button" onClick={() => setShowSiniestro(true)} className="text-[11px] font-medium py-1 px-2.5 rounded ring-1 ring-border hover:bg-secondary flex items-center gap-1 cursor-pointer">
                  <Plus className="size-3" /> Nuevo siniestro
                </button>
              }
            />
            <Card>
              {siniestros.length === 0 ? (
                <div className="p-6 text-center text-[12px] text-ink-subtle">Sin siniestros registrados.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-secondary/40 border-b border-border">
                      <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Fecha</th>
                      <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Descripción</th>
                      <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estimado</th>
                      <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Pagado</th>
                      <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {siniestros.map((s: any) => (
                      <tr key={s.id} className="hover:bg-secondary/30">
                        <td className="px-4 py-3 text-[11px] font-mono text-ink-muted">{new Date(s.fecha_ocurrencia).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-[12px]">{s.descripcion}</td>
                        <td className="px-4 py-3 text-[12px]"><MoneyEUR value={Number(s.importe_estimado || 0)} /></td>
                        <td className="px-4 py-3 text-[12px] text-ink-muted"><MoneyEUR value={Number(s.importe_pagado || 0)} /></td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={s.estado === "cerrado" ? "success" : s.estado === "rechazado" ? "danger" : "warning"}>
                            {s.estado}
                          </StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </section>

        <aside className="col-span-12 lg:col-span-4 space-y-6">
          {cliente && (
            <Card className="p-5">
              <SectionHeader title="Tomador" />
              <div className="space-y-2 text-[12px]">
                <Link to="/clientes/$id" params={{ id: cliente.id }} className="block text-[13px] font-medium hover:text-brand">
                  {cliente.nombre_razon_social} →
                </Link>
                <div className="text-ink-muted font-mono text-[11px]">{cliente.nif_cif || "Sin NIF"}</div>
                <div className="text-ink-muted">{cliente.email || "—"}</div>
                <div className="text-ink-muted">{cliente.telefono || "—"}</div>
              </div>
            </Card>
          )}

          <Card className="p-5">
            <SectionHeader title="Historial" hint="Últimos cambios auditados" />
            {historial.length === 0 ? (
              <div className="text-[12px] text-ink-subtle">Sin historial.</div>
            ) : (
              <ul className="space-y-2.5 text-[11px]">
                {historial.map((h: any) => (
                  <li key={h.id} className="flex items-start gap-2 pb-2.5 border-b border-border last:border-0">
                    <History className="size-3 text-ink-subtle mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{h.action}</div>
                      <div className="text-ink-muted">
                        {new Date(h.occurred_at).toLocaleString()}
                        {h.actor_email && ` · ${h.actor_email}`}
                      </div>
                      {h.diff && (
                        <div className="text-[10px] text-ink-subtle mt-1 font-mono truncate">
                          {Object.keys(h.diff).join(", ")}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <SectionHeader title="Historial de contactos sobre esta póliza" hint={`${contactos.length} registros`} />
            {contactos.length === 0 ? (
              <div className="text-[12px] text-ink-subtle">Sin contactos registrados para esta póliza.</div>
            ) : (
              <ul className="space-y-2.5 text-[11px]">
                {contactos.map((c: any) => {
                  const Icon = c.tipo === "llamada" ? PhoneCall
                    : c.tipo === "email" ? Mail
                    : c.tipo === "whatsapp" ? MessageSquare
                    : c.tipo === "sms" ? MessageSquare
                    : c.tipo === "reunion" ? UsersIcon
                    : NotebookPen;
                  return (
                    <li key={c.id} className="flex items-start gap-2 pb-2.5 border-b border-border last:border-0">
                      <Icon className="size-3 text-ink-subtle mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[11.5px]">{c.asunto || c.tipo}</span>
                          <span className="text-[9px] text-ink-subtle font-mono uppercase">{c.tipo}</span>
                        </div>
                        {c.contenido && (
                          <div className="text-[10.5px] text-ink-muted mt-0.5 whitespace-pre-wrap line-clamp-3">{c.contenido}</div>
                        )}
                        <div className="text-[10px] text-ink-subtle mt-0.5 font-mono">{new Date(c.fecha).toLocaleString()}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </aside>
      </div>

      <Modal isOpen={showAnexo} onClose={() => setShowAnexo(false)} title="Añadir anexo">
        <form onSubmit={guardarAnexo} className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Tipo</label>
            <select title="Tipo de anexo" value={anexoData.tipo} onChange={(e) => setAnexoData({ ...anexoData, tipo: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none">
              <option value="documento">Documento</option>
              <option value="anexo">Anexo</option>
              <option value="suplemento">Suplemento</option>
              <option value="clausula">Cláusula</option>
              <option value="recibo">Recibo</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Nombre</label>
            <input required title="Nombre del anexo" placeholder="Ej. Suplemento 01 - cambio matrícula" value={anexoData.nombre} onChange={(e) => setAnexoData({ ...anexoData, nombre: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Descripción</label>
            <textarea title="Descripción" placeholder="Notas opcionales" value={anexoData.descripcion} onChange={(e) => setAnexoData({ ...anexoData, descripcion: e.target.value })} rows={2} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Archivo (opcional)</label>
            <input ref={fileRef} type="file" title="Archivo del anexo" className="block w-full text-[11px] text-ink-muted file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:bg-secondary file:text-foreground hover:file:bg-secondary/70" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowAnexo(false)} className="text-[12px] py-1.5 px-3 rounded ring-1 ring-border hover:bg-secondary cursor-pointer">Cancelar</button>
            <button type="submit" disabled={busy} className="text-[12px] py-1.5 px-3 rounded bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
              <Upload className="size-3.5" /> {busy ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showSiniestro} onClose={() => setShowSiniestro(false)} title="Nuevo siniestro">
        <form onSubmit={guardarSiniestro} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Fecha ocurrencia</label>
              <input required type="date" title="Fecha ocurrencia" value={siniestroData.fecha_ocurrencia} onChange={(e) => setSiniestroData({ ...siniestroData, fecha_ocurrencia: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Ref. aseguradora</label>
              <input title="Referencia de la aseguradora" placeholder="SIN-2026-..." value={siniestroData.referencia_aseguradora} onChange={(e) => setSiniestroData({ ...siniestroData, referencia_aseguradora: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Descripción</label>
            <textarea required title="Descripción del siniestro" placeholder="Qué ocurrió, daños, lugar…" value={siniestroData.descripcion} onChange={(e) => setSiniestroData({ ...siniestroData, descripcion: e.target.value })} rows={3} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Importe estimado (€)</label>
            <input type="number" step="0.01" title="Importe estimado" placeholder="0.00" value={siniestroData.importe_estimado} onChange={(e) => setSiniestroData({ ...siniestroData, importe_estimado: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowSiniestro(false)} className="text-[12px] py-1.5 px-3 rounded ring-1 ring-border hover:bg-secondary cursor-pointer">Cancelar</button>
            <button type="submit" disabled={busy} className="text-[12px] py-1.5 px-3 rounded bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
              <AlertTriangle className="size-3.5" /> {busy ? "Guardando…" : "Abrir siniestro"}
            </button>
          </div>
        </form>
      </Modal>
    </PageShell>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-1.5">
      <span className="text-ink-subtle">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
