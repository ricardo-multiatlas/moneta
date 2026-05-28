import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Plus, Receipt, CheckCircle2, AlertCircle } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, KpiCard, MoneyEUR, SectionHeader, StatusBadge, Modal, type StatusTone } from "@/components/app/ui-bits";
import { RowActions } from "@/components/app/row-actions";
import { Paginador } from "@/components/app/paginador";
import { supabase } from "@/lib/supabase";
import { useDialog } from "@/components/app/dialog-provider";
import { usePermissions } from "@/hooks/use-permissions";
import { exportarExcel } from "@/lib/exportar";

const searchSchema = z.object({
  page: z.coerce.number().int().positive().default(1).catch(1),
  pageSize: z.coerce.number().int().positive().default(50).catch(50),
  estado: z.enum(["", "pendiente", "cobrado", "devuelto", "reclamando", "impagado", "anulado"]).default("").catch(""),
});

export const Route = createFileRoute("/recibos")({
  component: RecibosPage,
  head: () => ({ meta: [{ title: "Recibos · Correduría OS" }] }),
  validateSearch: searchSchema,
});

const ESTADO_TONE: Record<string, StatusTone> = {
  pendiente: "warning",
  cobrado: "success",
  devuelto: "danger",
  reclamando: "warning",
  impagado: "danger",
  anulado: "neutral",
};

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  cobrado: "Cobrado",
  devuelto: "Devuelto",
  reclamando: "Reclamando",
  impagado: "Impagado",
  anulado: "Anulado",
};

const PERIODOS = ["anual", "semestral", "trimestral", "mensual", "unico"];
const FORMAS_PAGO = ["domiciliacion", "transferencia", "tarjeta", "efectivo", "otro"];

function RecibosPage() {
  const router = useRouter();
  const search = Route.useSearch();
  const { toast, confirm, prompt } = useDialog();
  const { esRoot, esSecretaria, esJefeZona, esComercial } = usePermissions();
  const [recibos, setRecibos] = useState<any[]>([]);
  const [polizas, setPolizas] = useState<any[]>([]);
  const [resumen, setResumen] = useState<Record<string, { cantidad: number; total: number }>>({});
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    poliza_id: "",
    cliente_id: "",
    numero_recibo: "",
    importe: "",
    fecha_emision: new Date().toISOString().slice(0, 10),
    periodo: "anual",
    forma_pago: "domiciliacion",
    iban_cargo: "",
    notas: "",
  });

  const cargar = async () => {
    setBusy(true);
    const from = (search.page - 1) * search.pageSize;
    const to = from + search.pageSize - 1;
    let query = supabase
      .from("recibos")
      .select(`
        id, numero_recibo, importe, fecha_emision, fecha_cobro, fecha_devolucion,
        motivo_devolucion, estado, periodo, forma_pago, iban_cargo, notas, created_at,
        poliza_id, cliente_id,
        polizas(numero_poliza, ramo, aseguradora),
        clientes(nombre_razon_social, nif_cif)
      `, { count: "exact" })
      .order("fecha_emision", { ascending: false })
      .range(from, to);
    if (search.estado) query = query.eq("estado", search.estado);
    const { data, count } = await query;
    setRecibos(data || []);
    setTotal(count || 0);

    // Pólizas para el form de creación
    const { data: pols } = await supabase
      .from("polizas")
      .select("id, numero_poliza, cliente_id, prima_anual, clientes(nombre_razon_social)")
      .eq("estado", "activa")
      .order("numero_poliza");
    setPolizas(pols || []);

    // Resumen por estado para KPIs
    const { data: rsm } = await supabase.from("vw_recibos_estado").select("*");
    const r: Record<string, { cantidad: number; total: number }> = {};
    (rsm || []).forEach((row: any) => { r[row.estado] = { cantidad: row.cantidad, total: Number(row.total_importe) }; });
    setResumen(r);

    setBusy(false);
  };
  useEffect(() => { cargar(); }, [search.page, search.pageSize, search.estado]);

  const updateSearch = (patch: any) => {
    router.navigate({ to: "/recibos", search: (prev: any) => ({ ...prev, ...patch }) });
  };

  const abrir = (r?: any) => {
    if (r) {
      setEditId(r.id);
      setForm({
        poliza_id: r.poliza_id || "",
        cliente_id: r.cliente_id || "",
        numero_recibo: r.numero_recibo || "",
        importe: String(r.importe || ""),
        fecha_emision: r.fecha_emision,
        periodo: r.periodo || "anual",
        forma_pago: r.forma_pago || "domiciliacion",
        iban_cargo: r.iban_cargo || "",
        notas: r.notas || "",
      });
    } else {
      setEditId(null);
      setForm({
        poliza_id: "",
        cliente_id: "",
        numero_recibo: "",
        importe: "",
        fecha_emision: new Date().toISOString().slice(0, 10),
        periodo: "anual",
        forma_pago: "domiciliacion",
        iban_cargo: "",
        notas: "",
      });
    }
    setOpen(true);
  };

  const onPolizaChange = (poliza_id: string) => {
    const p = polizas.find((x) => x.id === poliza_id);
    setForm({
      ...form,
      poliza_id,
      cliente_id: p?.cliente_id || "",
      importe: form.importe || String(p?.prima_anual ?? ""),
    });
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.poliza_id || !form.cliente_id || !form.importe) {
      toast("Faltan campos obligatorios", "error");
      return;
    }
    const payload = {
      poliza_id: form.poliza_id,
      cliente_id: form.cliente_id,
      numero_recibo: form.numero_recibo || null,
      importe: Number(form.importe),
      fecha_emision: form.fecha_emision,
      periodo: form.periodo,
      forma_pago: form.forma_pago,
      iban_cargo: form.iban_cargo || null,
      notas: form.notas || null,
    };
    const { error } = editId
      ? await supabase.from("recibos").update(payload).eq("id", editId)
      : await supabase.from("recibos").insert(payload);
    if (error) { toast("Error: " + error.message, "error"); return; }
    setOpen(false);
    toast(editId ? "Recibo actualizado" : "Recibo creado", "success");
    cargar();
  };

  const marcarCobrado = async (r: any) => {
    const ok = await confirm({ message: `¿Marcar como cobrado el recibo ${r.numero_recibo || r.id.slice(0, 8)}?`, tone: "brand" });
    if (!ok) return;
    const { error } = await supabase
      .from("recibos")
      .update({ estado: "cobrado", fecha_cobro: new Date().toISOString().slice(0, 10) })
      .eq("id", r.id);
    if (error) toast("Error: " + error.message, "error");
    else { toast("Marcado como cobrado", "success"); cargar(); }
  };

  const marcarDevuelto = async (r: any) => {
    const motivo = await prompt({
      title: "Marcar devuelto",
      message: "Motivo de la devolución:",
      validate: (v) => (v.trim().length < 3 ? "Indica al menos 3 caracteres" : null),
    });
    if (motivo === null) return;
    const { error } = await supabase
      .from("recibos")
      .update({
        estado: "devuelto",
        fecha_devolucion: new Date().toISOString().slice(0, 10),
        motivo_devolucion: motivo,
      })
      .eq("id", r.id);
    if (error) toast("Error: " + error.message, "error");
    else { toast("Marcado como devuelto", "warning"); cargar(); }
  };

  const eliminar = async (r: any) => {
    const ok = await confirm({ message: `¿Eliminar el recibo ${r.numero_recibo || r.id.slice(0, 8)}?`, tone: "danger" });
    if (!ok) return;
    const { error } = await supabase.from("recibos").delete().eq("id", r.id);
    if (error) toast("Error: " + error.message, "error");
    else { toast("Recibo eliminado", "success"); cargar(); }
  };

  const exportar = () => {
    if (recibos.length === 0) { toast("No hay recibos que exportar.", "warning"); return; }
    const rows = recibos.map((r: any) => ({
      "Nº Recibo": r.numero_recibo || "—",
      "Cliente": r.clientes?.nombre_razon_social || "—",
      "Póliza": r.polizas?.numero_poliza || "—",
      "Ramo": r.polizas?.ramo || "—",
      "Aseguradora": r.polizas?.aseguradora || "—",
      "Importe (€)": Number(r.importe),
      "Estado": ESTADO_LABEL[r.estado] || r.estado,
      "Emitido": r.fecha_emision,
      "Cobrado": r.fecha_cobro || "—",
      "Devuelto": r.fecha_devolucion || "—",
      "Motivo devolución": r.motivo_devolucion || "—",
      "Periodo": r.periodo,
      "Forma pago": r.forma_pago,
    }));
    exportarExcel(`recibos_${new Date().toISOString().slice(0, 10)}.xlsx`, "Recibos", rows);
    toast(`${rows.length} recibos exportados`, "success");
  };

  return (
    <PageShell
      title="Recibos"
      subtitle="Gestión de recibos por póliza. Marca cobros y devoluciones, exporta para conciliar con banco."
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportar}
            className="text-[12px] font-medium py-1.5 px-3 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer"
          >
            Exportar Excel
          </button>
          <button
            type="button"
            onClick={() => abrir()}
            className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="size-3.5" /> Nuevo recibo
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Pendientes" value={String(resumen.pendiente?.cantidad ?? 0)} hint={`${(resumen.pendiente?.total ?? 0).toFixed(0)}€`} deltaTone="warning" />
        <KpiCard label="Cobrados" value={String(resumen.cobrado?.cantidad ?? 0)} hint={`${(resumen.cobrado?.total ?? 0).toFixed(0)}€`} deltaTone="success" />
        <KpiCard label="Devueltos" value={String(resumen.devuelto?.cantidad ?? 0)} hint={`${(resumen.devuelto?.total ?? 0).toFixed(0)}€`} deltaTone="danger" />
        <KpiCard label="Impagados" value={String((resumen.impagado?.cantidad ?? 0) + (resumen.reclamando?.cantidad ?? 0))} hint="incluye reclamando" deltaTone="danger" />
      </div>

      <Card>
        <div className="px-4 py-3 border-b border-border flex items-center gap-3">
          <select
            value={search.estado}
            onChange={(e) => updateSearch({ page: 1, estado: e.target.value || undefined })}
            className="text-[12px] bg-secondary border-0 rounded px-2 py-1 ring-1 ring-border cursor-pointer"
          >
            <option value="">Todos los estados</option>
            {Object.entries(ESTADO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="ml-auto text-[11px] text-ink-subtle">
            <span className="font-medium text-foreground">{total}</span> total
          </div>
        </div>

        {busy ? (
          <div className="p-8 text-center text-[12px] text-ink-subtle">Cargando…</div>
        ) : recibos.length === 0 ? (
          <div className="p-10 text-center text-[12px] text-ink-subtle">
            <Receipt className="size-6 text-ink-subtle mx-auto mb-2" />
            {total === 0 ? "Aún no hay recibos. Crea el primero con \"Nuevo recibo\"." : "Sin recibos con ese filtro."}
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Nº</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Cliente</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Póliza</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Importe</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Emitido</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recibos.map((r: any) => (
                <tr key={r.id} className="hover:bg-secondary/30">
                  <td className="px-4 py-3 text-[11.5px] font-mono">{r.numero_recibo || "—"}</td>
                  <td className="px-4 py-3 text-[12px]">{r.clientes?.nombre_razon_social || "—"}</td>
                  <td className="px-4 py-3 text-[11.5px]">
                    <div>{r.polizas?.numero_poliza || "—"}</div>
                    <div className="text-[10px] text-ink-subtle">{r.polizas?.ramo} · {r.polizas?.aseguradora}</div>
                  </td>
                  <td className="px-4 py-3 text-[12px]"><MoneyEUR value={Number(r.importe)} /></td>
                  <td className="px-4 py-3 text-[11px] font-mono text-ink-muted">{r.fecha_emision}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={ESTADO_TONE[r.estado] || "neutral"}>{ESTADO_LABEL[r.estado] || r.estado}</StatusBadge>
                    {r.fecha_cobro && <div className="text-[10px] text-ink-subtle mt-0.5">Cobrado {r.fecha_cobro}</div>}
                    {r.fecha_devolucion && <div className="text-[10px] text-danger mt-0.5" title={r.motivo_devolucion}>Devuelto {r.fecha_devolucion}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <RowActions
                      actions={[
                        { icon: "check", label: "Marcar cobrado", onClick: () => marcarCobrado(r), tone: "brand", disabled: r.estado === "cobrado" || r.estado === "anulado" },
                        { icon: "x", label: "Marcar devuelto", onClick: () => marcarDevuelto(r), tone: "danger", disabled: r.estado === "devuelto" || r.estado === "anulado" },
                        { icon: "edit", label: "Editar", onClick: () => abrir(r) },
                        { icon: "trash", label: "Eliminar", onClick: () => eliminar(r), tone: "danger" },
                      ]}
                    />
                  </td>
                </tr>
              ))}
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

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editId ? "Editar recibo" : "Nuevo recibo"}>
        <form onSubmit={guardar} className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Póliza *</label>
            <select
              required
              value={form.poliza_id}
              onChange={(e) => onPolizaChange(e.target.value)}
              className="w-full bg-secondary border-0 rounded px-3 py-1.5 text-[12px] ring-1 ring-border cursor-pointer"
            >
              <option value="">Selecciona una póliza activa…</option>
              {polizas.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.numero_poliza} · {p.clientes?.nombre_razon_social} ({p.prima_anual}€)
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Nº Recibo</label>
              <input
                type="text"
                value={form.numero_recibo}
                onChange={(e) => setForm({ ...form, numero_recibo: e.target.value })}
                className="w-full bg-secondary border-0 rounded px-3 py-1.5 text-[12px] ring-1 ring-border"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Importe (€) *</label>
              <input
                required
                type="number"
                step="0.01"
                value={form.importe}
                onChange={(e) => setForm({ ...form, importe: e.target.value })}
                className="w-full bg-secondary border-0 rounded px-3 py-1.5 text-[12px] ring-1 ring-border"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Fecha emisión</label>
              <input
                type="date"
                value={form.fecha_emision}
                onChange={(e) => setForm({ ...form, fecha_emision: e.target.value })}
                className="w-full bg-secondary border-0 rounded px-3 py-1.5 text-[12px] ring-1 ring-border"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Periodo</label>
              <select
                value={form.periodo}
                onChange={(e) => setForm({ ...form, periodo: e.target.value })}
                className="w-full bg-secondary border-0 rounded px-3 py-1.5 text-[12px] ring-1 ring-border cursor-pointer"
              >
                {PERIODOS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Forma pago</label>
              <select
                value={form.forma_pago}
                onChange={(e) => setForm({ ...form, forma_pago: e.target.value })}
                className="w-full bg-secondary border-0 rounded px-3 py-1.5 text-[12px] ring-1 ring-border cursor-pointer"
              >
                {FORMAS_PAGO.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">IBAN de cargo (opcional)</label>
            <input
              type="text"
              value={form.iban_cargo}
              onChange={(e) => setForm({ ...form, iban_cargo: e.target.value })}
              placeholder="ES00 0000 0000 0000 0000 0000"
              className="w-full bg-secondary border-0 rounded px-3 py-1.5 text-[12px] ring-1 ring-border font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Notas</label>
            <textarea
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              rows={2}
              className="w-full bg-secondary border-0 rounded px-3 py-1.5 text-[12px] ring-1 ring-border"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="text-[12px] py-1.5 px-3 rounded ring-1 ring-border hover:bg-secondary cursor-pointer">Cancelar</button>
            <button type="submit" className="text-[12px] py-1.5 px-3 rounded bg-brand text-brand-foreground hover:brightness-110 cursor-pointer flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5" /> {editId ? "Guardar" : "Crear recibo"}
            </button>
          </div>
        </form>
      </Modal>
    </PageShell>
  );
}
