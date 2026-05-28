import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Acceso · Correduría OS" }] }),
});

function LoginPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: "/" });
      router.invalidate();
    }
  }, [user, loading, navigate, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else {
        const res = await signUp(email, password, nombre || email.split("@")[0]);
        if (res.requiresEmailConfirmation) {
          setInfo(
            `Cuenta creada. Supabase exige confirmación por email — revisa la bandeja de ${email} (también spam) y haz clic en el enlace. Después vuelve aquí y entra con tu contraseña.`
          );
          setMode("signin");
          setPassword("");
        } else {
          // En producción la confirmación está desactivada y se crea sesión directa.
          // Pero por si la sesión no se hidrata al instante, dejamos un aviso útil.
          setInfo(
            `Cuenta creada para ${email}. Si no entras automáticamente en unos segundos, escribe tu contraseña aquí y pulsa Entrar.`
          );
          setMode("signin");
        }
      }
    } catch (e: any) {
      const msg = e?.message || "Error de autenticación";
      if (/rate limit|seconds/i.test(msg)) {
        setErr("Supabase está limitando los intentos. Espera ~60 segundos y vuelve a intentarlo.");
      } else if (/email not confirmed/i.test(msg)) {
        setErr("Tu email aún no está confirmado. Revisa tu bandeja de entrada.");
      } else {
        setErr(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background text-foreground px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-6">
          <img
            src="/moneta-logo.png"
            alt="Moneta Seguros"
            className="h-12 w-auto object-contain"
          />
          <div className="text-[10px] text-ink-subtle font-mono uppercase tracking-widest">
            Correduría OS · Sevilla
          </div>
        </div>

        <div className="bg-surface rounded-xl ring-1 ring-border p-6 shadow-sm">
          <div className="flex gap-1 mb-5 text-[12px]">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={[
                "flex-1 py-1.5 rounded-md font-medium transition-colors",
                mode === "signin" ? "bg-secondary text-foreground" : "text-ink-subtle hover:bg-secondary/50",
              ].join(" ")}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={[
                "flex-1 py-1.5 rounded-md font-medium transition-colors",
                mode === "signup" ? "bg-secondary text-foreground" : "text-ink-subtle hover:bg-secondary/50",
              ].join(" ")}
            >
              Crear cuenta
            </button>
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <div>
                <label className="block text-[11px] font-medium text-ink-subtle mb-1">Nombre</label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Diego Moneta"
                  className="w-full bg-secondary border-0 rounded px-3 py-2 text-[13px] ring-1 ring-border focus:ring-brand/30 outline-none"
                />
              </div>
            )}
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Email</label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="diego@monetaseguros.es"
                className="w-full bg-secondary border-0 rounded px-3 py-2 text-[13px] ring-1 ring-border focus:ring-brand/30 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-subtle mb-1">Contraseña</label>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-secondary border-0 rounded px-3 py-2 text-[13px] ring-1 ring-border focus:ring-brand/30 outline-none"
              />
            </div>

            {err && (
              <div className="text-[11px] text-danger bg-danger/10 ring-1 ring-danger/20 rounded px-2.5 py-1.5">
                {err}
              </div>
            )}
            {info && (
              <div className="text-[11px] text-success bg-success/10 ring-1 ring-success/20 rounded px-2.5 py-1.5">
                {info}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2 rounded-md bg-brand text-brand-foreground hover:brightness-110 text-[13px] font-medium flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {mode === "signin" ? <LogIn className="size-3.5" /> : <UserPlus className="size-3.5" />}
              {busy ? "Procesando…" : mode === "signin" ? "Entrar" : "Crear cuenta"}
            </button>
          </form>

          <div className="mt-4 text-[11px] text-ink-subtle text-center">
            Madrid · Infraestructura propia MultiAtlas · RGPD
          </div>
        </div>
      </div>
    </div>
  );
}
