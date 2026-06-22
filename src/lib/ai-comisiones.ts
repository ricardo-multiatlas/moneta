import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { mistral } from "@ai-sdk/mistral";
import { z } from "zod";

/**
 * Extrae las líneas de un informe de comisiones (PDF o CSV) en JSON.
 * Cada línea: numero_poliza, tomador, importe_declarado.
 */
const ComisionInformeSchema = z.object({
  aseguradora: z.string().describe("Compañía aseguradora que emite el informe"),
  periodo: z.string().describe("Periodo reportado (ej. Mayo 2026)"),
  lineas: z
    .array(
      z.object({
        numero_poliza: z.string().describe("Número de la póliza tal cual aparece en el informe"),
        tomador: z.string().optional().describe("Nombre del tomador si aparece"),
        importe_declarado: z.number().describe("Importe de comisión declarado por la aseguradora en euros"),
      })
    )
    .describe("Una entrada por póliza listada en el informe"),
  importe_total: z.number().describe("Total reclamado por la aseguradora en euros"),
});

export const extractComisionFn = createServerFn({ method: "POST" })
  .inputValidator((d: { fileBase64: string; mimeType: string }) => d)
  .handler(async ({ data }) => {
    try {
      if (!process.env.MISTRAL_API_KEY) {
        return { success: false as const, error: "MISTRAL_API_KEY no configurada — IA deshabilitada temporalmente" };
      }
      const result = await generateObject({
        model: mistral("mistral-medium-latest"),
        schema: ComisionInformeSchema,
        messages: [
          {
            role: "system",
            content: "Responde en espanol. La respuesta debe ser un JSON valido segun el schema indicado.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Este archivo es un informe mensual de comisiones de una aseguradora española. Extrae todas las líneas con número de póliza, tomador e importe de comisión declarado. Devuelve también la aseguradora, el periodo y el importe total.",
              },
              { type: "file", data: data.fileBase64, mediaType: data.mimeType },
            ],
          },
        ],
      });

      return { success: true as const, data: result.object };
    } catch (e: any) {
      console.error("ExtractComision error:", e);
      return { success: false as const, error: e.message as string };
    }
  });
