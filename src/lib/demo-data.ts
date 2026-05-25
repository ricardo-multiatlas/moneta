// Datos de demostración para Correduría OS — Moneta Seguros
export type Ramo = "Auto" | "Hogar" | "Vida" | "Salud" | "RC" | "Decesos" | "Comercio";
export type Aseguradora = "Mapfre" | "Allianz" | "Axa" | "Generali" | "Sanitas" | "Reale" | "Zurich" | "Mutua Madrileña";

export interface Cliente {
  id: string;
  nombre: string;
  tipo: "Particular" | "Empresa";
  ciudad: string;
  email: string;
  telefono: string;
  nif: string;
  comercial: string;
  polizasActivas: number;
  primaAnual: number;
  estado: "Al día" | "Pendiente doc." | "En revisión" | "Riesgo fuga";
  ultimoContacto: string;
  ultimoCanal: "Email" | "WhatsApp" | "Llamada" | "Visita";
  notas?: string;
}

export interface Poliza {
  id: string;
  numero: string;
  clienteId: string;
  cliente: string;
  ramo: Ramo;
  aseguradora: Aseguradora;
  prima: number;
  comision: number;
  inicio: string;
  vencimiento: string;
  estado: "Vigente" | "Pendiente firma" | "En renovación" | "Cancelada";
  diasParaVencer: number;
}

export interface Vencimiento {
  id: string;
  polizaId: string;
  numeroPoliza: string;
  cliente: string;
  ramo: Ramo;
  aseguradora: Aseguradora;
  fechaVencimiento: string;
  diasRestantes: number;
  prima: number;
  estadoAviso: "Pendiente" | "Aviso enviado" | "Cliente contactado" | "Renovada";
  comercial: string;
}

export interface InformeComision {
  id: string;
  aseguradora: Aseguradora;
  periodo: string;
  declaradoAseguradora: number;
  calculadoSistema: number;
  diferencia: number;
  polizas: number;
  estado: "Conciliado" | "Discrepancia" | "Pendiente subir" | "Reclamado";
  fechaSubida?: string;
}

export interface Factura {
  id: string;
  numero: string;
  cliente: string;
  concepto: string;
  importe: number;
  fechaEmision: string;
  fechaVencimiento: string;
  estado: "Emitida" | "Pagada" | "Vencida" | "Borrador";
}

export interface Lead {
  id: string;
  nombre: string;
  origen: "Web" | "Llamada" | "Recomendación" | "Campaña" | "Visita oficina";
  interes: Ramo;
  fechaContacto: string;
  estado: "Nuevo" | "Cualificado" | "Propuesta" | "Negociación" | "Ganado" | "Perdido";
  valorEstimado: number;
  comercial: string;
}

export const clientes: Cliente[] = [
  { id: "C-001", nombre: "García López, Francisco", tipo: "Particular", ciudad: "Sevilla", email: "fgarcia@email.com", telefono: "+34 615 234 891", nif: "28934512K", comercial: "María Ruiz", polizasActivas: 3, primaAnual: 2840, estado: "Al día", ultimoContacto: "Hoy, 10:45", ultimoCanal: "Llamada" },
  { id: "C-002", nombre: "Mobiliaria Sevilla S.L.", tipo: "Empresa", ciudad: "Sevilla", email: "admin@mobiliariasev.es", telefono: "+34 954 112 334", nif: "B91234567", comercial: "Diego Moneta", polizasActivas: 5, primaAnual: 14520, estado: "Pendiente doc.", ultimoContacto: "Ayer, 16:20", ultimoCanal: "WhatsApp", notas: "Pendiente certificado RC actualizado" },
  { id: "C-003", nombre: "Aranda Pérez, María Victoria", tipo: "Particular", ciudad: "Dos Hermanas", email: "mva.aranda@gmail.com", telefono: "+34 678 991 002", nif: "44521893L", comercial: "María Ruiz", polizasActivas: 2, primaAnual: 1240, estado: "Al día", ultimoContacto: "12 Sep", ultimoCanal: "Email" },
  { id: "C-004", nombre: "Transportes Soria S.L.", tipo: "Empresa", ciudad: "Huelva", email: "flotas@transportessoria.com", telefono: "+34 959 223 441", nif: "B21456789", comercial: "Carlos Vega", polizasActivas: 8, primaAnual: 38400, estado: "En revisión", ultimoContacto: "Ayer, 11:00", ultimoCanal: "Visita" },
  { id: "C-005", nombre: "Morante Jiménez, Ricardo", tipo: "Particular", ciudad: "Sevilla", email: "rmorante@email.com", telefono: "+34 622 884 110", nif: "29881234B", comercial: "María Ruiz", polizasActivas: 4, primaAnual: 3120, estado: "Al día", ultimoContacto: "Hoy, 09:15", ultimoCanal: "Email" },
  { id: "C-006", nombre: "Ortiz de Haro, Lucía", tipo: "Particular", ciudad: "Sevilla", email: "lortiz@email.com", telefono: "+34 611 442 998", nif: "30221993M", comercial: "Diego Moneta", polizasActivas: 2, primaAnual: 1680, estado: "Al día", ultimoContacto: "8 Sep", ultimoCanal: "Llamada" },
  { id: "C-007", nombre: "Del Nido Casaus, Antonio", tipo: "Particular", ciudad: "Cádiz", email: "adelnido@email.com", telefono: "+34 644 100 221", nif: "31998442N", comercial: "Carlos Vega", polizasActivas: 3, primaAnual: 2450, estado: "Riesgo fuga", ultimoContacto: "3 Sep", ultimoCanal: "Email", notas: "Ha pedido oferta competencia" },
  { id: "C-008", nombre: "Inmobiliaria Guadalquivir S.L.", tipo: "Empresa", ciudad: "Sevilla", email: "rrhh@inmoguadal.es", telefono: "+34 954 887 221", nif: "B91876543", comercial: "Diego Moneta", polizasActivas: 6, primaAnual: 22100, estado: "Al día", ultimoContacto: "11 Sep", ultimoCanal: "Email" },
  { id: "C-009", nombre: "Méndez Castro, Javier", tipo: "Particular", ciudad: "Sevilla", email: "jmendez@email.com", telefono: "+34 633 221 884", nif: "32114578P", comercial: "María Ruiz", polizasActivas: 1, primaAnual: 720, estado: "Pendiente doc.", ultimoContacto: "Ayer, 18:00", ultimoCanal: "WhatsApp" },
  { id: "C-010", nombre: "Baena Logística S.L.", tipo: "Empresa", ciudad: "Málaga", email: "info@baenalog.es", telefono: "+34 952 334 887", nif: "B29117788", comercial: "Carlos Vega", polizasActivas: 12, primaAnual: 67200, estado: "Al día", ultimoContacto: "10 Sep", ultimoCanal: "Visita" },
];

export const polizas: Poliza[] = [
  { id: "P-8821", numero: "MAP-AUTO-8821", clienteId: "C-009", cliente: "Méndez Castro, Javier", ramo: "Auto", aseguradora: "Mapfre", prima: 720, comision: 86.4, inicio: "2024-09-16", vencimiento: "2025-09-16", estado: "En renovación", diasParaVencer: 4 },
  { id: "P-3392", numero: "AXA-RC-3392", clienteId: "C-008", cliente: "Inmobiliaria Guadalquivir S.L.", ramo: "RC", aseguradora: "Axa", prima: 4200, comision: 630, inicio: "2024-09-24", vencimiento: "2025-09-24", estado: "En renovación", diasParaVencer: 12 },
  { id: "P-1140", numero: "ALL-AUTO-1140", clienteId: "C-001", cliente: "García López, Francisco", ramo: "Auto", aseguradora: "Allianz", prima: 890, comision: 124.6, inicio: "2024-09-12", vencimiento: "2025-09-12", estado: "Vigente", diasParaVencer: -1 },
  { id: "P-2201", numero: "MAP-RC-2201", clienteId: "C-002", cliente: "Mobiliaria Sevilla S.L.", ramo: "RC", aseguradora: "Mapfre", prima: 6800, comision: 952, inicio: "2024-09-24", vencimiento: "2025-09-24", estado: "Vigente", diasParaVencer: 12 },
  { id: "P-3301", numero: "AXA-HOG-3301", clienteId: "C-003", cliente: "Aranda Pérez, María Victoria", ramo: "Hogar", aseguradora: "Axa", prima: 380, comision: 57, inicio: "2024-10-05", vencimiento: "2025-10-05", estado: "Vigente", diasParaVencer: 27 },
  { id: "P-7720", numero: "SAN-SAL-7720", clienteId: "C-006", cliente: "Ortiz de Haro, Lucía", ramo: "Salud", aseguradora: "Sanitas", prima: 842, comision: 126.3, inicio: "2024-10-12", vencimiento: "2025-10-12", estado: "Vigente", diasParaVencer: 34 },
  { id: "P-9981", numero: "ALL-FLT-9981", clienteId: "C-004", cliente: "Transportes Soria S.L.", ramo: "Auto", aseguradora: "Allianz", prima: 18400, comision: 2576, inicio: "2024-11-01", vencimiento: "2025-11-01", estado: "Vigente", diasParaVencer: 54 },
  { id: "P-5512", numero: "GEN-HOG-5512", clienteId: "C-007", cliente: "Del Nido Casaus, Antonio", ramo: "Hogar", aseguradora: "Generali", prima: 415, comision: 62.25, inicio: "2024-09-20", vencimiento: "2025-09-20", estado: "En renovación", diasParaVencer: 8 },
  { id: "P-4423", numero: "REA-VID-4423", clienteId: "C-005", cliente: "Morante Jiménez, Ricardo", ramo: "Vida", aseguradora: "Reale", prima: 1240, comision: 248, inicio: "2025-01-10", vencimiento: "2026-01-10", estado: "Vigente", diasParaVencer: 124 },
  { id: "P-6634", numero: "ZUR-FLT-6634", clienteId: "C-010", cliente: "Baena Logística S.L.", ramo: "Auto", aseguradora: "Zurich", prima: 32100, comision: 4494, inicio: "2025-03-15", vencimiento: "2026-03-15", estado: "Vigente", diasParaVencer: 188 },
];

export const vencimientos: Vencimiento[] = polizas
  .filter((p) => p.diasParaVencer >= 0 && p.diasParaVencer <= 60)
  .map((p) => ({
    id: `V-${p.id}`,
    polizaId: p.id,
    numeroPoliza: p.numero,
    cliente: p.cliente,
    ramo: p.ramo,
    aseguradora: p.aseguradora,
    fechaVencimiento: p.vencimiento,
    diasRestantes: p.diasParaVencer,
    prima: p.prima,
    estadoAviso: p.diasParaVencer <= 7 ? "Aviso enviado" : p.diasParaVencer <= 20 ? "Cliente contactado" : "Pendiente",
    comercial: clientes.find((c) => c.id === p.clienteId)?.comercial ?? "—",
  }))
  .sort((a, b) => a.diasRestantes - b.diasRestantes);

export const informesComision: InformeComision[] = [
  { id: "IC-001", aseguradora: "Mapfre", periodo: "Abril 2026", declaradoAseguradora: 8420, calculadoSistema: 8420, diferencia: 0, polizas: 142, estado: "Conciliado", fechaSubida: "5 May 2026" },
  { id: "IC-002", aseguradora: "Axa", periodo: "Abril 2026", declaradoAseguradora: 3980, calculadoSistema: 4400, diferencia: -420, polizas: 67, estado: "Discrepancia", fechaSubida: "6 May 2026" },
  { id: "IC-003", aseguradora: "Allianz", periodo: "Abril 2026", declaradoAseguradora: 5210, calculadoSistema: 5210, diferencia: 0, polizas: 88, estado: "Conciliado", fechaSubida: "5 May 2026" },
  { id: "IC-004", aseguradora: "Generali", periodo: "Abril 2026", declaradoAseguradora: 0, calculadoSistema: 1880, diferencia: -1880, polizas: 34, estado: "Pendiente subir" },
  { id: "IC-005", aseguradora: "Sanitas", periodo: "Marzo 2026", declaradoAseguradora: 2140, calculadoSistema: 2380, diferencia: -240, polizas: 41, estado: "Reclamado", fechaSubida: "12 Abr 2026" },
  { id: "IC-006", aseguradora: "Zurich", periodo: "Abril 2026", declaradoAseguradora: 4490, calculadoSistema: 4494, diferencia: -4, polizas: 22, estado: "Conciliado", fechaSubida: "5 May 2026" },
  { id: "IC-007", aseguradora: "Reale", periodo: "Abril 2026", declaradoAseguradora: 0, calculadoSistema: 1120, diferencia: -1120, polizas: 19, estado: "Pendiente subir" },
  { id: "IC-008", aseguradora: "Mutua Madrileña", periodo: "Abril 2026", declaradoAseguradora: 980, calculadoSistema: 980, diferencia: 0, polizas: 16, estado: "Conciliado", fechaSubida: "6 May 2026" },
];

export const facturas: Factura[] = [
  { id: "F-001", numero: "2026/0142", cliente: "Mobiliaria Sevilla S.L.", concepto: "Comisión póliza RC Mapfre — Sep 2026", importe: 952, fechaEmision: "12 May 2026", fechaVencimiento: "12 Jun 2026", estado: "Emitida" },
  { id: "F-002", numero: "2026/0141", cliente: "Transportes Soria S.L.", concepto: "Minuta gestión flota Q2", importe: 1450, fechaEmision: "10 May 2026", fechaVencimiento: "10 Jun 2026", estado: "Pagada" },
  { id: "F-003", numero: "2026/0140", cliente: "Inmobiliaria Guadalquivir S.L.", concepto: "Comisión póliza RC Axa", importe: 630, fechaEmision: "8 May 2026", fechaVencimiento: "8 Jun 2026", estado: "Emitida" },
  { id: "F-004", numero: "2026/0139", cliente: "Baena Logística S.L.", concepto: "Comisión flota Zurich", importe: 4494, fechaEmision: "5 May 2026", fechaVencimiento: "5 Jun 2026", estado: "Emitida" },
  { id: "F-005", numero: "2026/0138", cliente: "García López, Francisco", concepto: "Minuta gestión auto", importe: 120, fechaEmision: "2 May 2026", fechaVencimiento: "2 Jun 2026", estado: "Pagada" },
  { id: "F-006", numero: "2026/0137", cliente: "Del Nido Casaus, Antonio", concepto: "Comisión hogar Generali", importe: 62, fechaEmision: "28 Abr 2026", fechaVencimiento: "28 May 2026", estado: "Vencida" },
  { id: "F-007", numero: "—", cliente: "Aranda Pérez, María Victoria", concepto: "Borrador renovación hogar", importe: 57, fechaEmision: "—", fechaVencimiento: "—", estado: "Borrador" },
];

export const leads: Lead[] = [
  { id: "L-001", nombre: "Sánchez Romero, Pedro", origen: "Web", interes: "Auto", fechaContacto: "Hoy", estado: "Nuevo", valorEstimado: 680, comercial: "María Ruiz" },
  { id: "L-002", nombre: "Construcciones Aljarafe S.L.", origen: "Recomendación", interes: "RC", fechaContacto: "Ayer", estado: "Cualificado", valorEstimado: 4200, comercial: "Diego Moneta" },
  { id: "L-003", nombre: "Vega Torres, Ana", origen: "Llamada", interes: "Hogar", fechaContacto: "3 días", estado: "Propuesta", valorEstimado: 420, comercial: "María Ruiz" },
  { id: "L-004", nombre: "Logística Bética S.A.", origen: "Web", interes: "Auto", fechaContacto: "5 días", estado: "Negociación", valorEstimado: 18400, comercial: "Carlos Vega" },
  { id: "L-005", nombre: "Romero Cádiz, Manuel", origen: "Recomendación", interes: "Vida", fechaContacto: "1 sem", estado: "Ganado", valorEstimado: 1240, comercial: "Diego Moneta" },
  { id: "L-006", nombre: "Reyes Magdalena, Carmen", origen: "Campaña", interes: "Salud", fechaContacto: "1 sem", estado: "Perdido", valorEstimado: 880, comercial: "María Ruiz" },
  { id: "L-007", nombre: "Tienda Triana SL", origen: "Visita oficina", interes: "Comercio", fechaContacto: "10 días", estado: "Cualificado", valorEstimado: 1880, comercial: "Carlos Vega" },
  { id: "L-008", nombre: "Jiménez Pardo, Eva", origen: "Web", interes: "Auto", fechaContacto: "Hoy", estado: "Nuevo", valorEstimado: 720, comercial: "María Ruiz" },
];

export const kpis = {
  polizasActivas: 1284,
  polizasDelta: "+3.2%",
  vencimientos60d: vencimientos.length,
  comisionesPendientes: 12450,
  comisionesAseguradoras: informesComision.filter((i) => i.estado !== "Conciliado").length,
  leadsActivos: leads.filter((l) => !["Ganado", "Perdido"].includes(l.estado)).length,
  leadsDelta: "+12%",
  ingresosRecurrentes: 142800,
  primaTotal: clientes.reduce((s, c) => s + c.primaAnual, 0),
};

export const canalesCaptacion = [
  { canal: "Web", leads: 14, conversion: 0.34, valorMedio: 920, color: "var(--brand)" },
  { canal: "Recomendación", leads: 9, conversion: 0.58, valorMedio: 2100, color: "var(--chart-2)" },
  { canal: "Llamada", leads: 6, conversion: 0.22, valorMedio: 540, color: "var(--chart-3)" },
  { canal: "Campaña", leads: 3, conversion: 0.18, valorMedio: 880, color: "var(--chart-4)" },
];

export const comerciales = [
  { nombre: "María Ruiz", cierres: 22, primaMes: 14200, conversion: 0.42 },
  { nombre: "Diego Moneta", cierres: 18, primaMes: 32400, conversion: 0.51 },
  { nombre: "Carlos Vega", cierres: 14, primaMes: 28800, conversion: 0.38 },
];
