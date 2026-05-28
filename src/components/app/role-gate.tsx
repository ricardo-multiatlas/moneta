import type { ReactNode } from "react";
import { usePermissions, type Rol } from "@/hooks/use-permissions";

interface RoleGateProps {
  /** Roles permitidos. Ej: ["root", "jefe_zona"] */
  allow: Rol[];
  /** Qué renderizar si NO está permitido. Default: null (oculta el bloque). */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Envuelve un bloque de UI para que solo lo vean ciertos roles.
 * Si el usuario aún no cargó, muestra null (no parpadea).
 */
export function RoleGate({ allow, fallback = null, children }: RoleGateProps) {
  const { rol, loading } = usePermissions();
  if (loading) return null;
  if (!rol || !allow.includes(rol)) return <>{fallback}</>;
  return <>{children}</>;
}
