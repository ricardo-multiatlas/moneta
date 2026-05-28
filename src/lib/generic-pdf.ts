import { jsPDF } from "jspdf";

interface FichaPDF {
  titulo: string;
  subtitulo?: string;
  bloques: Array<{
    titulo: string;
    filas: Array<[string, string | number]>;
  }>;
  tablas?: Array<{
    titulo: string;
    columnas: string[];
    filas: Array<Array<string | number>>;
  }>;
}

export function generarFichaPDF(data: FichaPDF): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = 0;

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
  doc.text(data.titulo.toUpperCase(), W - 14, 14, { align: "right" });
  doc.setFontSize(8);
  doc.text(new Date().toLocaleDateString("es-ES"), W - 14, 20, { align: "right" });

  doc.setTextColor(20, 20, 20);
  y = 42;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(data.titulo, 14, y);
  if (data.subtitulo) {
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(data.subtitulo, 14, y);
  }
  y += 6;
  doc.setDrawColor(220, 220, 220);
  doc.line(14, y, W - 14, y);
  y += 4;

  const ensurePage = (need: number) => {
    if (y + need > H - 15) {
      doc.addPage();
      y = 20;
    }
  };

  // Bloques clave-valor
  for (const bloque of data.bloques) {
    ensurePage(20);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    doc.text(bloque.titulo.toUpperCase(), 14, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    for (const [k, v] of bloque.filas) {
      ensurePage(7);
      y += 6;
      doc.setTextColor(110, 110, 110);
      doc.text(k, 14, y);
      doc.setTextColor(20, 20, 20);
      doc.text(String(v), W - 14, y, { align: "right" });
      doc.setDrawColor(240, 240, 240);
      doc.line(14, y + 1.5, W - 14, y + 1.5);
    }
  }

  // Tablas
  if (data.tablas) {
    for (const tabla of data.tablas) {
      ensurePage(20);
      y += 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(20, 20, 20);
      doc.text(tabla.titulo.toUpperCase(), 14, y);
      y += 4;
      const colCount = tabla.columnas.length;
      const colW = (W - 28) / colCount;
      ensurePage(12);
      y += 6;
      doc.setFillColor(245, 246, 248);
      doc.rect(14, y - 4, W - 28, 6, "F");
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      tabla.columnas.forEach((c, i) => {
        doc.text(c, 16 + i * colW, y);
      });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 30, 30);
      for (const fila of tabla.filas) {
        ensurePage(6);
        y += 6;
        fila.forEach((v, i) => {
          doc.text(String(v).slice(0, 30), 16 + i * colW, y);
        });
        doc.setDrawColor(240, 240, 240);
        doc.line(14, y + 1.5, W - 14, y + 1.5);
      }
    }
  }

  // Pie
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(
    "Documento generado automáticamente por Correduría OS · RGPD",
    W / 2,
    H - 8,
    { align: "center" }
  );

  return doc.output("blob");
}

export function descargarBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function imprimirBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (w) w.addEventListener("load", () => w.print(), { once: true });
}
