import { useEffect, useState, useCallback, createContext, useContext, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { setupAuditContext } from "@/lib/audit-context";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, nombre: string) => Promise<{ requiresEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Provider único — montar en __root.tsx para que la sesión se cargue
 * una sola vez. Sin esto, cada PageShell re-fetcha la sesión al montar
 * (causando el flash "Cargando…" entre navegaciones).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
      if (data.session?.user) void setupAuditContext();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) void setupAuditContext();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, nombre: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nombre } },
    });
    if (error) throw error;

    const requiresEmailConfirmation = !!data.user && !data.session;

    if (data.user) {
      const { error: errPerfil } = await supabase.from("usuarios").upsert({
        id: data.user.id,
        email,
        nombre,
        rol: "admin",
      });
      if (errPerfil) {
        console.warn("No se pudo crear perfil en usuarios:", errPerfil.message);
      }
    }

    return { requiresEmailConfirmation };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook para consumir auth. Si no hay Provider arriba, devuelve un
 * fallback sin sesión (evita crashes en rutas montadas fuera del root).
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx) return ctx;
  // Fallback defensivo — no debería ocurrir si __root.tsx envuelve todo.
  return {
    user: null,
    loading: false,
    signIn: async () => { throw new Error("AuthProvider no montado"); },
    signUp: async () => ({ requiresEmailConfirmation: false }),
    signOut: async () => {},
  };
}
