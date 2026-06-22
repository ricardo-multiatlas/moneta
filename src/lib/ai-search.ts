import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { mistral } from "@ai-sdk/mistral";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

/**
 * Búsqueda en lenguaje natural.
 * El modelo NO genera SQL libre: genera una intención estructurada
 * (entidad + filtros) que luego ejecutamos contra Supabase. Esto evita
 * inyección y ataques tipo "borra todos los clientes".
 */
const QuerySchema = z.object({
  entidad: z.enum(["clientes", "polizas", "vencimientos", "facturas", "leads"]),
  filtros: z
    .object({
      texto: z.string().optional().describe("Búsqueda textual libre (nombre, NIF, número póliza)"),
      ramo: z.string().optional().describe("Ej: Auto, Hogar, Vida, Salud, Comercio, RC"),
      aseguradora: z.string().optional(),
      estado: z.string().optional(),
      ciudad: z.string().optional(),
      tipo: z.string().optional().describe("particular o empresa"),
      vence_antes_de: z.string().optional().describe("Fecha ISO yyyy-mm-dd"),
      vence_despues_de: z.string().optional().describe("Fecha ISO yyyy-mm-dd"),
    })
    .default({}),
  limite: z.number().int().min(1).max(100).default(25),
  explicacion: z.string().describe("Resumen en español de cómo se interpretó la pregunta"),
});

export const naturalSearchFn = createServerFn({ method: "POST" })
  .inputValidator((d: { prompt: string }) => d)
  .handler(async ({ data }) => {
    try {
      if (!process.env.MISTRAL_API_KEY) {
        return { success: false as const, error: "MISTRAL_API_KEY no configurada — IA deshabilitada temporalmente" };
      }
      const today = new Date().toISOString().split("T")[0];

      const result = await generateObject({
        model: mistral("mistral-small-latest"),
        schema: QuerySchema,
        messages: [
          {
            role: "system",
            content: `Eres un asistente que interpreta búsquedas en lenguaje natural sobre una correduría de seguros española.
Fecha de hoy: ${today}.
Convertir frases del estilo "muéstrame los clientes de Sevilla con auto que vence antes de septiembre" en filtros estructurados.
Si no encaja con ninguna entidad, usa "clientes" por defecto.
Responde en espanol. La respuesta debe ser un JSON valido segun el schema indicado.`,
          },
          { role: "user", content: data.prompt },
        ],
      });

      const intent = result.object;
      const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
      const sb = createClient(url, key);

      let query: any;
      switch (intent.entidad) {
        case "clientes":
          query = sb.from("clientes").select("id, nombre_razon_social, tipo, nif_cif, email, telefono, direccion, estado");
          if (intent.filtros.tipo) query = query.ilike("tipo", intent.filtros.tipo);
          if (intent.filtros.texto) {
            const t = `%${intent.filtros.texto}%`;
            query = query.or(`nombre_razon_social.ilike.${t},nif_cif.ilike.${t},email.ilike.${t}`);
          }
          break;
        case "polizas":
          query = sb.from("polizas").select("id, numero_poliza, ramo, aseguradora, prima_anual, fecha_vencimiento, estado, clientes(nombre_razon_social)");
          if (intent.filtros.ramo) query = query.ilike("ramo", intent.filtros.ramo);
          if (intent.filtros.aseguradora) query = query.ilike("aseguradora", `%${intent.filtros.aseguradora}%`);
          if (intent.filtros.estado) query = query.ilike("estado", intent.filtros.estado);
          if (intent.filtros.vence_antes_de) query = query.lte("fecha_vencimiento", intent.filtros.vence_antes_de);
          if (intent.filtros.vence_despues_de) query = query.gte("fecha_vencimiento", intent.filtros.vence_despues_de);
          if (intent.filtros.texto) query = query.ilike("numero_poliza", `%${intent.filtros.texto}%`);
          break;
        case "vencimientos":
          query = sb.from("vencimientos").select("id, fecha_vencimiento, estado, polizas(numero_poliza, ramo, aseguradora, prima_anual, clientes(nombre_razon_social))").order("fecha_vencimiento");
          if (intent.filtros.estado) query = query.ilike("estado", intent.filtros.estado);
          if (intent.filtros.vence_antes_de) query = query.lte("fecha_vencimiento", intent.filtros.vence_antes_de);
          if (intent.filtros.vence_despues_de) query = query.gte("fecha_vencimiento", intent.filtros.vence_despues_de);
          break;
        case "facturas":
          query = sb.from("facturas").select("id, numero_factura, concepto, importe_total, estado, fecha_emision, clientes(nombre_razon_social)");
          if (intent.filtros.estado) query = query.ilike("estado", intent.filtros.estado);
          if (intent.filtros.texto) query = query.ilike("numero_factura", `%${intent.filtros.texto}%`);
          break;
        case "leads":
          query = sb.from("leads").select("id, nombre, origen, interes, valor_estimado, fecha_contacto, estado");
          if (intent.filtros.estado) query = query.ilike("estado", intent.filtros.estado);
          if (intent.filtros.texto) query = query.ilike("nombre", `%${intent.filtros.texto}%`);
          break;
      }

      const { data: rows, error } = await query.limit(intent.limite);
      if (error) throw error;

      return {
        success: true as const,
        entidad: intent.entidad,
        explicacion: intent.explicacion,
        rows: rows || [],
      };
    } catch (e: any) {
      return { success: false as const, error: e.message || "Error inesperado" };
    }
  });
