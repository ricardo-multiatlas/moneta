// ============================================================
// Parser CSB-43 / Norma 43 AEB
// ASCII / ISO-8859-1, longitud fija 80 chars + CRLF.
// Registros: 11 cabecera cuenta, 22 movimiento, 23 concepto adicional,
// 33 final cuenta, 88 final fichero.
// ============================================================

export interface CabeceraN43 {
  banco: string;
  cuenta: string;
  fechaInicio: string; // yyyy-mm-dd
  fechaFin: string;    // yyyy-mm-dd
}

export interface MovimientoN43 {
  id: string;                  // hash idempotente (no criptografico)
  fechaOperacion: string;      // yyyy-mm-dd
  fechaValor: string;          // yyyy-mm-dd
  signo: "D" | "H";
  importe: number;             // euros con decimales (positivo siempre)
  codigoComun: number;
  concepto: string;            // de los 23 concatenados
  referencia1: string;
  referencia2: string;
}

export interface N43Fichero {
  cabecera: CabeceraN43;
  movimientos: MovimientoN43[];
  saldoFinal: number;
}

export interface ReciboPendiente {
  id: string;
  importe: number;
  fechaVencimiento: string; // yyyy-mm-dd
  nifTomador?: string;
  nombreTomador?: string;
  numeroRecibo?: string;
  numeroPoliza?: string;
}

// ------------------------------------------------------------
// Utilidades internas
// ------------------------------------------------------------

function slice1(s: string, from1: number, to1: number): string {
  // posiciones 1-based, inclusivo (estilo Norma 43)
  return s.substring(from1 - 1, to1);
}

function parseAAMMDD(s: string): string {
  // siglo 20XX (los N43 modernos no llegan a 99 con XIX)
  const yy = s.substring(0, 2);
  const mm = s.substring(2, 4);
  const dd = s.substring(4, 6);
  return `20${yy}-${mm}-${dd}`;
}

function parseImporteRaw14(s: string): number {
  // 14 digitos, sin coma, 2 ultimos son decimales
  const n = parseInt(s, 10);
  if (!Number.isFinite(n)) return 0;
  return n / 100;
}

/**
 * Hash idempotente para identificar un movimiento de forma unica.
 * NO es criptografico. Se usa solo como id estable para ON CONFLICT DO NOTHING
 * cuando el mismo fichero N43 se re-importa.
 */
function hashIdem(parts: string[]): string {
  const s = parts.join("|");
  // FNV-1a 32-bit + djb2 32-bit combinados, sale un hex de 16 chars
  let h1 = 0x811c9dc5;
  let h2 = 5381;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 ^= c;
    h1 = (h1 + ((h1 << 1) + (h1 << 4) + (h1 << 7) + (h1 << 8) + (h1 << 24))) >>> 0;
    h2 = (((h2 << 5) + h2) + c) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

// ------------------------------------------------------------
// Parser principal
// ------------------------------------------------------------

export function parseN43(content: string): N43Fichero {
  // separar por CR, LF, CRLF
  const lines = content.split(/\r\n|\r|\n/);

  const cabecera: CabeceraN43 = { banco: "", cuenta: "", fechaInicio: "", fechaFin: "" };
  const movimientos: MovimientoN43[] = [];
  let saldoFinal = 0;
  let ultimoMov: MovimientoN43 | null = null;

  for (const raw of lines) {
    if (raw.length === 0) continue;
    if (raw.length !== 80) {
      // eslint-disable-next-line no-console
      console.warn(`[n43] linea ignorada por longitud ${raw.length} != 80: "${raw.substring(0, 20)}..."`);
      continue;
    }

    const tipo = slice1(raw, 1, 2);

    if (tipo === "11") {
      // Cabecera cuenta:
      // 3-6 banco, 7-10 sucursal, 11-20 cuenta, 21-26 fecha inicio, 27-32 fecha fin
      cabecera.banco = slice1(raw, 3, 6).trim();
      const sucursal = slice1(raw, 7, 10).trim();
      const cuenta = slice1(raw, 11, 20).trim();
      cabecera.cuenta = `${cabecera.banco}${sucursal}${cuenta}`;
      cabecera.fechaInicio = parseAAMMDD(slice1(raw, 21, 26));
      cabecera.fechaFin = parseAAMMDD(slice1(raw, 27, 32));
      ultimoMov = null;
      continue;
    }

    if (tipo === "22") {
      const fechaOperacion = parseAAMMDD(slice1(raw, 11, 16));
      const fechaValor = parseAAMMDD(slice1(raw, 17, 22));
      const codigoComun = parseInt(slice1(raw, 23, 24), 10) || 0;
      const signoRaw = slice1(raw, 28, 28);
      const signo: "D" | "H" = signoRaw === "1" ? "D" : "H";
      const importe = parseImporteRaw14(slice1(raw, 29, 42));
      const referencia1 = slice1(raw, 53, 64).trim();
      const referencia2 = slice1(raw, 65, 80).trim();

      const id = hashIdem([cabecera.cuenta, fechaOperacion, String(Math.round(importe * 100)), referencia1, referencia2, signo]);

      const mov: MovimientoN43 = {
        id,
        fechaOperacion,
        fechaValor,
        signo,
        importe,
        codigoComun,
        concepto: "",
        referencia1,
        referencia2,
      };
      movimientos.push(mov);
      ultimoMov = mov;
      continue;
    }

    if (tipo === "23") {
      // Registro 23: concepto adicional al ultimo 22
      // pos 5-42 concepto1, pos 43-80 concepto2
      if (!ultimoMov) continue;
      const c1 = slice1(raw, 5, 42).trim();
      const c2 = slice1(raw, 43, 80).trim();
      const extra = [c1, c2].filter(Boolean).join(" ");
      if (extra) {
        ultimoMov.concepto = ultimoMov.concepto ? `${ultimoMov.concepto} ${extra}` : extra;
      }
      continue;
    }

    if (tipo === "33") {
      // Final cuenta: saldo final aprox en pos 53-66 (14 digitos, mismo formato)
      const saldoRaw = slice1(raw, 53, 66);
      const signoSaldo = slice1(raw, 52, 52);
      const saldoAbs = parseImporteRaw14(saldoRaw);
      saldoFinal = signoSaldo === "1" ? -saldoAbs : saldoAbs;
      ultimoMov = null;
      continue;
    }

    if (tipo === "88") {
      // Final fichero, no contiene datos relevantes para el parser
      ultimoMov = null;
      continue;
    }

    // Otros tipos: ignorar silenciosamente
  }

  return { cabecera, movimientos, saldoFinal };
}

// ------------------------------------------------------------
// Scoring de match movimiento <-> recibo
// ------------------------------------------------------------

function diffDias(fechaA: string, fechaB: string): number {
  const a = new Date(fechaA + "T00:00:00").getTime();
  const b = new Date(fechaB + "T00:00:00").getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.abs((a - b) / (1000 * 60 * 60 * 24));
}

function contieneCI(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Score 0-100 del match entre un movimiento N43 y un recibo pendiente.
 * Importe exacto en centimos es BLOQUEANTE: si no coincide, devuelve 0.
 */
export function scoreMatch(mov: MovimientoN43, recibo: ReciboPendiente): number {
  // BLOQUEANTE: importe exacto en centimos
  const movCentimos = Math.round(mov.importe * 100);
  const recCentimos = Math.round(recibo.importe * 100);
  if (movCentimos !== recCentimos) return 0;

  let score = 40; // importe exacto

  // Fecha valor vs fecha vencimiento
  const d = diffDias(mov.fechaValor, recibo.fechaVencimiento);
  if (d <= 3) score += 20;
  else if (d <= 7) score += 10;

  // Texto donde buscar referencias del recibo
  const blob = `${mov.referencia1} ${mov.referencia2} ${mov.concepto}`;

  // NIF tomador
  if (recibo.nifTomador && contieneCI(blob, recibo.nifTomador)) score += 25;

  // Numero recibo o numero poliza literal en concepto/refs
  const matchNumero =
    (recibo.numeroRecibo && contieneCI(blob, recibo.numeroRecibo)) ||
    (recibo.numeroPoliza && contieneCI(blob, recibo.numeroPoliza));
  if (matchNumero) score += 25;

  // Nombre tomador en concepto (case-insensitive contains)
  if (recibo.nombreTomador && contieneCI(blob, recibo.nombreTomador)) score += 10;

  // Codigo comun coherente (06 recibo, 12 transferencia, 04 devolucion)
  if (mov.codigoComun === 6 || mov.codigoComun === 12 || mov.codigoComun === 4) score += 5;

  // Clamp 0-100
  if (score > 100) score = 100;
  if (score < 0) score = 0;
  return score;
}
