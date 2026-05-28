import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, SectionHeader } from "@/components/app/ui-bits";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/use-permissions";
import { useDialog } from "@/components/app/dialog-provider";

export const Route = createFileRoute("/mi-panel/disponibilidad")({
  component: DisponibilidadPage,
  head: () => ({ meta: [{ title: "Mi disponibilidad · Correduría OS" }] }),
});

const TIPOS = [
  { key: "disponible", label: "Disponible", tone: "bg-success/10 text-success ring-success/20" },
  { key: "ocupado", label: "Ocupado", tone: "bg-warning/10 text-warning ring-warning/25" },
  { key: "reunion", label: "Reunión", tone: "bg-info/10 text-info ring-info/20" },
  { key: "vacaciones", label: "Vacaciones", tone: "bg-brand-soft text-brand ring-brand/20" },
  { key: "baja", label: "Baja", tone: "bg-danger/10 text-danger ring-danger/20" },
];

interface DiaRow {
  fecha: string;
  tipo: string;
  nota: string;
  id?: string;
  dirty?: boolean;
}

function DisponibilidadPage() {
  const { perfil, loading } = usePermissions();
  const { toast } = useDialog();
  const [dias, setDias] = useState<DiaRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!perfil) return;
    (async () => {
      const today = new Date();
      const lista: DiaRow[] = [];
      for (let i = 0; i < 30; i++) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
        lista.push({ fecha: d.toISOString().split("T")[0], tipo: "disponible", nota: "" });
      }
      const desde = lista[0].fecha;
      const hasta = lista[lista.length - 1].fecha;
      const { data } = await supabase
        .from("disponibilidad")
        .select("id, fecha, tipo, nota")
        .eq("comercial_id", perfil.id)
        .gte("fecha", desde)
        .lte("fecha", hasta);
      const map = new Map<string, any>();
      (data || []).forEach((r: any) => map.set(r.fecha, r));
      const merged = lista.map((d) => {
        const found = map.get(d.fecha);
        if (found) return { ...d, tipo: found.tipo, nota: found.nota || "", id: found.id };
        return d;
      });
      setDias(merged);
    })();
  }, [perfil]);

  const cambiar = (idx: number, campo: "tipo" | "nota", valor: string) => {
    setDias((prev) => prev.map((d, i) => i === idx ? { ...d, [campo]: valor, dirty: true } : d));
  };

  const guardar = async () => {
    if (!perfil) return;
    setBusy(true);
    const dirties = dias.filter((d) => d.dirty);
    for (const d of dirties) {
      if (d.id) {
        await supabase.from("disponibilidad").update({ tipo: d.tipo, nota: d.nota || null }).eq("id", d.id);
      } else {
        await supabase.from("disponibilidad").insert({
          comercial_id: perfil.id,
          fecha: d.fecha,
          tipo: d.tipo,
          nota: d.nota || null,
        });
      }
    }
    setBusy(false);
    toast(`${dirties.length} día(s) guardados`, "success");
    setDias((prev) => prev.map((d) => ({ ...d, dirty: false })));
  };

  if (loading) return <PageShell title="Mi disponibilidad"><Card className="p-8 text-center text-[13px] text-ink-subtle">Cargando…</Card></PageShell>;

  return (
    <PageShell
      title="Mi disponibilidad"
      subtitle="Marca tu disponibilidad por día. Tu jefe de zona y los compañeros la pueden ver para coordinarse."
      action={
        <div className="flex items-center gap-2">
          <Link to="/mi-panel" className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
            <ArrowLeft className="size-3.5" /> Volver
          </Link>
          <button
            type="button"
            onClick={guardar}
            disabled={busy || !dias.some((d) => d.dirty)}
            className="text-[12px] py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            <Save className="size-3.5" /> {busy ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      }
    >
      <Card>
        <SectionHeader title="Próximos 30 días" hint={`${dias.filter(d => d.dirty).length} cambios sin guardar`} />
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-secondary/40 border-b border-border">
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Fecha</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Disponibilidad</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Nota</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {dias.map((d, idx) => {
              const date = new Date(d.fecha + "T00:00:00");
              const finde = date.getDay() === 0 || date.getDay() === 6;
              return (
                <tr key={d.fecha} className={["hover:bg-secondary/30", finde ? "bg-secondary/10" : ""].join(" ")}>
                  <td className="px-4 py-2 text-[12px] font-mono">
                    {date.toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "short" })}
                  </td>
                  <td className="px-4 py-2">
                    <select
                      title="Tipo"
                      value={d.tipo}
                      onChange={(e) => cambiar(idx, "tipo", e.target.value)}
                      className="text-[11px] py-1 px-2 rounded bg-secondary border-0 ring-1 ring-border focus:ring-brand/30 outline-none cursor-pointer"
                    >
                      {TIPOS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      title="Nota"
                      placeholder="—"
                      value={d.nota}
                      onChange={(e) => cambiar(idx, "nota", e.target.value)}
                      className="w-full text-[11px] py-1 px-2 rounded bg-secondary border-0 ring-1 ring-border focus:ring-brand/30 outline-none"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </PageShell>
  );
}
