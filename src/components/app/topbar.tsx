import { Sparkles, Plus, Search, Loader2, X } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { naturalSearchFn } from "@/lib/ai-search";

interface TopbarProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function Topbar({ title, subtitle, action }: TopbarProps) {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const ejecutar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || loading) return;
    setLoading(true);
    try {
      const r = await naturalSearchFn({ data: { prompt } });
      setResult(r);
    } catch (err: any) {
      setResult({ success: false, error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const irA = (entidad: string, id?: string) => {
    setResult(null);
    setPrompt("");
    if (entidad === "clientes" && id) navigate({ to: "/clientes/$id", params: { id } });
    else if (entidad === "clientes") navigate({ to: "/clientes" });
    else if (entidad === "polizas") navigate({ to: "/polizas" });
    else if (entidad === "vencimientos") navigate({ to: "/vencimientos" });
    else if (entidad === "facturas") navigate({ to: "/facturacion" });
    else if (entidad === "leads") navigate({ to: "/captacion" });
  };

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="h-14 px-6 flex items-center gap-4">
        <form onSubmit={ejecutar} className="flex-1 max-w-2xl relative group">
          <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none gap-1.5">
            <span className="text-[9px] font-bold font-mono text-brand bg-brand-soft px-1 py-0.5 rounded">
              IA
            </span>
            {loading ? (
              <Loader2 className="size-3.5 text-brand animate-spin" />
            ) : (
              <Search className="size-3.5 text-ink-subtle" />
            )}
          </div>
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="muéstrame los clientes de Sevilla con auto que vence antes de septiembre…"
            className="w-full bg-secondary border-0 rounded-md pl-14 pr-3 py-1.5 text-[13px] ring-1 ring-border focus:ring-brand/30 focus:bg-surface outline-none transition-all placeholder:text-ink-subtle"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-ink-subtle bg-surface border border-border rounded px-1.5 py-0.5">
            {loading ? "…" : "↵"}
          </kbd>

          {result && (
            <div className="absolute z-30 left-0 right-0 top-full mt-2 rounded-lg bg-surface ring-1 ring-border shadow-lg max-h-[60vh] overflow-auto">
              <div className="flex items-center justify-between p-3 border-b border-border bg-secondary/30">
                <div className="text-[11px]">
                  {result.success ? (
                    <>
                      <span className="text-ink-subtle">Interpretado como </span>
                      <span className="font-mono font-medium">{result.entidad}</span>
                      <span className="text-ink-subtle"> · {result.rows.length} resultado{result.rows.length === 1 ? "" : "s"}</span>
                    </>
                  ) : (
                    <span className="text-danger">{result.error}</span>
                  )}
                </div>
                <button type="button" onClick={() => setResult(null)} className="p-1 hover:bg-secondary rounded cursor-pointer" title="Cerrar">
                  <X className="size-3.5 text-ink-subtle" />
                </button>
              </div>
              {result.success && (
                <>
                  <div className="px-3 py-2 text-[11px] text-ink-muted italic border-b border-border">
                    {result.explicacion}
                  </div>
                  {result.rows.length === 0 ? (
                    <div className="p-6 text-center text-[12px] text-ink-subtle">
                      Sin resultados. Prueba reformular la pregunta.
                    </div>
                  ) : (
                    <ul className="divide-y divide-border">
                      {result.rows.map((r: any) => {
                        const label =
                          r.nombre_razon_social ||
                          r.nombre ||
                          r.numero_poliza ||
                          r.numero_factura ||
                          r.fecha_vencimiento ||
                          r.id;
                        const sub =
                          r.aseguradora ||
                          r.email ||
                          r.estado ||
                          (r.clientes && r.clientes.nombre_razon_social) ||
                          "";
                        return (
                          <li
                            key={r.id}
                            onClick={() => irA(result.entidad, result.entidad === "clientes" ? r.id : undefined)}
                            className="px-3 py-2 text-[12px] hover:bg-secondary cursor-pointer flex items-center justify-between"
                          >
                            <div>
                              <div className="font-medium">{label}</div>
                              {sub && <div className="text-[10px] text-ink-subtle mt-0.5">{sub}</div>}
                            </div>
                            <span className="text-[10px] text-brand">Ver →</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
        </form>

        <div className="flex items-center gap-2">
          <Link
            to="/polizas"
            search={{ nueva: "manual" }}
            className="flex items-center gap-1.5 bg-brand text-brand-foreground text-xs font-medium py-1.5 px-3 rounded-md hover:brightness-110 transition-all cursor-pointer"
          >
            <Plus className="size-3.5" strokeWidth={2.4} />
            Nueva póliza
          </Link>
        </div>
      </div>

      <div className="px-6 pb-5 pt-2 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-display font-semibold tracking-tight leading-tight">{title}</h1>
          {subtitle && (
            <p className="text-[13px] text-ink-muted mt-0.5 max-w-[64ch]">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
    </header>
  );
}

export function AISuggestionBanner({ criticosSinAviso }: { criticosSinAviso: number }) {
  const navigate = useNavigate();
  if (!criticosSinAviso || criticosSinAviso <= 0) return null;
  return (
    <div className="mx-6 mb-4 rounded-md border border-brand/15 bg-brand-soft/40 px-3.5 py-2 flex items-center gap-2.5">
      <Sparkles className="size-3.5 text-brand shrink-0" strokeWidth={2.2} />
      <span className="text-[12px] text-foreground/80">
        <span className="font-medium text-foreground">Sugerencia:</span>{" "}
        {criticosSinAviso === 1
          ? "hay 1 vencimiento crítico sin aviso enviado en los próximos 7 días."
          : `hay ${criticosSinAviso} vencimientos críticos sin aviso enviado en los próximos 7 días.`}
      </span>
      <button
        type="button"
        onClick={() => navigate({ to: "/vencimientos" })}
        className="ml-auto text-[11px] font-medium text-brand hover:underline cursor-pointer"
      >
        Revisar →
      </button>
    </div>
  );
}
