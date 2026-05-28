import * as XLSX from "xlsx";

/**
 * Descarga un .xlsx desde un array de objetos.
 * El primer objeto define las columnas.
 */
export function exportarExcel(
  filename: string,
  hojaNombre: string,
  rows: Record<string, unknown>[]
) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, hojaNombre.slice(0, 31)); // límite Excel
  XLSX.writeFile(wb, filename, { bookType: "xlsx" });
}
