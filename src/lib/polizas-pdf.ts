import { jsPDF } from "jspdf";
import { supabase } from "@/lib/supabase";

export interface PolizaPDFData {
  numero_poliza: string;
  ramo: string;
  aseguradora: string;
  prima_anual: number | string;
  fecha_inicio: string;
  fecha_vencimiento: string;
  cliente_nombre: string;
  cliente_nif?: string | null;
  cliente_email?: string | null;
  cliente_telefono?: string | null;
}

/**
 * Genera un PDF con la ficha de la póliza, estilo carta de aviso de
 * correduría. Devuelve el Blob para que el caller decida si subirlo a
 * Storage o descargarlo localmente.
 */
export function generarPolizaPDF(data: PolizaPDFData): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  // Cabecera
  doc.setFillColor(15, 30, 45);
  doc.rect(0, 0, W, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Correduría Moneta", 14, 14);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Sevilla · monetaseguros.es · 954 00 00 00", 14, 20);

  doc.setFontSize(10);
  doc.text("FICHA DE PÓLIZA", W - 14, 14, { align: "right" });
  doc.setFontSize(8);
  doc.text(new Date().toLocaleDateString("es-ES"), W - 14, 20, { align: "right" });

  // Cuerpo
  doc.setTextColor(20, 20, 20);
  let y = 42;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Póliza nº ${data.numero_poliza}`, 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${data.ramo} · ${data.aseguradora}`, 14, y);

  y += 12;
  doc.setDrawColor(220, 220, 220);
  doc.line(14, y, W - 14, y);

  // Tomador
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("TOMADOR", 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(data.cliente_nombre, 14, y);
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  if (data.cliente_nif) { doc.text(`NIF/CIF: ${data.cliente_nif}`, 14, y); y += 4; }
  if (data.cliente_email) { doc.text(`Email: ${data.cliente_email}`, 14, y); y += 4; }
  if (data.cliente_telefono) { doc.text(`Teléfono: ${data.cliente_telefono}`, 14, y); y += 4; }
  doc.setTextColor(20, 20, 20);

  // Tabla de datos
  y += 8;
  doc.setDrawColor(220, 220, 220);
  doc.line(14, y, W - 14, y);

  const rowH = 8;
  const drawRow = (label: string, value: string) => {
    y += rowH;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    doc.text(label, 14, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    doc.text(value, W - 14, y, { align: "right" });
    doc.setDrawColor(240, 240, 240);
    doc.line(14, y + 2, W - 14, y + 2);
  };

  y += 4;
  drawRow("Ramo", data.ramo);
  drawRow("Aseguradora", data.aseguradora);
  drawRow("Fecha inicio", formatFecha(data.fecha_inicio));
  drawRow("Fecha vencimiento", formatFecha(data.fecha_vencimiento));
  drawRow("Prima anual", `${Number(data.prima_anual).toFixed(2)} €`);

  // Pie
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(
    "Documento generado automáticamente por Correduría OS · Soberanía de datos · RGPD",
    W / 2,
    285,
    { align: "center" }
  );

  return doc.output("blob");
}

function formatFecha(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-ES");
}

/**
 * Sube un PDF (generado o cargado) al bucket `polizas-pdf`
 * y devuelve la URL pública.
 */
export async function subirPolizaPDF(
  polizaId: string,
  blobOrFile: Blob | File,
  filename?: string
): Promise<string | null> {
  const name = filename || `poliza_${polizaId}_${Date.now()}.pdf`;
  const path = `${polizaId}/${name}`;
  const { error } = await supabase.storage
    .from("polizas-pdf")
    .upload(path, blobOrFile, { upsert: true, contentType: "application/pdf" });
  if (error) {
    console.warn("Error subiendo PDF:", error.message);
    return null;
  }
  const { data } = supabase.storage.from("polizas-pdf").getPublicUrl(path);
  return data?.publicUrl ?? null;
}
