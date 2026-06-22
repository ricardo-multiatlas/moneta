import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Upload, CheckCircle2, XCircle, Sparkles, FileText, Wand2 } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, KpiCard, MoneyEUR, SectionHeader, StatusBadge, type StatusTone } from "@/components/app/ui-bits";
import { supabase } from "@/lib/supabase";
import { useDialog } from "@/components/app/dialog-provider";
import {
  parseN43,
  scoreMatch,
  type MovimientoN43,
  type N43Fichero,
  type ReciboPendiente,
} from "@/lib/n43-parser";

export const Route = createFileRoute("/conciliacion-bancaria")({
  component: ConciliacionBancariaPage,
  head: () => ({ meta: [{ title: "Conciliacion bancaria · Correduría OS" }] }),
});

type EstadoMatch = "propuesto" | "dudoso" | "confirmado" | "rechazado";

interface MatchPropuesto {
  movimientoId: string;
  reciboId: string;
  score: number;
  estado: EstadoMatch;
}

const ESTADO_MATCH_TONE: Record<EstadoMatch, StatusTone> = {
  propuesto: "info",
  dudoso: "warning",
  confirmado: "success",
  rechazado: "danger",
};

function genUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback razonable
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function truncar(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.substring(0, n - 1) + "…" : s;
}

function ConciliacionBancariaPage() {
  const { toast, confirm } = useDialog();

  const [fichero, setFichero] = useState<N43Fichero | null>(null);
  const [movimientos, setMovimientos] = useState<MovimientoN43[]>([]);
  const [recibos, setRecibos] = useState<ReciboPendiente[]>([]);
  const [matches, setMatches] = useState<MatchPropuesto[]>([]);
  const [movSeleccionado, setMovSeleccionado] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  // ------------------------------------------------------------
  // Carga inicial de recibos pendientes/vencidos
  // ------------------------------------------------------------
  const cargarRecibos = async () => {
    setBusy(true);
    const { data, error } = await supabase
      .from("recibos")
      .select(`
        id, importe, fecha_emision, numero_recibo,
        polizas(numero_poliza),
        clientes(nombre_razon_social, nif_cif)
      `)
      .in("estado", ["pendiente", "vencido"])
      .order("fecha_emision", { ascending: true });
    if (error) {
      toast("Error cargando recibos: " + error.message, "error");
      setBusy(false);
      return;
    }
    const lista: ReciboPendiente[] = (data || []).map((r: any) => ({
      id: r.id,
      importe: Number(r.importe),
      fechaVencimiento: r.fecha_emision,
      nifTomador: r.clientes?.nif_cif || undefined,
      nombreTomador: r.clientes?.nombre_razon_social || undefined,
      numeroRecibo: r.numero_recibo || undefined,
      numeroPoliza: r.polizas?.numero_poliza || undefined,
    }));
    setRecibos(lista);
    setBusy(false);
  };

  useEffect(() => {
    cargarRecibos();
  }, []);

  // ------------------------------------------------------------
  // Subida y parseo del fichero N43
  // ------------------------------------------------------------
  const onFile = async (file: File) => {
    setUploading(true);
    try {
      const text = await file.text();
      const parsed = parseN43(text);
      if (parsed.movimientos.length === 0) {
        toast("El fichero no contiene movimientos validos", "warning");
        setUploading(false);
        return;
      }
      setFichero(parsed);
      setMovimientos(parsed.movimientos);
      setMatches([]);
      setMovSeleccionado(null);

      // Persistir en DB con un import_id comun
      const importId = genUuid();
      const rows = parsed.movimientos.map((m) => ({
        import_id: importId,
        hash_idem: m.id,
        fecha_operacion: m.fechaOperacion,
        fecha_valor: m.fechaValor,
        signo: m.signo,
        importe: m.importe,
        codigo_comun: m.codigoComun,
        concepto: m.concepto || null,
        referencia1: m.referencia1 || null,
        referencia2: m.referencia2 || null,
      }));
      const { error } = await supabase
        .from("movimientos_n43")
        .upsert(rows, { onConflict: "hash_idem", ignoreDuplicates: true });
      if (error) {
        toast("Error guardando movimientos: " + error.message, "error");
      } else {
        toast(`${parsed.movimientos.length} movimientos importados`, "success");
      }
    } catch (e: any) {
      toast("Error procesando fichero: " + (e?.message || String(e)), "error");
    } finally {
      setUploading(false);
    }
  };

  const onInputFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  // ------------------------------------------------------------
  // Generar matches automaticos
  // ------------------------------------------------------------
  const generarMatchesAuto = () => {
    if (movimientos.length === 0 || recibos.length === 0) {
      toast("Sube un N43 y asegurate de tener recibos pendientes", "warning");
      return;
    }
    const propuestos: MatchPropuesto[] = [];
    for (const mov of movimientos) {
      // Solo movimientos de abono (recibos cobrados normalmente vienen como Haber)
      const candidatos: { reciboId: string; score: number }[] = [];
      for (const rec of recibos) {
        const s = scoreMatch(mov, rec);
        if (s > 0) candidatos.push({ reciboId: rec.id, score: s });
      }
      candidatos.sort((a, b) => b.score - a.score);
      if (candidatos.length === 0) continue;

      const mejor = candidatos[0];
      const esUnico = candidatos.length === 1 || mejor.score - candidatos[1].score >= 15;

      if (mejor.score >= 85 && esUnico) {
        propuestos.push({ movimientoId: mov.id, reciboId: mejor.reciboId, score: mejor.score, estado: "confirmado" });
      } else if (mejor.score >= 65) {
        propuestos.push({ movimientoId: mov.id, reciboId: mejor.reciboId, score: mejor.score, estado: "dudoso" });
      }
      // <65 se ignora
    }
    setMatches(propuestos);
    toast(`${propuestos.length} matches generados`, "success");
  };

  // ------------------------------------------------------------
  // Match manual desde recibo seleccionado
  // ------------------------------------------------------------
  const hacerMatchManual = (reciboId: string) => {
    if (!movSeleccionado) {
      toast("Selecciona primero un movimiento", "warning");
      return;
    }
    const mov = movimientos.find((m) => m.id === movSeleccionado);
    const rec = recibos.find((r) => r.id === reciboId);
    if (!mov || !rec) return;
    const score = scoreMatch(mov, rec);
    const existe = matches.find((x) => x.movimientoId === mov.id && x.reciboId === rec.id);
    if (existe) {
      toast("Ese match ya existe", "info");
      return;
    }
    setMatches([...matches.filter((x) => x.movimientoId !== mov.id), { movimientoId: mov.id, reciboId: rec.id, score, estado: "propuesto" }]);
  };

  // ------------------------------------------------------------
  // Confirmar / Rechazar match
  // ------------------------------------------------------------
  const confirmarMatch = async (m: MatchPropuesto) => {
    const mov = movimientos.find((x) => x.id === m.movimientoId);
    const rec = recibos.find((x) => x.id === m.reciboId);
    if (!mov || !rec) return;

    // Buscar el UUID del movimiento en DB por hash_idem
    const { data: movDb, error: e1 } = await supabase
      .from("movimientos_n43")
      .select("id")
      .eq("hash_idem", mov.id)
      .maybeSingle();
    if (e1 || !movDb) {
      toast("No se encuentra el movimiento en DB. Reimporta el fichero.", "error");
      return;
    }

    // Insertar match confirmado
    const { error: e2 } = await supabase
      .from("movimientos_n43_match")
      .upsert(
        {
          movimiento_id: movDb.id,
          recibo_id: rec.id,
          score: m.score,
          estado: "confirmado",
          confirmado_at: new Date().toISOString(),
        },
        { onConflict: "movimiento_id,recibo_id" }
      );
    if (e2) {
      toast("Error guardando match: " + e2.message, "error");
      return;
    }

    // Marcar recibo como cobrado
    const { error: e3 } = await supabase
      .from("recibos")
      .update({ estado: "cobrado", fecha_cobro: mov.fechaValor })
      .eq("id", rec.id);
    if (e3) {
      toast("Match guardado pero error al cobrar recibo: " + e3.message, "warning");
    } else {
      toast("Match confirmado, recibo cobrado", "success");
    }

    // Refrescar estado local
    setMatches(matches.map((x) =>
      x.movimientoId === m.movimientoId && x.reciboId === m.reciboId
        ? { ...x, estado: "confirmado" }
        : x
    ));
    // Sacar el recibo de la lista de pendientes
    setRecibos(recibos.filter((r) => r.id !== rec.id));
  };

  const rechazarMatch = async (m: MatchPropuesto) => {
    const ok = await confirm({ message: "¿Rechazar este match propuesto?", tone: "danger" });
    if (!ok) return;
    setMatches(matches.map((x) =>
      x.movimientoId === m.movimientoId && x.reciboId === m.reciboId
        ? { ...x, estado: "rechazado" }
        : x
    ));
  };

  // ------------------------------------------------------------
  // Helpers de presentacion
  // ------------------------------------------------------------
  const mejorMatchPorMov = useMemo(() => {
    const map: Record<string, MatchPropuesto> = {};
    for (const m of matches) {
      const prev = map[m.movimientoId];
      if (!prev || m.score > prev.score) map[m.movimientoId] = m;
    }
    return map;
  }, [matches]);

  const kpiTotalAbonos = useMemo(
    () => movimientos.filter((m) => m.signo === "H").reduce((s, m) => s + m.importe, 0),
    [movimientos]
  );
  const kpiTotalCargos = useMemo(
    () => movimientos.filter((m) => m.signo === "D").reduce((s, m) => s + m.importe, 0),
    [movimientos]
  );
  const kpiConfirmados = useMemo(() => matches.filter((m) => m.estado === "confirmado").length, [matches]);
  const kpiDudosos = useMemo(() => matches.filter((m) => m.estado === "dudoso" || m.estado === "propuesto").length, [matches]);

  return (
    <PageShell
      title="Conciliacion bancaria · N43"
      subtitle="Sube el extracto Norma 43 del banco y emparejalo con los recibos pendientes. Auto-confirma los matches de alta confianza."
      action={
        <button
          type="button"
          onClick={generarMatchesAuto}
          disabled={movimientos.length === 0}
          className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Wand2 className="size-3.5" /> Generar matches automaticos
        </button>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Movimientos" value={String(movimientos.length)} hint={fichero?.cabecera.cuenta || "Sin fichero cargado"} />
        <KpiCard label="Total abonos" value={kpiTotalAbonos.toFixed(2) + " €"} deltaTone="success" />
        <KpiCard label="Total cargos" value={kpiTotalCargos.toFixed(2) + " €"} deltaTone="danger" />
        <KpiCard label="Matches" value={`${kpiConfirmados} ✓`} hint={`${kpiDudosos} por revisar`} deltaTone={kpiDudosos > 0 ? "warning" : "success"} />
      </div>

      {/* Subir extracto */}
      <Card className="mb-6">
        <div className="px-4 py-3 border-b border-border">
          <SectionHeader title="Subir extracto N43" hint="Formato CSB-43 AEB, ASCII, 80 caracteres por linea." />
        </div>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="m-4 p-6 border border-dashed border-border rounded-lg text-center bg-secondary/30"
        >
          <Upload className="size-6 text-ink-subtle mx-auto mb-2" />
          <p className="text-[12px] text-ink-muted mb-3">Arrastra el fichero aqui, o</p>
          <label className="inline-flex items-center gap-1.5 text-[12px] font-medium py-1.5 px-3 rounded-md ring-1 ring-border hover:bg-secondary cursor-pointer">
            <FileText className="size-3.5" /> Seleccionar fichero
            <input type="file" accept=".n43,.txt" className="hidden" onChange={onInputFile} disabled={uploading} />
          </label>
          {uploading && <p className="text-[11px] text-ink-subtle mt-3">Procesando…</p>}
          {fichero && (
            <p className="text-[11px] text-ink-subtle mt-3">
              Banco {fichero.cabecera.banco} · Cuenta {fichero.cabecera.cuenta} · {fichero.cabecera.fechaInicio} a {fichero.cabecera.fechaFin} · Saldo final <MoneyEUR value={fichero.saldoFinal} />
            </p>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Movimientos importados */}
        <Card className="lg:col-span-2">
          <div className="px-4 py-3 border-b border-border">
            <SectionHeader title="Movimientos importados" hint="Selecciona uno para hacer match manual." />
          </div>
          {movimientos.length === 0 ? (
            <div className="p-10 text-center text-[12px] text-ink-subtle">
              <Sparkles className="size-6 text-ink-subtle mx-auto mb-2" />
              Sube un fichero N43 para ver los movimientos.
            </div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-surface">
                  <tr className="bg-secondary/40 border-b border-border">
                    <th className="px-3 py-2 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Fecha valor</th>
                    <th className="px-3 py-2 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Concepto</th>
                    <th className="px-3 py-2 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Importe</th>
                    <th className="px-3 py-2 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Match</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {movimientos.map((m) => {
                    const best = mejorMatchPorMov[m.id];
                    const isSel = movSeleccionado === m.id;
                    return (
                      <tr
                        key={m.id}
                        onClick={() => setMovSeleccionado(m.id)}
                        className={`cursor-pointer hover:bg-secondary/40 ${isSel ? "bg-brand-soft/40" : ""}`}
                      >
                        <td className="px-3 py-2 text-[11px] font-mono">{m.fechaValor}</td>
                        <td className="px-3 py-2 text-[11.5px]">
                          <div>{truncar(m.concepto || m.referencia1 || m.referencia2 || "(sin concepto)", 60)}</div>
                          {m.referencia1 && <div className="text-[10px] text-ink-subtle">ref: {m.referencia1}</div>}
                        </td>
                        <td className={`px-3 py-2 text-[12px] text-right font-mono ${m.signo === "H" ? "text-success" : "text-danger"}`}>
                          {m.signo === "H" ? "+" : "-"}<MoneyEUR value={m.importe} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          {best ? (
                            <StatusBadge tone={ESTADO_MATCH_TONE[best.estado]}>
                              {best.score}/100 {best.estado}
                            </StatusBadge>
                          ) : (
                            <span className="text-[10px] text-ink-subtle">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Recibos pendientes */}
        <Card>
          <div className="px-4 py-3 border-b border-border">
            <SectionHeader title="Recibos pendientes" hint={busy ? "Cargando…" : `${recibos.length} pendientes`} />
          </div>
          {recibos.length === 0 ? (
            <div className="p-8 text-center text-[12px] text-ink-subtle">
              {busy ? "Cargando…" : "No hay recibos pendientes."}
            </div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto divide-y divide-border">
              {recibos.map((r) => (
                <div key={r.id} className="px-4 py-2.5 text-[11.5px] flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.nombreTomador || "—"}</div>
                    <div className="text-[10px] text-ink-subtle truncate">
                      {r.numeroRecibo || r.numeroPoliza || r.nifTomador || "—"} · {r.fechaVencimiento}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="font-mono text-[12px]"><MoneyEUR value={r.importe} /></span>
                    <button
                      type="button"
                      onClick={() => hacerMatchManual(r.id)}
                      disabled={!movSeleccionado}
                      className="text-[10px] py-0.5 px-1.5 rounded ring-1 ring-border hover:bg-secondary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Match
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Matches propuestos */}
      <Card>
        <div className="px-4 py-3 border-b border-border">
          <SectionHeader title="Matches propuestos" hint="Confirma o rechaza cada propuesta. Los confirmados marcan el recibo como cobrado." />
        </div>
        {matches.length === 0 ? (
          <div className="p-8 text-center text-[12px] text-ink-subtle">
            Pulsa &laquo;Generar matches automaticos&raquo; o selecciona movimientos y recibos manualmente.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Movimiento</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Recibo</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Importe</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Score</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {matches.map((m) => {
                const mov = movimientos.find((x) => x.id === m.movimientoId);
                const rec = recibos.find((x) => x.id === m.reciboId);
                return (
                  <tr key={`${m.movimientoId}-${m.reciboId}`} className="hover:bg-secondary/30">
                    <td className="px-4 py-3 text-[11.5px]">
                      <div>{mov ? truncar(mov.concepto || mov.referencia1 || "(s/c)", 40) : "?"}</div>
                      <div className="text-[10px] text-ink-subtle font-mono">{mov?.fechaValor}</div>
                    </td>
                    <td className="px-4 py-3 text-[11.5px]">
                      <div>{rec?.nombreTomador || rec?.id.slice(0, 8) || "(cobrado)"}</div>
                      <div className="text-[10px] text-ink-subtle">{rec?.numeroRecibo || rec?.numeroPoliza || "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-right font-mono">
                      {mov && <MoneyEUR value={mov.importe} />}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono">{m.score}/100</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={ESTADO_MATCH_TONE[m.estado]}>{m.estado}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => confirmarMatch(m)}
                          disabled={m.estado === "confirmado" || m.estado === "rechazado"}
                          className="text-[11px] py-1 px-2 rounded bg-success/10 text-success hover:bg-success/20 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
                        >
                          <CheckCircle2 className="size-3" /> Confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => rechazarMatch(m)}
                          disabled={m.estado === "rechazado"}
                          className="text-[11px] py-1 px-2 rounded bg-danger/10 text-danger hover:bg-danger/20 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
                        >
                          <XCircle className="size-3" /> Rechazar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </PageShell>
  );
}
