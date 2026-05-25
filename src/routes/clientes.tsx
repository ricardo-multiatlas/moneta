import { createFileRoute } from "@tanstack/react-router";
import { Filter, Download, Plus } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, MoneyEUR, StatusBadge } from "@/components/app/ui-bits";
import { clientes } from "@/lib/demo-data";

export const Route = createFileRoute("/clientes")({
  component: ClientesPage,
  head: () => ({ meta: [{ title: "Clientes · Correduría OS" }] }),
});

function ClientesPage() {
  return (
    <PageShell
      title="Clientes"
      subtitle="Ficha 360° con todas las pólizas, comunicaciones y vencimientos por cliente."
      action={
        <div className="flex items-center gap-2">
          <button className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5">
            <Filter className="size-3.5" /> Filtrar
          </button>
          <button className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5">
            <Download className="size-3.5" /> Exportar
          </button>
          <button className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 flex items-center gap-1.5">
            <Plus className="size-3.5" /> Nuevo cliente
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-4 gap-3 mb-6">
        <Card className="p-4">
          <div className="text-[10px] text-ink-subtle uppercase tracking-widest font-medium mb-1">Total clientes</div>
          <div className="text-xl font-semibold font-display">{clientes.length * 128}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] text-ink-subtle uppercase tracking-widest font-medium mb-1">Particulares</div>
          <div className="text-xl font-semibold font-display">{clientes.filter((c) => c.tipo === "Particular").length * 142}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] text-ink-subtle uppercase tracking-widest font-medium mb-1">Empresas</div>
          <div className="text-xl font-semibold font-display">{clientes.filter((c) => c.tipo === "Empresa").length * 88}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] text-ink-subtle uppercase tracking-widest font-medium mb-1">Riesgo fuga</div>
          <div className="text-xl font-semibold font-display text-danger">7</div>
        </Card>
      </div>

      <Card>
        <div className="px-4 py-3 border-b border-border flex items-center gap-3">
          <input
            type="text"
            placeholder="Buscar por nombre, NIF, email…"
            className="flex-1 bg-secondary border-0 rounded px-3 py-1.5 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none"
          />
          <div className="flex items-center gap-1 text-[11px] text-ink-subtle">
            <span>Mostrando 1-{clientes.length} de 1.284</span>
          </div>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-secondary/40 border-b border-border">
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Cliente</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">NIF</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Comercial</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Pólizas</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Prima anual</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
              <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Último contacto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {clientes.map((c) => {
              const initials = c.nombre.split(/[\s,]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
              const tone = c.estado === "Al día" ? "success" : c.estado === "Pendiente doc." ? "warning" : c.estado === "Riesgo fuga" ? "danger" : "info";
              return (
                <tr key={c.id} className="hover:bg-secondary/30 transition-colors cursor-pointer">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="size-8 rounded-md bg-brand-soft text-brand grid place-items-center text-[10px] font-semibold">{initials}</div>
                      <div>
                        <div className="text-[12.5px] font-medium">{c.nombre}</div>
                        <div className="text-[10px] text-ink-subtle">{c.ciudad} · {c.tipo}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[11px] font-mono text-ink-muted">{c.nif}</td>
                  <td className="px-4 py-3 text-[12px] text-ink-muted">{c.comercial}</td>
                  <td className="px-4 py-3 text-[12px] font-mono">{c.polizasActivas}</td>
                  <td className="px-4 py-3 text-[12px]"><MoneyEUR value={c.primaAnual} /></td>
                  <td className="px-4 py-3"><StatusBadge tone={tone}>{c.estado}</StatusBadge></td>
                  <td className="px-4 py-3 text-right text-[11px] text-ink-muted">{c.ultimoContacto}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </PageShell>
  );
}
