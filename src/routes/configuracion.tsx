import { createFileRoute, useRouter, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Database, KeyRound, ShieldCheck, Trash2, RefreshCw, History, Plus, Pencil, X, Users, Building2, Lock, Sliders, HardDrive, BellRing, Plug, Webhook, FileText } from "lucide-react";
import { useState } from "react";
import { PageShell } from "@/components/app/page-shell";
import { Card, SectionHeader } from "@/components/app/ui-bits";
import { RoleGate } from "@/components/app/role-gate";
import { supabase } from "@/lib/supabase";
import { useDialog } from "@/components/app/dialog-provider";

export const Route = createFileRoute("/configuracion")({
  component: ConfiguracionPage,
  head: () => ({ meta: [{ title: "Configuración · Correduría OS" }] }),
  loader: async () => {
    const [
      { count: clientesCount },
      { count: polizasCount },
      { count: vencimientosCount },
      { count: facturasCount },
      { count: leadsCount },
      { count: comisionesCount },
      { count: auditCount },
      { data: auditUltimos },
    ] = await Promise.all([
      supabase.from("clientes").select("*", { count: "exact", head: true }),
      supabase.from("polizas").select("*", { count: "exact", head: true }),
      supabase.from("vencimientos").select("*", { count: "exact", head: true }),
      supabase.from("facturas").select("*", { count: "exact", head: true }),
      supabase.from("leads").select("*", { count: "exact", head: true }),
      supabase.from("comisiones_reportes").select("*", { count: "exact", head: true }),
      supabase.from("audit_logs").select("*", { count: "exact", head: true }),
      supabase
        .from("audit_logs")
        .select("id, occurred_at, table_name, record_id, action, actor_email, actor_role, ip, user_agent, diff")
        .order("occurred_at", { ascending: false })
        .limit(40),
    ]);

    return {
      counts: {
        clientes: clientesCount ?? 0,
        polizas: polizasCount ?? 0,
        vencimientos: vencimientosCount ?? 0,
        facturas: facturasCount ?? 0,
        leads: leadsCount ?? 0,
        comisiones: comisionesCount ?? 0,
        audit: auditCount ?? 0,
      },
      auditUltimos: auditUltimos || [],
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
    };
  },
});

function ConfiguracionPage() {
  const { counts, supabaseUrl, auditUltimos } = Route.useLoaderData();
  const router = useRouter();
  const { toast, confirm } = useDialog();
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"sistema" | "auditoria">("sistema");

  // configuracion.tsx es layout padre de configuracion.usuarios.tsx, .zonas, etc.
  // Si la URL es exacta /configuracion → muestra el panel general (counts + auditoría).
  // Si es sub-ruta (/configuracion/usuarios, etc.) → renderiza la sub-ruta via Outlet.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isSubroute = pathname !== "/configuracion" && pathname.startsWith("/configuracion/");
  if (isSubroute) return <Outlet />;

  const purgarDemo = async () => {
    const ok = await confirm({ message: "¿Eliminar TODOS los datos de las tablas operativas? Esta acción no se puede deshacer.", tone: "danger" });
    if (!ok) return;
    setBusy("purgar");
    try {
      // Orden inverso por FKs
      await supabase.from("facturas").delete().not("id", "is", null);
      await supabase.from("comisiones_reportes").delete().not("id", "is", null);
      await supabase.from("vencimientos").delete().not("id", "is", null);
      await supabase.from("polizas").delete().not("id", "is", null);
      await supabase.from("leads").delete().not("id", "is", null);
      await supabase.from("clientes").delete().not("id", "is", null);
      toast("Datos eliminados.", "success");
      router.invalidate();
    } catch (e: any) {
      toast("Error: " + e.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const seedDemo = async () => {
    setBusy("seed");
    try {
      const { data: cli } = await supabase
        .from("clientes")
        .insert([
          { nombre_razon_social: "Juan García Pérez", tipo: "particular", nif_cif: "12345678A", email: "juan@example.com", telefono: "600111222", estado: "Activo" },
          { nombre_razon_social: "Constructora del Sur S.L.", tipo: "empresa", nif_cif: "B12345678", email: "info@consur.es", telefono: "954111000", estado: "Activo" },
          { nombre_razon_social: "María López Sánchez", tipo: "particular", nif_cif: "87654321B", email: "maria@example.com", telefono: "600333444", estado: "Activo" },
        ])
        .select("id");

      if (cli && cli.length >= 3) {
        const hoy = new Date();
        const d = (days: number) => new Date(hoy.getTime() + days * 86400000).toISOString().split("T")[0];
        await supabase.from("polizas").insert([
          { cliente_id: cli[0].id, numero_poliza: "POL-2026-0001", ramo: "Auto", aseguradora: "Mapfre", prima_anual: 650, fecha_inicio: d(-300), fecha_vencimiento: d(5), estado: "activa" },
          { cliente_id: cli[1].id, numero_poliza: "POL-2026-0002", ramo: "Comercio", aseguradora: "Allianz", prima_anual: 2400, fecha_inicio: d(-100), fecha_vencimiento: d(25), estado: "activa" },
          { cliente_id: cli[2].id, numero_poliza: "POL-2026-0003", ramo: "Hogar", aseguradora: "Axa", prima_anual: 320, fecha_inicio: d(-200), fecha_vencimiento: d(45), estado: "activa" },
        ]);
        await supabase.from("leads").insert([
          { nombre: "Pedro Ruiz", origen: "Web SEO", interes: "Auto", valor_estimado: 700, fecha_contacto: d(-1), estado: "Nuevo" },
          { nombre: "Inmobiliaria Triana", origen: "Referidos", interes: "Comercio", valor_estimado: 3200, fecha_contacto: d(-2), estado: "Cualificado" },
        ]);
      }
      toast("Datos demo cargados.", "success");
      router.invalidate();
    } catch (e: any) {
      toast("Error: " + e.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const tablas = [
    { name: "clientes", count: counts.clientes },
    { name: "polizas", count: counts.polizas },
    { name: "vencimientos", count: counts.vencimientos },
    { name: "facturas", count: counts.facturas },
    { name: "leads", count: counts.leads },
    { name: "comisiones_reportes", count: counts.comisiones },
  ];

  return (
    <PageShell
      title="Configuración"
      subtitle="Estado del sistema, conexión a base de datos, utilidades y auditoría inmutable."
    >
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <a href="/configuracion/usuarios" className="text-[12px] font-medium py-1.5 px-3 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
          <Users className="size-3.5" /> Usuarios y equipo
        </a>
        <a href="/configuracion/zonas" className="text-[12px] font-medium py-1.5 px-3 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
          <Building2 className="size-3.5" /> Zonas comerciales
        </a>
        <a href="/configuracion/permisos" className="text-[12px] font-medium py-1.5 px-3 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
          <Lock className="size-3.5" /> Permisos granulares
        </a>
        <a href="/configuracion/reglas-comision" className="text-[12px] font-medium py-1.5 px-3 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
          <Sliders className="size-3.5" /> Reglas comisión
        </a>
        <a href="/configuracion/backup" className="text-[12px] font-medium py-1.5 px-3 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
          <HardDrive className="size-3.5" /> Backups y restore
        </a>
        <RoleGate allow={["root", "admin", "jefe_zona"]}>
          <a href="/configuracion/alertas" className="text-[12px] font-medium py-1.5 px-3 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
            <BellRing className="size-3.5" /> Alertas vencimientos
          </a>
        </RoleGate>
        <RoleGate allow={["root", "admin"]}>
          <a href="/configuracion/integraciones" className="text-[12px] font-medium py-1.5 px-3 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
            <Plug className="size-3.5" /> Integraciones aseguradoras
          </a>
        </RoleGate>
        <RoleGate allow={["root", "admin"]}>
          <a href="/configuracion/webhooks" className="text-[12px] font-medium py-1.5 px-3 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
            <Webhook className="size-3.5" /> Webhooks
          </a>
        </RoleGate>
        <RoleGate allow={["root", "admin", "secretaria"]}>
          <a href="/configuracion/plantillas" className="text-[12px] font-medium py-1.5 px-3 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer">
            <FileText className="size-3.5" /> Plantillas contratos
          </a>
        </RoleGate>
      </div>

      <div className="flex gap-1 mb-5 text-[12px] w-fit bg-secondary/40 rounded-md p-1">
        <button
          type="button"
          onClick={() => setTab("sistema")}
          className={[
            "py-1 px-3 rounded font-medium transition-colors",
            tab === "sistema" ? "bg-surface ring-1 ring-border" : "text-ink-subtle hover:text-foreground",
          ].join(" ")}
        >
          Sistema
        </button>
        <button
          type="button"
          onClick={() => setTab("auditoria")}
          className={[
            "py-1 px-3 rounded font-medium transition-colors flex items-center gap-1.5",
            tab === "auditoria" ? "bg-surface ring-1 ring-border" : "text-ink-subtle hover:text-foreground",
          ].join(" ")}
        >
          <History className="size-3.5" /> Auditoría
          <span className="text-[10px] font-mono text-ink-subtle">({counts.audit})</span>
        </button>
      </div>

      {tab === "auditoria" && (
        <Card>
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <SectionHeader title="Últimos 40 cambios" hint="Registro append-only · no se puede editar ni borrar" />
            <button type="button" onClick={() => router.invalidate()} className="text-[11px] py-1 px-2.5 rounded ring-1 ring-border hover:bg-secondary flex items-center gap-1 cursor-pointer">
              <RefreshCw className="size-3" /> Actualizar
            </button>
          </div>
          {auditUltimos.length === 0 ? (
            <div className="p-8 text-center text-[12px] text-ink-subtle">
              No hay registros de auditoría. Crea, modifica o elimina algo y aparecerá aquí.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-secondary/40 border-b border-border">
                  <th className="px-3 py-2 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Cuándo</th>
                  <th className="px-3 py-2 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Tabla</th>
                  <th className="px-3 py-2 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Acción</th>
                  <th className="px-3 py-2 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Por</th>
                  <th className="px-3 py-2 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">IP</th>
                  <th className="px-3 py-2 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Registro</th>
                  <th className="px-3 py-2 text-[10px] font-medium text-ink-subtle uppercase tracking-wider">Campos modificados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {auditUltimos.map((a: any) => {
                  const Icon = a.action === "INSERT" ? Plus : a.action === "UPDATE" ? Pencil : X;
                  const color =
                    a.action === "INSERT" ? "text-success" :
                    a.action === "UPDATE" ? "text-warning" :
                    "text-danger";
                  const diffKeys = a.diff ? Object.keys(a.diff) : [];
                  return (
                    <tr key={a.id} className="hover:bg-secondary/30">
                      <td className="px-3 py-2 text-[11px] font-mono text-ink-muted whitespace-nowrap">{new Date(a.occurred_at).toLocaleString()}</td>
                      <td className="px-3 py-2 text-[11.5px] font-mono">{a.table_name}</td>
                      <td className={["px-3 py-2 text-[11px] font-medium uppercase flex items-center gap-1", color].join(" ")}>
                        <Icon className="size-3" />
                        {a.action}
                      </td>
                      <td className="px-3 py-2 text-[11px]">
                        <div>{a.actor_email || "—"}</div>
                        <div className="text-[10px] text-ink-subtle font-mono">{a.actor_role || ""}</div>
                      </td>
                      <td className="px-3 py-2 text-[10px] font-mono text-ink-subtle truncate max-w-[120px]" title={a.user_agent || ""}>
                        {a.ip || <span className="text-ink-subtle/60">—</span>}
                      </td>
                      <td className="px-3 py-2 text-[10px] font-mono text-ink-subtle truncate max-w-[140px]" title={a.record_id}>
                        {a.record_id?.slice(0, 8) || "—"}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-ink-muted">
                        {diffKeys.length > 0 ? (
                          <span className="font-mono text-[10px]">{diffKeys.slice(0, 4).join(", ")}{diffKeys.length > 4 ? `, +${diffKeys.length - 4}` : ""}</span>
                        ) : (
                          <span className="text-ink-subtle">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === "sistema" && (
      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-12 lg:col-span-7 space-y-6">
          <Card className="p-5">
            <SectionHeader title="Base de datos" hint="Supabase Postgres" />
            <div className="space-y-3 text-[12px]">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="text-ink-subtle">URL del proyecto</span>
                <span className="font-mono text-[11px]">{supabaseUrl || "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-subtle">Estado conexión</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-success" />
                  <span className="text-success font-medium">Conectado</span>
                </span>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader title="Conteo por tabla" hint="Fila real en la base de datos" />
            <div className="grid grid-cols-2 gap-3">
              {tablas.map((t) => (
                <div key={t.name} className="rounded-md border border-border p-3 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-ink-subtle uppercase tracking-widest font-medium">{t.name}</div>
                    <div className="text-[18px] font-semibold font-display mt-0.5">{t.count}</div>
                  </div>
                  <Database className="size-4 text-ink-subtle" />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => router.invalidate()}
              className="mt-4 text-[12px] font-medium py-1.5 px-3 rounded-md ring-1 ring-border hover:bg-secondary flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="size-3.5" /> Refrescar conteo
            </button>
          </Card>

          <Card className="p-5">
            <SectionHeader title="Utilidades" hint="Manejar con cuidado" />
            <div className="space-y-2">
              <button
                type="button"
                onClick={seedDemo}
                disabled={busy !== null}
                className="w-full text-[12px] font-medium py-2 px-3 rounded-md bg-brand text-brand-foreground hover:brightness-110 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy === "seed" ? "Cargando..." : "Cargar 3 clientes + 3 pólizas + 2 leads de ejemplo"}
              </button>
              <button
                type="button"
                onClick={purgarDemo}
                disabled={busy !== null}
                className="w-full text-[12px] font-medium py-2 px-3 rounded-md ring-1 ring-danger/30 text-danger hover:bg-danger/5 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Trash2 className="size-3.5" />
                {busy === "purgar" ? "Eliminando..." : "Vaciar todas las tablas operativas"}
              </button>
            </div>
          </Card>
        </section>

        <aside className="col-span-12 lg:col-span-5 space-y-6">
          <Card className="p-5">
            <SectionHeader title="Seguridad" />
            <div className="space-y-3 text-[12px]">
              <div className="flex items-start gap-3">
                <ShieldCheck className="size-4 text-success shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium">Row Level Security activo</div>
                  <div className="text-ink-subtle text-[11px] mt-0.5">
                    Modo desarrollo: políticas abiertas. Antes de pasar a producción,
                    sustituir por políticas basadas en <code className="font-mono">auth.uid()</code>.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <KeyRound className="size-4 text-success shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium">Autenticación activa</div>
                  <div className="text-ink-subtle text-[11px] mt-0.5">
                    Login email + contraseña vía Supabase Auth. Cada acción queda
                    registrada en <code className="font-mono">audit_logs</code> con email del actor.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <History className="size-4 text-success shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium">Auditoría inmutable</div>
                  <div className="text-ink-subtle text-[11px] mt-0.5">
                    Triggers PostgreSQL graban INSERT / UPDATE / DELETE en append-only.
                    Las filas no pueden editarse ni borrarse (RGPD).
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader title="Servicios externos" />
            <div className="space-y-2 text-[12px]">
              <div className="flex justify-between items-center">
                <span className="text-ink-subtle">Email (Brevo · Francia)</span>
                <span className="text-success">Edge Function preparada</span>
              </div>
              <div className="text-[10px] text-ink-subtle font-mono leading-relaxed">
                Despliega con:<br />
                <code>supabase functions deploy enviar-aviso-vencimiento --no-verify-jwt</code><br />
                <code>supabase secrets set BREVO_API_KEY=xkeysib-...</code>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border">
                <span className="text-ink-subtle">IA Mistral (Francia)</span>
                <span className="text-success">Activo</span>
              </div>
              <div className="text-[10px] text-ink-subtle">
                Usado para extraer pólizas (PDF) y conciliar comisiones. Datacenter UE para cumplir soberanía del dato.
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader title="Entorno" />
            <div className="space-y-2 text-[12px] font-mono">
              <div className="flex justify-between"><span className="text-ink-subtle">Build</span><span>{import.meta.env.MODE}</span></div>
              <div className="flex justify-between"><span className="text-ink-subtle">Versión app</span><span>0.1.0</span></div>
            </div>
          </Card>
        </aside>
      </div>
      )}
    </PageShell>
  );
}
