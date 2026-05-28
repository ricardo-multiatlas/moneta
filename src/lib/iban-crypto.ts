/**
 * Wrapper de cifrado/descifrado de IBAN.
 *
 * FIXME: reemplazar por AES-GCM con clave KMS (AWS KMS, GCP KMS o Supabase Vault)
 * en producción. La codificación base64 actual NO es cifrado real, es solo ofuscación
 * para que la columna no muestre el IBAN en texto plano en logs / dashboards.
 *
 * La seguridad real está en:
 *  1. RLS de Supabase (solo el propio usuario y root pueden SELECT su iban_cifrado).
 *  2. La vista usuarios_publicos que enmascara el IBAN para no-root / no-self.
 *
 * Cuando se conecte KMS:
 *  - cifrarIBAN: pedirá a KMS encrypt(plaintext) y devolverá el ciphertext base64.
 *  - descifrarIBAN: pedirá a KMS decrypt(ciphertext) y devolverá el plaintext.
 *  - Los datos persistidos actualmente (base64) deberán migrarse con un script:
 *      SELECT id, iban_cifrado FROM usuarios WHERE iban_cifrado IS NOT NULL;
 *      → para cada uno: nuevo = await kms.encrypt(atob(viejo));
 *      → UPDATE usuarios SET iban_cifrado = nuevo WHERE id = ...;
 */

const PREFIX = "b64:";

/**
 * "Cifra" un IBAN (ofuscación base64).
 * Devuelve null si el IBAN es vacío.
 */
export function cifrarIBAN(iban: string | null | undefined): string | null {
  if (!iban) return null;
  const limpio = iban.trim().replace(/\s+/g, "");
  if (!limpio) return null;
  try {
    // btoa funciona en navegador y server runtime (TanStack Start usa node con btoa global ≥18)
    const encoded = typeof btoa === "function"
      ? btoa(limpio)
      : Buffer.from(limpio, "utf-8").toString("base64");
    return `${PREFIX}${encoded}`;
  } catch {
    return limpio; // fallback: guardar como-está antes que perderlo
  }
}

/**
 * "Descifra" un IBAN previamente cifrado. Si el valor no tiene el prefijo b64:
 * se devuelve tal cual (compat con datos legacy en texto plano).
 */
export function descifrarIBAN(cifrado: string | null | undefined): string {
  if (!cifrado) return "";
  if (!cifrado.startsWith(PREFIX)) return cifrado;
  const encoded = cifrado.slice(PREFIX.length);
  try {
    return typeof atob === "function"
      ? atob(encoded)
      : Buffer.from(encoded, "base64").toString("utf-8");
  } catch {
    return cifrado;
  }
}

/**
 * Devuelve un IBAN enmascarado tipo "ES•• •••• •••• •••• •••• 1234".
 * Útil para mostrar a usuarios que no son el dueño ni root.
 */
export function enmascararIBAN(iban: string | null | undefined): string {
  if (!iban) return "";
  const limpio = iban.trim().replace(/\s+/g, "");
  if (limpio.length < 4) return "••••";
  return `••••${limpio.slice(-4)}`;
}
