import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, X, ShieldCheck } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { Card, KpiCard, SectionHeader, StatusBadge, type StatusTone } from "@/components/app/ui-bits";
import { RowActions } from "@/components/app/row-actions";
import { DetailModal } from "@/components/app/detail-modal";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/use-permissions";
import { useDialog } from "@/components/app/dialog-provider";
import { auditMutate } from "@/lib/audit-mutate";

export const Route = createFileRoute("/aprobaciones")({
  component: AprobacionesPage,
  head: () => ({ meta: [{ title: "Aprobaciones · Correduría OS" }] }),
});

const TIPO_LABEL: Record<string, string> = {
  desactivar_comercial: "Desactivar comercial",
  eliminar_cliente: "Eliminar cliente",
  cambio_rol: "Cambio de rol",
  otro: "Otro",
};

const ESTADO_TONE: Record<string, StatusTone> = {
  pendiente: "warning",
  aprobada: "success",
  rechazada: "danger",
};

function AprobacionesPage() {
  const { esRoot, esJefeZona, esSecretaria, esComercial, perfil, loading } = usePermissions();
  const { toast, confirm, prompt } = useDialog();
  const [items, setItems] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(true);
  const [verOpen, setVerOpen] = useState<any>(null);

  const cargar = async () => {
    setBusy(true);
    let aprMissing = false;
    let aprData: any[] = [];
    try {
      let q = supabase
        .from("aprobaciones")
        .select(
          "id, tipo, solicitante_id, target_user_id, target_cliente_id, payload, motivo, estado, resuelto_por, resuelto_at, comentario_resolucion, created_at, solicitante:usuarios!aprobaciones_solicitante_id_fkey(nombre, email), resolver:usuarios!aprobaciones_resuelto_por_fkey(nombre)"
        )
        .order("created_at", { ascending: false });
      // Si no es root, solo las que solicitó este usuario
      if (!esRoot && perfil?.id) {
        q = q.eq("solicitante_id", perfil.id);
      }
      const { data, error } = await q;
      if (error) {
        // Si el join con foreign key da error pero la tabla existe, intentar select simple
        const simple = await supabase.from("aprobaciones").select("*").order("created_at", { ascending: false });
        if (simple.error) aprMissing = true;
        else aprData = simple.data || [];
      } else {
        aprData = data || [];
      }
    } catch {
      aprMissing = true;
    }

    const [{ data: us }, { data: cl }] = await Promise.all([
      supabase.from("usuarios").select("id, nombre, email, rol"),
      supabase.from("clientes").select("id, nombre_razon_social"),
    ]);

    setItems(aprData);
    setUsuarios(us || []);
    setClientes(cl || []);
    setMissing(aprMissing);
    setBusy(false);
  };

  useEffect(() => {
    cargar();
  }, [esRoot, perfil?.id]);

  if (!loading && esComercial) {
    return (
      <PageShell title="Sin acceso">
        <Card className="p-8 text-center text-[13px] text-ink-subtle">
          Esta sección no está disponible para tu rol.
        </Card>
      </PageShell>
    );
  }

  if (busy) {
    return (
      <PageShell title="Aprobaciones">
        <Card className="p-8 text-center text-[13px] text-ink-subtle">Cargando…</Card>
      </PageShell>
    );
  }

  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

  const pendientes = items.filter((i) => i.estado === "pendiente").length;
  const aprobadasMes = items.filter(
    (i) => i.estado === "aprobada" && new Date(i.resuelto_at || i.created_at) >= inicioMes
  ).length;
  const rechazadasMes = items.filter(
    (i) => i.estado === "rechazada" && new Date(i.resuelto_at || i.created_at) >= inicioMes
  ).length;

  const nombreUsuario = (id: string | null) => usuarios.find((u) => u.id === id)?.nombre || "—";
  const nombreCliente = (id: string | null) => clientes.find((c) => c.id === id)?.nombre_razon_social || "—";

  const targetLabel = (a: any) => {
    if (a.target_user_id) return `Usuario: ${nombreUsuario(a.target_user_id)}`;
    if (a.target_cliente_id) return `Cliente: ${nombreCliente(a.target_cliente_id)}`;
    return "—";
  };

  const aplicarCambio = async (a: any): Promise<{ ok: boolean; error?: string }> => {
    try {
      if (a.tipo === "desactivar_comercial" && a.target_user_id) {
        const { error } = await supabase.from("usuarios").update({ activo: false }).eq("id", a.target_user_id);
        if (error) return { ok: false, error: error.message };
      } else if (a.tipo === "eliminar_cliente" && a.target_cliente_id) {
        const { error } = await supabase.from("clientes").delete().eq("id", a.target_cliente_id);
        if (error) return { ok: false, error: error.message };
      } else if (a.tipo === "cambio_rol" && a.target_user_id) {
        const nuevoRol = a.payload?.nuevo_rol;
        if (!nuevoRol) return { ok: false, error: "Falta nuevo_rol en payload" };
        const { error } = await supabase.from("usuarios").update({ rol: nuevoRol }).eq("id", a.target_user_id);
        if (error) return { ok: false, error: error.message };
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  };

  const aprobar = async (a: any) => {
    const ok = await confirm({
      title: "Aprobar solicitud",
      message: `¿Aprobar "${TIPO_LABEL[a.tipo] || a.tipo}" sobre ${targetLabel(a)}? El cambio se aplicará inmediatamente.`,
      tone: "brand",
    });
    if (!ok) return;
    const aplicado = await aplicarCambio(a);
    if (!aplicado.ok) {
      toast("Error aplicando cambio: " + (aplicado.error || ""), "error");
      return;
    }
    const { error } = await supabase
      .from("aprobaciones")
      .update({
        estado: "aprobada",
        resuelto_por: perfil?.id || null,
        resuelto_at: new Date().toISOString(),
      })
      .eq("id", a.id);
    if (error) toast("Error: " + error.message, "error");
    else {
      toast("Solicitud aprobada y cambio aplicado", "success");
      cargar();
    }
  };

  const rechazar = async (a: any) => {
    const motivo = await prompt({
      title: "Rechazar solicitud",
      message: "Motivo del rechazo (visible para el solicitante):",
      inputType: "text",
      validate: (v) => (v.trim().length < 3 ? "Indica al menos 3 caracteres" : null),
    });
    if (motivo === null) return;
    const { error } = await supabase
      .from("aprobaciones")
      .update({
        estado: "rechazada",
        resuelto_por: perfil?.id || null,
        resuelto_at: new Date().toISOString(),
        comentario_resolucion: motivo,
      })
      .eq("id", a.id);
    if (error) toast("Error: " + error.message, "error");
    else {
      toast("Solicitud rechazada", "info");
      cargar();
    }
  };

  return (
    <PageShell
      title="Aprobaciones"
      subtitle={
        esRoot
          ? "Revisa y resuelve las solicitudes pendientes."
          : esJefeZona || esSecretaria
            ? "Estado de tus solicitudes enviadas a root."
            : ""
      }
    >
      {missing && (
        <div className="mb-5 rounded-md bg-warning/5 ring-1 ring-warning/30 px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
          <div className="text-[12px] text-warning">
            <p className="font-medium">Migración v0.8 pendiente</p>
            <p className="mt-0.5 text-ink-muted">
              La tabla <code className="font-mono">aprobaciones</code> aún no existe. Aplica el SQL en{" "}
              <code className="font-mono">supabase/APLICAR_EN_SQL_EDITOR_v4.sql</code>.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <KpiCard label="Pendientes" value={String(pendientes)} hint="Esperan resolución" deltaTone={pendientes > 0 ? "warning" : "success"} />
        <KpiCard label="Aprobadas (mes)" value={String(aprobadasMes)} hint={inicioMes.toLocaleDateString("es-ES", { month: "long" })} />
        <KpiCard label="Rechazadas (mes)" value={String(rechazadasMes)} hint={inicioMes.toLocaleDateString("es-ES", { month: "long" })} deltaTone="danger" />
      </div>

      <Card>
        <div className="px-4 py-3 border-b border-border">
          <SectionHeader
            title={`${items.length} solicitud${items.length === 1 ? "" : "es"}`}
            hint={esRoot ? "Como root puedes aprobar o rechazar" : "Solo lectura"}
          />
        </div>
        {items.length === 0 ? (
          <div className="p-10 text-center text-[12px] text-ink-subtle">
            <ShieldCheck className="size-6 text-ink-subtle mx-auto mb-2" />
            {missing ? "Aplica primero la migración v0.8." : "No hay solicitudes."}
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Solicitante</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Objetivo</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Motivo</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Estado</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Creada</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Resuelta por</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-ink-subtle uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((a: any) => (
                <tr key={a.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-[12px] font-medium">{TIPO_LABEL[a.tipo] || a.tipo}</td>
                  <td className="px-4 py-3 text-[11.5px] text-ink-muted">
                    {a.solicitante?.nombre || nombreUsuario(a.solicitante_id)}
                  </td>
                  <td className="px-4 py-3 text-[11.5px] text-ink-muted">{targetLabel(a)}</td>
                  <td className="px-4 py-3 text-[11.5px] text-ink-muted truncate max-w-[240px]" title={a.motivo}>
                    {a.motivo}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={ESTADO_TONE[a.estado] || "neutral"}>{a.estado}</StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-[11px] font-mono text-ink-muted whitespace-nowrap">
                    {new Date(a.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-[11.5px] text-ink-muted">
                    {a.resolver?.nombre || nombreUsuario(a.resuelto_por) || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {esRoot && a.estado === "pendiente" ? (
                      <RowActions
                        actions={[
                          { icon: "view", label: "Ver detalle", onClick: () => setVerOpen(a) },
                          { icon: "check", label: "Aprobar", onClick: () => aprobar(a), tone: "brand" },
                          { icon: "x", label: "Rechazar", onClick: () => rechazar(a), tone: "danger" },
                        ]}
                      />
                    ) : (
                      <RowActions
                        actions={[
                          { icon: "view", label: "Ver detalle", onClick: () => setVerOpen(a) },
                        ]}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <DetailModal
        isOpen={!!verOpen}
        onClose={() => setVerOpen(null)}
        title={verOpen ? TIPO_LABEL[verOpen.tipo] || verOpen.tipo : ""}
        subtitle="Solicitud de aprobación"
        rows={
          verOpen
            ? [
                { label: "Solicitante", value: verOpen.solicitante?.nombre || nombreUsuario(verOpen.solicitante_id) },
                { label: "Objetivo", value: targetLabel(verOpen) },
                { label: "Motivo", value: verOpen.motivo },
                { label: "Estado", value: <StatusBadge tone={ESTADO_TONE[verOpen.estado] || "neutral"}>{verOpen.estado}</StatusBadge> },
                { label: "Creada", value: new Date(verOpen.created_at).toLocaleString() },
                {
                  label: "Resuelta",
                  value: verOpen.resuelto_at ? new Date(verOpen.resuelto_at).toLocaleString() : "Pendiente",
                },
                { label: "Resuelta por", value: verOpen.resolver?.nombre || nombreUsuario(verOpen.resuelto_por) },
                { label: "Comentario", value: verOpen.comentario_resolucion || "—" },
                {
                  label: "Payload",
                  value: verOpen.payload ? (
                    <code className="font-mono text-[10.5px]">{JSON.stringify(verOpen.payload)}</code>
                  ) : (
                    "—"
                  ),
                },
              ]
            : []
        }
      />

      {/* Iconos importados pero usados sólo como semántica */}
      <Check className="hidden" />
      <X className="hidden" />
    </PageShell>
  );
}
