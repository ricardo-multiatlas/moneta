import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Filter, Download, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { PageShell } from "@/components/app/page-shell";
import { Card, MoneyEUR, StatusBadge, Modal } from "@/components/app/ui-bits";
import { RowActions } from "@/components/app/row-actions";
import { DetailModal } from "@/components/app/detail-modal";
import { supabase } from "@/lib/supabase";
import { exportarExcel } from "@/lib/exportar";
import { generarFichaPDF, descargarBlob, imprimirBlob } from "@/lib/generic-pdf";
import { useDialog } from "@/components/app/dialog-provider";

export const Route = createFileRoute("/clientes")({
  component: ClientesPage,
  head: () => ({ meta: [{ title: "Clientes · Correduría OS" }] }),
  loader: async () => {
    const { data: clientes, error } = await supabase
      .from("clientes")
      .select(`
        id,
        tipo,
        nombre_razon_social,
        nif_cif,
        email,
        telefono,
        direccion,
        estado,
        created_at,
        comercial:usuarios!clientes_comercial_asignado_id_fkey(nombre),
        polizas(id, prima_anual, estado)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error cargando clientes:", error);
      return { clientes: [] };
    }

    const adaptedClientes = (clientes || []).map((c: any) => {
      const polizasActivas = (c.polizas || []).filter((p: any) => p.estado === "activa");
      const primaAnual = polizasActivas.reduce((s: number, p: any) => s + Number(p.prima_anual || 0), 0);
      return {
        id: c.id,
        nombre: c.nombre_razon_social,
        tipo: c.tipo,
        nif: c.nif_cif || "—",
        email: c.email || "",
        telefono: c.telefono || "",
        ciudad: c.direccion?.ciudad || "—",
        comercial: c.comercial?.nombre || "Sin asignar",
        polizasActivas: polizasActivas.length,
        primaAnual,
        estado: c.estado || "Activo",
      };
    });

    return { clientes: adaptedClientes };
  },
});

interface FormCliente {
  nombre_razon_social: string;
  nif_cif: string;
  email: string;
  telefono: string;
  tipo: string;
}

const emptyForm: FormCliente = { nombre_razon_social: "", nif_cif: "", email: "", telefono: "", tipo: "particular" };

function ClientesPage() {
  const { clientes } = Route.useLoaderData();
  const router = useRouter();
  const { toast } = useDialog();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<string>("");
  const [formData, setFormData] = useState<FormCliente>(emptyForm);

  const abrirNuevo = () => {
    setEditId(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const abrirEdicion = (c: any) => {
    setEditId(c.id);
    setFormData({
      nombre_razon_social: c.nombre,
      nif_cif: c.nif === "—" ? "" : c.nif,
      email: c.email || "",
      telefono: c.telefono || "",
      tipo: c.tipo,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const payload = {
      nombre_razon_social: formData.nombre_razon_social,
      nif_cif: formData.nif_cif || null,
      email: formData.email || null,
      telefono: formData.telefono || null,
      tipo: formData.tipo,
    };
    const { error } = editId
      ? await supabase.from("clientes").update(payload).eq("id", editId)
      : await supabase.from("clientes").insert({ ...payload, estado: "Activo" });

    setIsSubmitting(false);
    if (error) {
      toast("Error: " + error.message, "error");
    } else {
      setIsModalOpen(false);
      setFormData(emptyForm);
      setEditId(null);
      router.invalidate();
    }
  };

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clientes.filter((c: any) => {
      if (tipoFiltro && c.tipo?.toLowerCase() !== tipoFiltro) return false;
      if (!q) return true;
      return (
        c.nombre?.toLowerCase().includes(q) ||
        c.nif?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.telefono?.toLowerCase().includes(q)
      );
    });
  }, [clientes, search, tipoFiltro]);

  const exportarXLSX = () => {
    if (filtrados.length === 0) {
      toast("No hay clientes que exportar.", "warning");
      return;
    }
    const rows = filtrados.map((c: any) => ({
      Nombre: c.nombre,
      Tipo: c.tipo,
      "NIF/CIF": c.nif,
      Email: c.email,
      Teléfono: c.telefono,
      "Pólizas activas": c.polizasActivas,
      "Prima anual (€)": Number(c.primaAnual.toFixed(2)),
      Estado: c.estado,
    }));
    exportarExcel(`clientes_${new Date().toISOString().slice(0, 10)}.xlsx`, "Clientes", rows);
  };

  const buildFichaPDF = (c: any) => {
    return generarFichaPDF({
      titulo: `Cliente: ${c.nombre}`,
      subtitulo: `${c.tipo === "empresa" ? "Empresa" : "Particular"} · NIF/CIF ${c.nif}`,
      bloques: [
        {
          titulo: "Datos de contacto",
          filas: [
            ["Email", c.email || "—"],
            ["Teléfono", c.telefono || "—"],
            ["Ciudad", c.ciudad || "—"],
            ["Comercial asignado", c.comercial],
            ["Estado", c.estado],
          ],
        },
        {
          titulo: "Cartera",
          filas: [
            ["Pólizas activas", c.polizasActivas],
            ["Prima anual total", `${c.primaAnual.toFixed(2)} €`],
          ],
        },
      ],
    });
  };

  const descargarFicha = (c: any) => {
    const blob = buildFichaPDF(c);
    descargarBlob(blob, `cliente_${c.nif === "—" ? c.id.slice(0, 8) : c.nif}.pdf`);
  };

  const imprimirFicha = (c: any) => {
    const blob = buildFichaPDF(c);
    imprimirBlob(blob);
  };

  return (
    <PageShell
      title="Clientes"
      subtitle="Ficha 360° con todas las pólizas, comunicaciones y vencimientos por cliente."
      action={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 ring-1 ring-border rounded-md px-2 py-1 bg-surface">
            <Filter className="size-3.5 text-ink-subtle" />
            <label className="text-[11px] text-ink-subtle">Tipo:</label>
            <select
              title="Filtrar por tipo de cliente"
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value)}
              className="text-[12px] font-medium bg-transparent border-0 outline-none cursor-pointer pr-1"
            >
              <option value="">Todos</option>
              <option value="particular">Particulares</option>
              <option value="empresa">Empresas</option>
            </select>
          </div>
          <button
            type="button"
            title="Exportar lista a Excel"
            onClick={exportarXLSX}
            className="text-[12px] font-medium py-1.5 px-2.5 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="size-3.5" /> Excel
          </button>
          <button type="button" onClick={abrirNuevo} className="text-[12px] font-medium py-1.5 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 flex items-center gap-1.5 cursor-pointer">
            <Plus className="size-3.5" /> Nuevo cliente
          </button>
        </div>
      }
    >
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editId ? "Editar cliente" : "Nuevo Cliente"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-ink-subtle mb-1">Nombre / Razón Social</label>
            <input required value={formData.nombre_razon_social} onChange={e => setFormData({...formData, nombre_razon_social: e.target.value})} type="text" placeholder="Nombre o razón social" className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">NIF / CIF</label>
              <input value={formData.nif_cif} onChange={e => setFormData({...formData, nif_cif: e.target.value})} type="text" placeholder="12345678A" className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Tipo</label>
              <select title="Tipo" value={formData.tipo} onChange={e => setFormData({...formData, tipo: e.target.value})} className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none">
                <option value="particular">Particular</option>
                <option value="empresa">Empresa</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Email</label>
              <input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} type="email" placeholder="cliente@email.com" className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Teléfono</label>
              <input value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} type="tel" placeholder="+34..." className="w-full bg-secondary border-0 rounded px-3 py-2 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none" />
            </div>
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setIsModalOpen(false)} className="text-[12px] font-medium py-1.5 px-4 rounded-md ring-1 ring-border hover:bg-secondary cursor-pointer">Cancelar</button>
            <button type="submit" disabled={isSubmitting} className="text-[12px] font-medium py-1.5 px-4 rounded-md bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50">
              {isSubmitting ? "Guardando..." : editId ? "Guardar cambios" : "Guardar Cliente"}
            </button>
          </div>
        </form>
      </Modal>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <Card className="p-4">
          <div className="text-[10px] text-ink-subtle uppercase tracking-widest font-medium mb-1">Total clientes</div>
          <div className="text-xl font-semibold font-display">{clientes.length || 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] text-ink-subtle uppercase tracking-widest font-medium mb-1">Particulares</div>
          <div className="text-xl font-semibold font-display">{clientes.filter((c: any) => c.tipo?.toLowerCase() === "particular").length || 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] text-ink-subtle uppercase tracking-widest font-medium mb-1">Empresas</div>
          <div className="text-xl font-semibold font-display">{clientes.filter((c: any) => c.tipo?.toLowerCase() === "empresa").length || 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] text-ink-subtle uppercase tracking-widest font-medium mb-1">Prima total cartera</div>
          <div className="text-xl font-semibold font-display"><MoneyEUR value={clientes.reduce((s: number, c: any) => s + c.primaAnual, 0)} /></div>
        </Card>
      </div>

      <Card>
        <div className="px-4 py-3 border-b border-border flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, NIF, email…"
            className="flex-1 bg-secondary border-0 rounded px-3 py-1.5 text-[12px] ring-1 ring-border focus:ring-brand/30 outline-none"
          />
          <div className="flex items-center gap-1 text-[11px] text-ink-subtle">
            <span>Mostrando {filtrados.length} de {clientes.length}</span>
          </div>
        </div>

        {filtrados.length === 0 ? (
          <div className="p-8 text-center text-ink-subtle text-sm">
            {clientes.length === 0
              ? 'No hay clientes creados. Haz clic en "Nuevo cliente".'
              : "Ningún cliente coincide con el filtro."}
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Cliente</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">NIF/CIF</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Comercial</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Pólizas</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Prima anual</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtrados.map((c: any) => {
                const initials = c.nombre.split(/[\s,]+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
                const tone = c.estado === "Activo" ? "success" : c.estado === "Pendiente doc." ? "warning" : c.estado === "Riesgo fuga" ? "danger" : "neutral";
                return (
                  <tr key={c.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="size-8 rounded-md bg-brand-soft text-brand grid place-items-center text-[10px] font-semibold">{initials}</div>
                        <div>
                          <div className="text-[12.5px] font-medium">{c.nombre}</div>
                          <div className="text-[10px] text-ink-subtle capitalize">{c.ciudad} · {c.tipo}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono text-ink-muted">{c.nif}</td>
                    <td className="px-4 py-3 text-[12px] text-ink-muted">{c.comercial}</td>
                    <td className="px-4 py-3 text-[12px] font-mono">{c.polizasActivas}</td>
                    <td className="px-4 py-3 text-[12px]"><MoneyEUR value={c.primaAnual} /></td>
                    <td className="px-4 py-3"><StatusBadge tone={tone as any}>{c.estado}</StatusBadge></td>
                    <td className="px-4 py-3">
                      <RowActions
                        actions={[
                          { icon: "view", label: "Ver datos", onClick: () => setViewing(c), tone: "brand" },
                          { icon: "edit", label: "Editar", onClick: () => abrirEdicion(c) },
                          { icon: "print", label: "Imprimir ficha", onClick: () => imprimirFicha(c) },
                          { icon: "download", label: "Descargar PDF", onClick: () => descargarFicha(c) },
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
        subtitle={viewing ? `${viewing.tipo === "empresa" ? "Empresa" : "Particular"} · ${viewing.nif}` : undefined}
        rows={viewing ? [
          { label: "Email", value: viewing.email || "—" },
          { label: "Teléfono", value: viewing.telefono || "—" },
          { label: "Ciudad", value: viewing.ciudad },
          { label: "Comercial", value: viewing.comercial },
          { label: "Pólizas activas", value: viewing.polizasActivas },
          { label: "Prima anual", value: <MoneyEUR value={viewing.primaAnual} /> },
          { label: "Estado", value: <StatusBadge tone={viewing.estado === "Activo" ? "success" : "neutral"}>{viewing.estado}</StatusBadge> },
        ] : []}
        fullViewTo="/clientes/$id"
        fullViewParams={viewing ? { id: viewing.id } : undefined}
      />
    </PageShell>
  );
}
