import { useEffect, useState, createContext, useContext, type ReactNode, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

export type Rol = "root" | "admin" | "jefe_zona" | "comercial" | "secretaria" | "backoffice" | null;

export interface PerfilUsuario {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  zona_id: string | null;
  jefe_id: string | null;
  telefono: string | null;
  foto_url: string | null;
  iban_cifrado: string | null;
  activo: boolean;
}

export interface PermisoGranular {
  rol: string;
  recurso: string;
  accion: string;
  permitido: boolean;
}

export interface Permisos {
  perfil: PerfilUsuario | null;
  loading: boolean;
  rol: Rol;
  esRoot: boolean;
  esJefeZona: boolean;
  esComercial: boolean;
  esSecretaria: boolean;
  scopeClientes: "all" | "zone" | "self" | "none";
  puedeVerComisiones: boolean;
  puedeModificarComisiones: boolean;
  puedeVerFinanciero: boolean;
  puedeGestionarUsuarios: boolean;
  puedeVerAuditoria: boolean;
  puedeEnviarMasivo: boolean;
  puedeConfigurarSistema: boolean;
  /**
   * Comprueba un permiso granular específico recurso×acción.
   * Si NO hay override en permisos_granulares, usa el default del rol.
   */
  puede: (recurso: string, accion: string) => boolean;
}

const PermissionsContext = createContext<Permisos | null>(null);

// Defaults por rol — se aplican si NO hay override en permisos_granulares
function defaultPermiso(rol: Rol, recurso: string, accion: string): boolean {
  if (!rol) return false;
  if (rol === "root" || rol === "admin") return true; // root puede todo por defecto

  const r = rol;
  // jefe_zona
  if (r === "jefe_zona") {
    if (recurso === "comisiones" && accion === "modificar") return false;
    if (recurso === "usuarios") return false;
    if (recurso === "zonas") return false;
    if (recurso === "liquidaciones") return false;
    if (recurso === "permisos") return false;
    if (recurso === "reglas_comision") return false;
    return true;
  }
  // comercial
  if (r === "comercial") {
    if (recurso === "comisiones" && accion !== "ver") return false;
    if (recurso === "facturacion") return accion === "ver";
    if (recurso === "usuarios") return false;
    if (recurso === "zonas") return false;
    if (recurso === "liquidaciones") return accion === "ver";
    if (recurso === "comunicaciones" && accion === "masivo") return false;
    return true;
  }
  // secretaria
  if (r === "secretaria") {
    if (recurso === "comisiones") return false;
    if (recurso === "facturacion") return false;
    if (recurso === "liquidaciones") return false;
    if (recurso === "usuarios") return false;
    if (recurso === "zonas") return false;
    return true;
  }
  return false;
}

function buildPermisos(
  perfil: PerfilUsuario | null,
  granulares: PermisoGranular[],
  loading: boolean
): Permisos {
  const rol = (perfil?.rol ?? null) as Rol;
  const esRoot = rol === "root" || rol === "admin";
  const esJefeZona = rol === "jefe_zona";
  const esComercial = rol === "comercial";
  const esSecretaria = rol === "secretaria";

  const overrides = new Map<string, boolean>();
  granulares.forEach((p) => {
    if (p.rol === rol) overrides.set(`${p.recurso}.${p.accion}`, p.permitido);
  });

  const puede = (recurso: string, accion: string) => {
    const key = `${recurso}.${accion}`;
    if (overrides.has(key)) return overrides.get(key)!;
    return defaultPermiso(rol, recurso, accion);
  };

  return {
    perfil,
    loading,
    rol,
    esRoot,
    esJefeZona,
    esComercial,
    esSecretaria,
    scopeClientes: esRoot || esSecretaria ? "all" : esJefeZona ? "zone" : esComercial ? "self" : "none",
    puedeVerComisiones: puede("comisiones", "ver"),
    puedeModificarComisiones: puede("comisiones", "modificar"),
    puedeVerFinanciero: puede("facturacion", "ver"),
    puedeGestionarUsuarios: puede("usuarios", "gestionar"),
    puedeVerAuditoria: puede("auditoria", "ver"),
    puedeEnviarMasivo: puede("comunicaciones", "masivo"),
    puedeConfigurarSistema: puede("sistema", "configurar"),
    puede,
  };
}

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, loading: loadingAuth } = useAuth();
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null);
  const [granulares, setGranulares] = useState<PermisoGranular[]>([]);
  const [loadingPerfil, setLoadingPerfil] = useState(true);

  useEffect(() => {
    if (loadingAuth) return;
    if (!user) {
      setPerfil(null);
      setGranulares([]);
      setLoadingPerfil(false);
      return;
    }
    // Fallback inmediato por email para admins conocidos — el sidebar
    // muestra el menú completo desde el primer instante. La query a BD
    // refina los datos cuando responde.
    const ROOT_EMAILS = new Set([
      "rubentoledano@multiatlas.net",
      "makeflowia@gmail.com",
      "ricardomultiatlas@gmail.com",
    ]);
    if (user.email && ROOT_EMAILS.has(user.email.toLowerCase())) {
      setPerfil({
        id: user.id,
        email: user.email,
        nombre: (user.user_metadata as any)?.nombre || user.email.split("@")[0],
        rol: "root",
        zona_id: null,
        jefe_id: null,
        telefono: null,
        foto_url: null,
        iban_cifrado: null,
        activo: true,
      });
    }

    let alive = true;
    setLoadingPerfil(true);
    Promise.all([
      supabase
        .from("usuarios")
        .select("id, email, nombre, rol, zona_id, jefe_id, telefono, foto_url, iban_cifrado, activo")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("permisos_granulares")
        .select("rol, recurso, accion, permitido"),
    ]).then(([{ data: perfilData }, { data: permisos }]) => {
      if (!alive) return;
      if (perfilData) setPerfil(perfilData as PerfilUsuario);
      setGranulares((permisos as PermisoGranular[]) || []);
      setLoadingPerfil(false);
    });
    return () => { alive = false; };
  }, [user, loadingAuth]);

  const value = useMemo(
    () => buildPermisos(perfil, granulares, loadingAuth || loadingPerfil),
    [perfil, granulares, loadingAuth, loadingPerfil]
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): Permisos {
  const ctx = useContext(PermissionsContext);
  if (ctx) return ctx;
  return buildPermisos(null, [], false);
}
