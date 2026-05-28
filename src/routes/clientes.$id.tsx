import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Mail, Phone, FileText, CalendarClock, ReceiptText, Trash2, Plus, MessageSquare, PhoneCall, NotebookPen, Users as UsersIcon, Wallet, Home, Landmark, Edit3, IdCard, Upload, AlertTriangle } from "lucide-react";
import { useRef, useState } from "react";
import { Modal } from "@/components/app/ui-bits";
import { PageShell } from "@/components/app/page-shell";
import { Card, MoneyEUR, RamoChip, SectionHeader, StatusBadge } from "@/components/app/ui-bits";
import { supabase } from "@/lib/supabase";
import { useDialog } from "@/components/app/dialog-provider";
import { auditMutate } from "@/lib/audit-mutate";

export const Route = createFileRoute("/clientes/$id")({
  component: ClienteDetallePage,
  head: () => ({ meta: [{ title: "Cliente · Correduría OS" }] }),
  loader: async ({ params }) => {
    // Selección DEFENSIVA: dni_anverso_url / dni_reverso_url / dni_caduca pueden NO existir (migración v0.7 pendiente).
    // Si la columna falta, el primer query falla — caemos a un select reducido.
    let cliente: any = null;
    let dniColumnasMissing = false;
    {
      const { data, error } = await supabase
        .from("clientes")
        .select(`
          id, tipo, nombre_razon_social, nif_cif, email, telefono, direccion, estado, created_at,
          familia, ingresos, propiedades, hipoteca, dni_anverso_url, dni_reverso_url, dni_caduca,
          comercial:usuarios!clientes_comercial_asignado_id_fkey(nombre, email)
        `)
        .eq("id", params.id)
        .maybeSingle();
      if (error) {
        // fallback sin columnas DNI
        dniColumnasMissing = true;
        const { data: data2 } = await supabase
          .from("clientes")
          .select(`
            id, tipo, nombre_razon_social, nif_cif, email, telefono, direccion, estado, created_at,
            familia, ingresos, propiedades, hipoteca,
            comercial:usuarios!clientes_comercial_asignado_id_fkey(nombre, email)
          `)
          .eq("id", params.id)
          .maybeSingle();
        cliente = data2;
      } else {
        cliente = data;
      }
    }

    if (!cliente) {
      return { cliente: null, polizas: [], facturas: [], comunicaciones: [], leadOrigen: null, recibos: [], recibosMissing: false, dniColumnasMissing };
    }

    const [{ data: polizas }, { data: facturas }, { data: comunicaciones }, { data: leadOrigen }] = await Promise.all([
      supabase
        .from("polizas")
        .select(`
          id, numero_poliza, ramo, aseguradora, prima_anual, comision_importe,
          fecha_inicio, fecha_vencimiento, estado
        `)
        .eq("cliente_id", params.id)
        .order("fecha_vencimiento", { ascending: true }),
      supabase
        .from("facturas")
        .select("id, numero_factura, concepto, fecha_emision, fecha_vencimiento, importe_total, estado")
        .eq("cliente_id", params.id)
        .order("fecha_emision", { ascending: false }),
      supabase
        .from("comunicaciones")
        .select("id, tipo, asunto, contenido, fecha, poliza_id")
        .eq("cliente_id", params.id)
        .order("fecha", { ascending: false }),
      supabase
        .from("leads")
        .select("id, origen, valor_estimado, fecha_contacto, estado")
        .eq("cliente_convertido_id", params.id)
        .maybeSingle(),
    ]);

    // DEFENSIVO: tabla recibos puede no existir aún (migración v0.7 pendiente)
    let recibos: any[] = [];
    let recibosMissing = false;
    try {
      const { data, error: errRec } = await supabase
        .from("recibos")
        .select("id, poliza_id, numero_recibo, periodo, fecha_emision, fecha_cargo, importe, estado, motivo_devolucion, cobrado_at")
        .eq("cliente_id", params.id)
        .order("fecha_emision", { ascending: false });
      if (errRec) recibosMissing = true;
      else recibos = data || [];
    } catch {
      recibosMissing = true;
    }

    return {
      cliente,
      polizas: polizas || [],
      facturas: facturas || [],
      comunicaciones: comunicaciones || [],
      leadOrigen: leadOrigen || null,
      recibos,
      recibosMissing,
      dniColumnasMissing,
    };
  },
});

function ClienteDetallePage() {
  const { cliente, polizas, facturas, comunicaciones, leadOrigen, recibos, recibosMissing, dniColumnasMissing } = Route.useLoaderData();
  const router = useRouter();
  const { toast, confirm, prompt } = useDialog();
  const [borrando, setBorrando] = useState(false);
  const [showComm, setShowComm] = useState(false);
  const [busyComm, setBusyComm] = useState(false);
  const [comm, setComm] = useState({ tipo: "nota", asunto: "", contenido: "" });
  const [showPatrim, setShowPatrim] = useState(false);
  const [busyPatrim, setBusyPatrim] = useState(false);
  const [busyDni, setBusyDni] = useState<"anverso" | "reverso" | null>(null);
  const dniAnversoRef = useRef<HTMLInputElement>(null);
  const dniReversoRef = useRef<HTMLInputElement>(null);
  const [patrim, setPatrim] = useState(() => ({
    conyuge: (cliente as any)?.familia?.conyuge || "",
    hijos: String((cliente as any)?.familia?.hijos ?? ""),
    mensual_neto: String((cliente as any)?.ingresos?.mensual_neto ?? ""),
    propiedades_texto: (cliente as any)?.propiedades?.texto || "",
    hipoteca_entidad: (cliente as any)?.hipoteca?.entidad || "",
    hipoteca_importe: String((cliente as any)?.hipoteca?.importe ?? ""),
    hipoteca_cuota: String((cliente as any)?.hipoteca?.cuota ?? ""),
    hipoteca_vencimiento: (cliente as any)?.hipoteca?.vencimiento || "",
  }));

  if (!cliente) {
    return (
      <PageShell title="Cliente no encontrado">
        <Card className="p-8 text-center">
          <p className="text-[13px] text-ink-subtle mb-4">No se encontró el cliente solicitado.</p>
          <Link to="/clientes" className="text-[12px] font-medium text-brand hover:underline">
            ← Volver al listado
          </Link>
        </Card>
      </PageShell>
    );
  }

  const primaTotal = polizas.reduce((s: number, p: any) => s + Number(p.prima_anual || 0), 0);
  const polizasActivas = polizas.filter((p: any) => p.estado === "activa").length;
  const facturasPendientes = facturas.filter((f: any) => f.estado === "Emitida" || f.estado === "emitida").length;
  const initials = cliente.nombre_razon_social.split(/[\s,]+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();

  const guardarComm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyComm(true);
    const { error } = await supabase.from("comunicaciones").insert({
      cliente_id: cliente.id,
      tipo: comm.tipo,
      asunto: comm.asunto || null,
      contenido: comm.contenido || null,
      fecha: new Date().toISOString(),
    });
    setBusyComm(false);
    if (error) {
      toast("Error: " + error.message, "error");
    } else {
      setShowComm(false);
      setComm({ tipo: "nota", asunto: "", contenido: "" });
      router.invalidate();
    }
  };

  const guardarPatrim = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyPatrim(true);
    const familia = (patrim.conyuge || patrim.hijos)
      ? { conyuge: patrim.conyuge || null, hijos: patrim.hijos ? Number(patrim.hijos) : null }
      : null;
    const ingresos = patrim.mensual_neto
      ? { mensual_neto: Number(patrim.mensual_neto) }
      : null;
    const propiedades = patrim.propiedades_texto
      ? { texto: patrim.propiedades_texto }
      : null;
    const hipoteca = (patrim.hipoteca_entidad || patrim.hipoteca_importe || patrim.hipoteca_cuota || patrim.hipoteca_vencimiento)
      ? {
          entidad: patrim.hipoteca_entidad || null,
          importe: patrim.hipoteca_importe ? Number(patrim.hipoteca_importe) : null,
          cuota: patrim.hipoteca_cuota ? Number(patrim.hipoteca_cuota) : null,
          vencimiento: patrim.hipoteca_vencimiento || null,
        }
      : null;
    const { error } = await supabase.from("clientes").update({
      familia, ingresos, propiedades, hipoteca,
    }).eq("id", cliente.id);
    setBusyPatrim(false);
    if (error) toast("Error: " + error.message, "error");
    else { toast("Datos patrimoniales guardados", "success"); setShowPatrim(false); router.invalidate(); }
  };

  const eliminar = async () => {
    const ok = await confirm({ message: `¿Eliminar al cliente "${cliente.nombre_razon_social}"?\nSe borrarán también sus pólizas y facturas asociadas.`, tone: "danger" });
    if (!ok) return;
    setBorrando(true);
    // Usamos auditMutate para que la eliminación quede registrada con IP/UA
    const { error } = await auditMutate({ action: "delete", table: "clientes", match: { id: cliente.id } });
    setBorrando(false);
    if (error) {
      toast("Error al eliminar: " + error.message, "error");
    } else {
      router.navigate({ to: "/clientes" });
    }
  };

  const subirDni = async (cara: "anverso" | "reverso") => {
    const ref = cara === "anverso" ? dniAnversoRef : dniReversoRef;
    const file = ref.current?.files?.[0];
    if (!file) return;
    setBusyDni(cara);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `dni/${cliente.id}_${cara}.${ext}`;
      const { error: errUp } = await supabase.storage.from("polizas-pdf").upload(path, file, { upsert: true });
      if (errUp) {
        toast("Error subiendo: " + errUp.message, "error");
        return;
      }
      const { data: pub } = supabase.storage.from("polizas-pdf").getPublicUrl(path);
      const url = pub?.publicUrl;
      // DEFENSIVO: la columna puede no existir aún
      try {
        const col = cara === "anverso" ? "dni_anverso_url" : "dni_reverso_url";
        const { error: errUpd } = await supabase.from("clientes").update({ [col]: url }).eq("id", cliente.id);
        if (errUpd) {
          toast("DNI subido al almacenamiento pero el enlace no se guardó en BD: " + (errUpd?.message || "columna no disponible"), "warning");
        } else {
          toast("DNI subido", "success");
          router.invalidate();
        }
      } catch (e: any) {
        toast("DNI subido al almacenamiento pero el enlace no se guardó en BD: " + (e?.message || "error desconocido"), "warning");
      }
    } finally {
      setBusyDni(null);
      if (ref.current) ref.current.value = "";
    }
  };

  const marcarReciboDevuelto = async (r: any) => {
    const motivo = await prompt({
      title: "Marcar recibo devuelto banco",
      message: `Recibo ${r.numero_recibo || r.periodo || r.id.slice(0, 8)} — indica el motivo de la devolución bancaria:`,
      placeholder: "Sin fondos / Cuenta cancelada / Devuelto a petición del cliente…",
    });
    if (motivo === null) return;
    const { error } = await supabase
      .from("recibos")
      .update({ estado: "devuelto_banco", motivo_devolucion: motivo })
      .eq("id", r.id);
    if (error) toast("Error: " + error.message, "error");
    else { toast("Recibo marcado como devuelto", "success"); router.invalidate(); }
  };

  return (
    <PageShell
      title={cliente.nombre_razon_social}
      subtitle={`${cliente.tipo === "empresa" ? "Empresa" : "Particular"} · ${cliente.nif_cif || "Sin NIF"}`}
      action={
        <div className="flex items-center gap-2">
          <Link to="/clientes" className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
            <ArrowLeft className="size-3.5" /> Volver
          </Link>
          <button
            type="button"
            onClick={eliminar}
            disabled={borrando}
            className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-danger/30 text-danger hover:bg-danger/5 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="size-3.5" /> {borrando ? "Eliminando..." : "Eliminar"}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-12 lg:col-span-8 space-y-6">
          <Card className="p-5">
            <div className="flex items-center gap-4 mb-5">
              <div className="size-14 rounded-md bg-brand-soft text-brand grid place-items-center text-[16px] font-semibold">{initials}</div>
              <div className="flex-1">
                <div className="text-[16px] font-semibold">{cliente.nombre_razon_social}</div>
                <div className="text-[11px] text-ink-subtle font-mono mt-0.5">{cliente.nif_cif || "Sin NIF"}</div>
              </div>
              <StatusBadge tone={cliente.estado === "Activo" ? "success" : "neutral"}>{cliente.estado || "—"}</StatusBadge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[12px]">
              <div className="flex items-center gap-2"><Mail className="size-3.5 text-ink-subtle" />{cliente.email || "—"}</div>
              <div className="flex items-center gap-2"><Phone className="size-3.5 text-ink-subtle" />{cliente.telefono || "—"}</div>
              <div className="flex items-center gap-2 text-ink-muted">
                Comercial: <span className="font-medium text-foreground">{(cliente as any).comercial?.nombre || "Sin asignar"}</span>
              </div>
              <div className="text-ink-muted">
                Alta: <span className="font-mono">{new Date(cliente.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader
              title="Datos personales y patrimoniales"
              hint="Información de cross-selling y conocimiento del cliente"
              action={
                <button
                  type="button"
                  onClick={() => setShowPatrim(true)}
                  className="text-[11px] font-medium py-1 px-2.5 rounded ring-1 ring-border hover:bg-secondary flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="size-3" /> Editar datos patrimoniales
                </button>
              }
            />
            <div className="grid grid-cols-2 gap-4 text-[12px]">
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-ink-subtle uppercase tracking-widest mb-2">
                  <UsersIcon className="size-3" /> Familia
                </div>
                {(cliente as any).familia ? (
                  <div className="space-y-1">
                    <div className="flex justify-between"><span className="text-ink-subtle">Cónyuge</span><span>{(cliente as any).familia.conyuge || "—"}</span></div>
                    <div className="flex justify-between"><span className="text-ink-subtle">Hijos</span><span className="font-mono">{(cliente as any).familia.hijos ?? "—"}</span></div>
                  </div>
                ) : <div className="text-ink-subtle text-[11px]">Sin datos.</div>}
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-ink-subtle uppercase tracking-widest mb-2">
                  <Wallet className="size-3" /> Ingresos
                </div>
                {(cliente as any).ingresos ? (
                  <div className="space-y-1">
                    <div className="flex justify-between"><span className="text-ink-subtle">Mensual neto</span><span><MoneyEUR value={Number((cliente as any).ingresos.mensual_neto || 0)} /></span></div>
                  </div>
                ) : <div className="text-ink-subtle text-[11px]">Sin datos.</div>}
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-ink-subtle uppercase tracking-widest mb-2">
                  <Home className="size-3" /> Propiedades
                </div>
                {(cliente as any).propiedades?.texto ? (
                  <div className="text-[11.5px] text-ink-muted whitespace-pre-wrap">{(cliente as any).propiedades.texto}</div>
                ) : <div className="text-ink-subtle text-[11px]">Sin datos.</div>}
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-ink-subtle uppercase tracking-widest mb-2">
                  <Landmark className="size-3" /> Hipoteca
                </div>
                {(cliente as any).hipoteca ? (
                  <div className="space-y-1">
                    <div className="flex justify-between"><span className="text-ink-subtle">Entidad</span><span>{(cliente as any).hipoteca.entidad || "—"}</span></div>
                    <div className="flex justify-between"><span className="text-ink-subtle">Pendiente</span><span><MoneyEUR value={Number((cliente as any).hipoteca.importe || 0)} /></span></div>
                    <div className="flex justify-between"><span className="text-ink-subtle">Cuota</span><span><MoneyEUR value={Number((cliente as any).hipoteca.cuota || 0)} /></span></div>
                    <div className="flex justify-between"><span className="text-ink-subtle">Vencimiento</span><span className="font-mono">{(cliente as any).hipoteca.vencimiento || "—"}</span></div>
                  </div>
                ) : <div className="text-ink-subtle text-[11px]">Sin datos.</div>}
              </div>
            </div>
          </Card>

          <div>
            <SectionHeader title="Pólizas" hint={`${polizas.length} en total · ${polizasActivas} activas`} />
            <Card>
              {polizas.length === 0 ? (
                <div className="p-6 text-center text-[12px] text-ink-subtle">Sin pólizas registradas.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-secondary/40 border-b border-border">
                      <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Nº</th>
                      <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Ramo</th>
                      <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Aseguradora</th>
                      <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Prima</th>
                      <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Vencimiento</th>
                      <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {polizas.map((p: any) => (
                      <tr key={p.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-3 text-[11px] font-mono">{p.numero_poliza}</td>
                        <td className="px-4 py-3"><RamoChip ramo={p.ramo} /></td>
                        <td className="px-4 py-3 text-[12px] text-ink-muted">{p.aseguradora}</td>
                        <td className="px-4 py-3 text-[12px]"><MoneyEUR value={p.prima_anual} /></td>
                        <td className="px-4 py-3 text-[11px] font-mono text-ink-muted">{new Date(p.fecha_vencimiento).toLocaleDateString()}</td>
                        <td className="px-4 py-3"><StatusBadge tone={p.estado === "activa" ? "success" : p.estado === "cancelada" ? "danger" : "warning"}>{p.estado}</StatusBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <div>
            <SectionHeader
              title="Comunicaciones"
              hint={`${comunicaciones.length} registros`}
              action={
                <button type="button" onClick={() => setShowComm(true)} className="text-[11px] font-medium py-1 px-2.5 rounded ring-1 ring-border hover:bg-secondary flex items-center gap-1 cursor-pointer">
                  <Plus className="size-3" /> Nueva comunicación
                </button>
              }
            />
            <Card>
              {comunicaciones.length === 0 ? (
                <div className="p-6 text-center text-[12px] text-ink-subtle">Sin comunicaciones registradas. Anota llamadas, emails o reuniones.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {comunicaciones.map((c: any) => {
                    const Icon = c.tipo === "llamada" ? PhoneCall : c.tipo === "email" ? Mail : c.tipo === "whatsapp" ? MessageSquare : NotebookPen;
                    return (
                      <li key={c.id} className="p-3 flex items-start gap-3">
                        <Icon className="size-4 text-ink-subtle mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[12.5px] font-medium">{c.asunto || c.tipo}</span>
                            <span className="text-[10px] text-ink-subtle font-mono uppercase">{c.tipo}</span>
                          </div>
                          {c.contenido && (
                            <div className="text-[11.5px] text-ink-muted mt-1 whitespace-pre-wrap">{c.contenido}</div>
                          )}
                          <div className="text-[10px] text-ink-subtle mt-1 font-mono">{new Date(c.fecha).toLocaleString()}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          <div>
            <SectionHeader title="Facturas" hint={`${facturas.length} en total · ${facturasPendientes} emitidas`} />
            <Card>
              {facturas.length === 0 ? (
                <div className="p-6 text-center text-[12px] text-ink-subtle">Sin facturas registradas.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-secondary/40 border-b border-border">
                      <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Nº</th>
                      <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Concepto</th>
                      <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Emisión</th>
                      <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Importe</th>
                      <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {facturas.map((f: any) => (
                      <tr key={f.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-3 text-[11px] font-mono">{f.numero_factura}</td>
                        <td className="px-4 py-3 text-[12px] text-ink-muted">{f.concepto}</td>
                        <td className="px-4 py-3 text-[11px] font-mono text-ink-muted">{new Date(f.fecha_emision).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-[12px]"><MoneyEUR value={f.importe_total} /></td>
                        <td className="px-4 py-3 text-[10px] uppercase">{f.estado}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <div>
            <SectionHeader title="Recibos" hint={recibosMissing ? "Activar migración v0.7" : `${recibos.length} registros`} />
            <Card>
              {recibosMissing ? (
                <div className="p-4 text-[11.5px] text-warning bg-warning/5 ring-1 ring-warning/20 rounded-md flex items-start gap-2 m-3">
                  <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                  <span>Tabla <code className="font-mono">recibos</code> no creada. Aplica la migración v0.7 para empezar a gestionar recibos separados de facturas.</span>
                </div>
              ) : recibos.length === 0 ? (
                <div className="p-6 text-center text-[12px] text-ink-subtle">Sin recibos registrados para este cliente.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-secondary/40 border-b border-border">
                      <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Periodo</th>
                      <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Importe</th>
                      <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
                      <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Fecha cargo</th>
                      <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recibos.map((r: any) => {
                      const tone = r.estado === "cobrado" ? "success"
                        : r.estado === "devuelto_banco" ? "danger"
                        : r.estado === "anulado" ? "neutral"
                        : "warning";
                      return (
                        <tr key={r.id} className="hover:bg-secondary/30">
                          <td className="px-4 py-3 text-[12px] font-mono">{r.periodo || r.numero_recibo || "—"}</td>
                          <td className="px-4 py-3 text-[12px]"><MoneyEUR value={Number(r.importe || 0)} /></td>
                          <td className="px-4 py-3">
                            <StatusBadge tone={tone as any}>{r.estado}</StatusBadge>
                            {r.motivo_devolucion && (
                              <div className="text-[9px] text-ink-subtle mt-0.5">{r.motivo_devolucion}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[11px] font-mono text-ink-muted">{r.fecha_cargo ? new Date(r.fecha_cargo).toLocaleDateString() : "—"}</td>
                          <td className="px-4 py-3 text-right">
                            {r.estado === "cobrado" ? (
                              <button
                                type="button"
                                onClick={() => marcarReciboDevuelto(r)}
                                className="text-[11px] font-medium py-1 px-2 rounded ring-1 ring-danger/30 text-danger hover:bg-danger/5 cursor-pointer"
                              >
                                Marcar devuelto banco
                              </button>
                            ) : (
                              <span className="text-[10px] text-ink-subtle">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </section>

        <aside className="col-span-12 lg:col-span-4 space-y-6">
          <Card className="p-5">
            <SectionHeader title="Documentos DNI" hint="Anverso y reverso para identificación" action={<IdCard className="size-4 text-brand" />} />
            {dniColumnasMissing && (
              <div className="text-[11px] text-warning bg-warning/5 ring-1 ring-warning/20 rounded p-2.5 mb-3 flex items-start gap-1.5">
                <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                <span>Columnas DNI no existen aún. Activa la migración v0.7 — puedes subir los archivos al storage pero el enlace no se persiste.</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-ink-subtle mb-1.5">Anverso</div>
                {(cliente as any)?.dni_anverso_url ? (
                  <a href={(cliente as any).dni_anverso_url} target="_blank" rel="noreferrer" className="block">
                    <img src={(cliente as any).dni_anverso_url} alt="DNI anverso" className="w-full h-24 object-cover rounded ring-1 ring-border" />
                  </a>
                ) : (
                  <div className="w-full h-24 rounded ring-1 ring-dashed ring-border bg-secondary/30 grid place-items-center text-[10px] text-ink-subtle">Sin archivo</div>
                )}
                <input
                  ref={dniAnversoRef}
                  type="file"
                  accept="image/*,application/pdf"
                  title="Archivo DNI anverso"
                  onChange={() => void subirDni("anverso")}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => dniAnversoRef.current?.click()}
                  disabled={busyDni !== null}
                  className="mt-2 w-full text-[11px] font-medium py-1 px-2 rounded ring-1 ring-border hover:bg-secondary flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Upload className="size-3" /> {busyDni === "anverso" ? "Subiendo…" : "Subir anverso"}
                </button>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-ink-subtle mb-1.5">Reverso</div>
                {(cliente as any)?.dni_reverso_url ? (
                  <a href={(cliente as any).dni_reverso_url} target="_blank" rel="noreferrer" className="block">
                    <img src={(cliente as any).dni_reverso_url} alt="DNI reverso" className="w-full h-24 object-cover rounded ring-1 ring-border" />
                  </a>
                ) : (
                  <div className="w-full h-24 rounded ring-1 ring-dashed ring-border bg-secondary/30 grid place-items-center text-[10px] text-ink-subtle">Sin archivo</div>
                )}
                <input
                  ref={dniReversoRef}
                  type="file"
                  accept="image/*,application/pdf"
                  title="Archivo DNI reverso"
                  onChange={() => void subirDni("reverso")}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => dniReversoRef.current?.click()}
                  disabled={busyDni !== null}
                  className="mt-2 w-full text-[11px] font-medium py-1 px-2 rounded ring-1 ring-border hover:bg-secondary flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Upload className="size-3" /> {busyDni === "reverso" ? "Subiendo…" : "Subir reverso"}
                </button>
              </div>
            </div>
            {(cliente as any)?.dni_caduca && (
              <div className="text-[11px] text-ink-muted mt-3">
                Caduca: <span className="font-mono">{(cliente as any).dni_caduca}</span>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <SectionHeader title="Resumen económico" />
            <div className="space-y-3 text-[12px]">
              <div className="flex justify-between"><span className="text-ink-subtle">Prima anual total</span><span className="font-semibold"><MoneyEUR value={primaTotal} /></span></div>
              <div className="flex justify-between"><span className="text-ink-subtle">Pólizas activas</span><span className="font-mono">{polizasActivas}</span></div>
              <div className="flex justify-between"><span className="text-ink-subtle">Facturas emitidas</span><span className="font-mono">{facturas.length}</span></div>
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader title="Próximos vencimientos" />
            {polizas.filter((p: any) => p.estado === "activa").slice(0, 5).length === 0 ? (
              <div className="text-[12px] text-ink-subtle">Sin vencimientos próximos.</div>
            ) : (
              <ul className="space-y-2 text-[12px]">
                {polizas.filter((p: any) => p.estado === "activa").slice(0, 5).map((p: any) => (
                  <li key={p.id} className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <CalendarClock className="size-3.5 text-ink-subtle" />
                      <span className="font-mono text-[11px]">{p.numero_poliza}</span>
                    </span>
                    <span className="text-ink-muted">{new Date(p.fecha_vencimiento).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {leadOrigen && (
            <Card className="p-5">
              <SectionHeader title="Origen del cliente" hint="Trazabilidad de captación" />
              <div className="space-y-2 text-[12px]">
                <div className="flex justify-between"><span className="text-ink-subtle">Canal</span><span className="font-medium">{leadOrigen.origen}</span></div>
                <div className="flex justify-between"><span className="text-ink-subtle">Valor estimado</span><span className="font-mono"><MoneyEUR value={Number(leadOrigen.valor_estimado || 0)} /></span></div>
                <div className="flex justify-between"><span className="text-ink-subtle">Primer contacto</span><span className="font-mono">{leadOrigen.fecha_contacto ? new Date(leadOrigen.fecha_contacto).toLocaleDateString() : "—"}</span></div>
                <div className="flex justify-between"><span className="text-ink-subtle">Estado lead</span><StatusBadge tone="success">{leadOrigen.estado}</StatusBadge></div>
              </div>
            </Card>
          )}

          <Card className="p-5">
            <SectionHeader title="Acciones" />
            <div className="space-y-2 text-[12px]">
              <Link to="/polizas" className="flex items-center gap-2 p-2 rounded hover:bg-secondary transition-colors">
                <FileText className="size-3.5 text-brand" /> Nueva póliza para este cliente
              </Link>
              <Link to="/facturacion" className="flex items-center gap-2 p-2 rounded hover:bg-secondary transition-colors">
                <ReceiptText className="size-3.5 text-brand" /> Crear factura
              </Link>
            </div>
          </Card>
        </aside>
      </div>

      <Modal isOpen={showPatrim} onClose={() => setShowPatrim(false)} title="Datos personales y patrimoniales">
        <form onSubmit={guardarPatrim} className="space-y-4">
          <div>
            <div className="text-[11px] font-medium text-ink-subtle uppercase tracking-widest mb-2">Familia</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-ink-subtle mb-1">Cónyuge</label>
                <input title="Cónyuge" placeholder="Nombre" type="text" value={patrim.conyuge} onChange={e => setPatrim({ ...patrim, conyuge: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
              </div>
              <div>
                <label className="block text-[11px] text-ink-subtle mb-1">Nº hijos</label>
                <input title="Número de hijos" placeholder="0" type="number" min="0" value={patrim.hijos} onChange={e => setPatrim({ ...patrim, hijos: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
              </div>
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-ink-subtle uppercase tracking-widest mb-2">Ingresos</div>
            <label className="block text-[11px] text-ink-subtle mb-1">Mensual neto (€)</label>
            <input title="Ingresos mensual neto" placeholder="0.00" type="number" step="0.01" value={patrim.mensual_neto} onChange={e => setPatrim({ ...patrim, mensual_neto: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-ink-subtle uppercase tracking-widest mb-2">Propiedades</div>
            <textarea title="Listado de propiedades" rows={3} value={patrim.propiedades_texto} placeholder="Vivienda habitual Sevilla — 250k€; garaje — 20k€…" onChange={e => setPatrim({ ...patrim, propiedades_texto: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-ink-subtle uppercase tracking-widest mb-2">Hipoteca</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-ink-subtle mb-1">Entidad</label>
                <input title="Entidad hipoteca" placeholder="Banco" type="text" value={patrim.hipoteca_entidad} onChange={e => setPatrim({ ...patrim, hipoteca_entidad: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
              </div>
              <div>
                <label className="block text-[11px] text-ink-subtle mb-1">Importe pendiente (€)</label>
                <input title="Importe pendiente hipoteca" placeholder="0.00" type="number" step="0.01" value={patrim.hipoteca_importe} onChange={e => setPatrim({ ...patrim, hipoteca_importe: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
              </div>
              <div>
                <label className="block text-[11px] text-ink-subtle mb-1">Cuota mensual (€)</label>
                <input title="Cuota mensual hipoteca" placeholder="0.00" type="number" step="0.01" value={patrim.hipoteca_cuota} onChange={e => setPatrim({ ...patrim, hipoteca_cuota: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
              </div>
              <div>
                <label className="block text-[11px] text-ink-subtle mb-1">Vencimiento</label>
                <input title="Vencimiento hipoteca" placeholder="AAAA-MM-DD" type="date" value={patrim.hipoteca_vencimiento} onChange={e => setPatrim({ ...patrim, hipoteca_vencimiento: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowPatrim(false)} className="text-[12px] py-1.5 px-3 rounded ring-1 ring-border hover:bg-secondary cursor-pointer">Cancelar</button>
            <button type="submit" disabled={busyPatrim} className="text-[12px] py-1.5 px-3 rounded bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50">
              {busyPatrim ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showComm} onClose={() => setShowComm(false)} title="Nueva comunicación">
        <form onSubmit={guardarComm} className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Tipo</label>
            <select title="Tipo de comunicación" value={comm.tipo} onChange={(e) => setComm({ ...comm, tipo: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none">
              <option value="nota">Nota interna</option>
              <option value="llamada">Llamada</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="reunion">Reunión</option>
              <option value="sms">SMS</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Asunto</label>
            <input title="Asunto" placeholder="Ej. Renovación auto" value={comm.asunto} onChange={(e) => setComm({ ...comm, asunto: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Contenido</label>
            <textarea title="Contenido" placeholder="Qué se habló, decidió, próximos pasos…" rows={4} value={comm.contenido} onChange={(e) => setComm({ ...comm, contenido: e.target.value })} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowComm(false)} className="text-[12px] py-1.5 px-3 rounded ring-1 ring-border hover:bg-secondary cursor-pointer">Cancelar</button>
            <button type="submit" disabled={busyComm} className="text-[12px] py-1.5 px-3 rounded bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50">
              {busyComm ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </Modal>
    </PageShell>
  );
}
