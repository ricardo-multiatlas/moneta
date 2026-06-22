/**
 * Exportación contable para corredurías de seguros.
 *
 * Genera asientos de doble partida en los formatos CSV nativos de:
 *  - A3 (importación libre, ISO-8859-1, separador ";", fecha DDMMAAAA)
 *  - Contasol (ISO-8859-1, separador ";", fecha DD/MM/AAAA, decimal coma)
 *  - Sage 50 (UTF-8 con BOM, separador ";", fecha DD/MM/AAAA, decimal coma)
 *
 * Cada factura emitida genera 2 ó 3 líneas:
 *   - Debe en cuenta de cliente (4300xxxx) por el TOTAL
 *   - Haber en cuenta de ingresos (70500000 / 75900000) por la BASE
 *   - Haber en cuenta de IVA repercutido (47700000) por la CUOTA (sólo si la operación NO está exenta)
 *
 * Nota negocio: la comisión de mediación de seguros está EXENTA de IVA
 * (art. 20.Uno.16 LIVA). En ese caso tipoIva=0, cuotaIva=0 y no se genera
 * la línea de IVA repercutido.
 */

export interface FacturaContable {
  /** Número de factura, ej. "2026/100" o "FAC-2026-0001" */
  numero: string;
  /** Serie opcional (A3 la admite como parte del documento) */
  serie?: string;
  /** Fecha en ISO yyyy-mm-dd */
  fecha: string;
  /** NIF / CIF del cliente */
  nif: string;
  /** Nombre o razón social del cliente */
  nombre: string;
  /** Base imponible */
  base: number;
  /** Tipo de IVA en % (0 = exenta) */
  tipoIva: number;
  /** Cuota de IVA en euros (0 si exenta) */
  cuotaIva: number;
  /** Total = base + cuotaIva */
  total: number;
  /** Cuenta cliente (default 43000001) */
  cuentaCliente?: string;
  /** Cuenta ingreso (default 70500000) */
  cuentaIngreso?: string;
  /** Concepto del apunte (default "FRA <numero>") */
  concepto?: string;
}

const CUENTA_CLIENTE_DEFAULT = "43000001";
const CUENTA_INGRESO_DEFAULT = "70500000";
const CUENTA_IVA_REPERCUTIDO = "47700000";

// -------------------- helpers comunes --------------------

/** "2026-06-21" -> "21/06/2026" */
function fechaDDMMYYYY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** "2026-06-21" -> "21062026" (formato A3) */
function fechaDDMMYYYYsinSeparador(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}${m}${y}`;
}

/** 1234.5 -> "1234,50" */
function num(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

/** Escapa un campo CSV: si contiene ; o " o salto, lo entrecomilla. */
function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(";") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map(r => r.map(csvField).join(";")).join("\r\n") + "\r\n";
}

/**
 * Codifica un string en ISO-8859-1 (Latin-1). Caracteres > 0xFF se sustituyen por "?".
 * Necesario porque TextEncoder sólo soporta UTF-8 y A3/Contasol esperan Latin-1.
 * Devuelve un ArrayBuffer (BlobPart válido en lib.dom moderno).
 */
function toLatin1Buffer(str: string): ArrayBuffer {
  const buf = new ArrayBuffer(str.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    view[i] = code > 0xff ? 0x3f /* '?' */ : code;
  }
  return buf;
}

/** UTF-8 + BOM como ArrayBuffer. */
function toUtf8BomBuffer(str: string): ArrayBuffer {
  const body = new TextEncoder().encode(str);
  const buf = new ArrayBuffer(body.length + 3);
  const view = new Uint8Array(buf);
  view[0] = 0xef;
  view[1] = 0xbb;
  view[2] = 0xbf;
  view.set(body, 3);
  return buf;
}

function conceptoDe(f: FacturaContable): string {
  if (f.concepto && f.concepto.trim()) return f.concepto.trim();
  return `FRA ${f.numero}`;
}

function documentoDe(f: FacturaContable): string {
  return f.serie ? `${f.serie}/${f.numero}` : f.numero;
}

// -------------------- A3 (CSV importación libre) --------------------

/**
 * Columnas: Empresa;Asiento;Fecha;Cuenta;Concepto;Debe;Haber;Documento;NIF;Base;TipoIVA;CuotaIVA
 * Fecha = DDMMAAAA. ISO-8859-1.
 */
export function exportarFacturasA3(facturas: FacturaContable[]): Blob {
  const header = [
    "Empresa", "Asiento", "Fecha", "Cuenta", "Concepto",
    "Debe", "Haber", "Documento", "NIF", "Base", "TipoIVA", "CuotaIVA",
  ];
  const rows: (string | number)[][] = [header];

  let nAsiento = 1;
  for (const f of facturas) {
    const fecha = fechaDDMMYYYYsinSeparador(f.fecha);
    const cuentaCliente = f.cuentaCliente || CUENTA_CLIENTE_DEFAULT;
    const cuentaIngreso = f.cuentaIngreso || CUENTA_INGRESO_DEFAULT;
    const concepto = conceptoDe(f);
    const documento = documentoDe(f);
    const exenta = f.tipoIva === 0;

    // 1) Debe cliente (total)
    rows.push([
      "1", String(nAsiento), fecha, cuentaCliente, concepto,
      num(f.total), num(0), documento, f.nif,
      num(f.base), String(f.tipoIva), exenta ? "" : num(f.cuotaIva),
    ]);
    // 2) Haber ingreso (base)
    rows.push([
      "1", String(nAsiento), fecha, cuentaIngreso, concepto,
      num(0), num(f.base), documento, f.nif,
      "", "", "",
    ]);
    // 3) Haber IVA repercutido (cuota) si no exenta
    if (!exenta) {
      rows.push([
        "1", String(nAsiento), fecha, CUENTA_IVA_REPERCUTIDO, concepto,
        num(0), num(f.cuotaIva), documento, f.nif,
        "", "", "",
      ]);
    }
    nAsiento++;
  }

  const csv = rowsToCsv(rows);
  return new Blob([toLatin1Buffer(csv)], { type: "text/csv;charset=iso-8859-1" });
}

// -------------------- Contasol --------------------

/**
 * Columnas: Asiento;Fecha;Cuenta;Concepto;Debe;Haber;Documento;NIF;Base;TipoIVA;CuotaIVA
 * Fecha = DD/MM/AAAA. ISO-8859-1.
 */
export function exportarFacturasContasol(facturas: FacturaContable[]): Blob {
  const header = [
    "Asiento", "Fecha", "Cuenta", "Concepto", "Debe", "Haber",
    "Documento", "NIF", "Base", "TipoIVA", "CuotaIVA",
  ];
  const rows: (string | number)[][] = [header];

  let nAsiento = 1;
  for (const f of facturas) {
    const fecha = fechaDDMMYYYY(f.fecha);
    const cuentaCliente = f.cuentaCliente || CUENTA_CLIENTE_DEFAULT;
    const cuentaIngreso = f.cuentaIngreso || CUENTA_INGRESO_DEFAULT;
    const concepto = conceptoDe(f);
    const documento = documentoDe(f);
    const exenta = f.tipoIva === 0;

    rows.push([
      String(nAsiento), fecha, cuentaCliente, concepto,
      num(f.total), num(0), documento, f.nif,
      num(f.base), String(f.tipoIva), exenta ? "" : num(f.cuotaIva),
    ]);
    rows.push([
      String(nAsiento), fecha, cuentaIngreso, concepto,
      num(0), num(f.base), documento, f.nif,
      "", "", "",
    ]);
    if (!exenta) {
      rows.push([
        String(nAsiento), fecha, CUENTA_IVA_REPERCUTIDO, concepto,
        num(0), num(f.cuotaIva), documento, f.nif,
        "", "", "",
      ]);
    }
    nAsiento++;
  }

  const csv = rowsToCsv(rows);
  return new Blob([toLatin1Buffer(csv)], { type: "text/csv;charset=iso-8859-1" });
}

// -------------------- Sage 50 --------------------

/**
 * Columnas: Diario;NumAsiento;Fecha;Cuenta;Concepto;Debe;Haber;Documento;CIF;Base;TipoIVA;Cuota
 * Fecha = DD/MM/AAAA. UTF-8 con BOM.
 */
export function exportarFacturasSage50(facturas: FacturaContable[]): Blob {
  const header = [
    "Diario", "NumAsiento", "Fecha", "Cuenta", "Concepto", "Debe", "Haber",
    "Documento", "CIF", "Base", "TipoIVA", "Cuota",
  ];
  const rows: (string | number)[][] = [header];

  let nAsiento = 1;
  for (const f of facturas) {
    const fecha = fechaDDMMYYYY(f.fecha);
    const cuentaCliente = f.cuentaCliente || CUENTA_CLIENTE_DEFAULT;
    const cuentaIngreso = f.cuentaIngreso || CUENTA_INGRESO_DEFAULT;
    const concepto = conceptoDe(f);
    const documento = documentoDe(f);
    const exenta = f.tipoIva === 0;

    rows.push([
      "1", String(nAsiento), fecha, cuentaCliente, concepto,
      num(f.total), num(0), documento, f.nif,
      num(f.base), String(f.tipoIva), exenta ? "" : num(f.cuotaIva),
    ]);
    rows.push([
      "1", String(nAsiento), fecha, cuentaIngreso, concepto,
      num(0), num(f.base), documento, f.nif,
      "", "", "",
    ]);
    if (!exenta) {
      rows.push([
        "1", String(nAsiento), fecha, CUENTA_IVA_REPERCUTIDO, concepto,
        num(0), num(f.cuotaIva), documento, f.nif,
        "", "", "",
      ]);
    }
    nAsiento++;
  }

  const csv = rowsToCsv(rows);
  return new Blob([toUtf8BomBuffer(csv)], { type: "text/csv;charset=utf-8" });
}
