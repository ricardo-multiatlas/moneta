-- FASE 3 y 4: ESQUEMA DE COMISIONES, FACTURACIÓN Y CAPTACIÓN

-- 5. Tabla de Comisiones (Reportes de Aseguradoras)
CREATE TABLE IF NOT EXISTS public.comisiones_reportes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aseguradora TEXT NOT NULL,
    periodo TEXT NOT NULL, -- ej. "Mayo 2026"
    polizas_count INTEGER DEFAULT 0,
    importe_calculado DECIMAL(10,2) DEFAULT 0,
    importe_declarado DECIMAL(10,2) DEFAULT 0,
    diferencia DECIMAL(10,2) DEFAULT 0,
    estado TEXT NOT NULL CHECK (estado IN ('Pendiente subir', 'Conciliado', 'Discrepancia', 'Reclamado')),
    pdf_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Tabla de Facturas
CREATE TABLE IF NOT EXISTS public.facturas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero_factura TEXT UNIQUE NOT NULL,
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    poliza_id UUID REFERENCES public.polizas(id) ON DELETE SET NULL,
    concepto TEXT NOT NULL,
    fecha_emision DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    importe DECIMAL(10,2) NOT NULL,
    estado TEXT NOT NULL CHECK (estado IN ('Emitida', 'Vencida', 'Pagada', 'Anulada')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Tabla de Leads (Captación)
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre TEXT NOT NULL,
    origen TEXT NOT NULL,
    interes TEXT NOT NULL,
    comercial_asignado_id UUID REFERENCES public.usuarios(id),
    valor_estimado DECIMAL(10,2) DEFAULT 0,
    fecha_contacto DATE,
    estado TEXT NOT NULL CHECK (estado IN ('Nuevo', 'Cualificado', 'Propuesta', 'Negociación', 'Ganado', 'Perdido')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Políticas RLS (Row Level Security) básicas

-- Facturas
ALTER TABLE public.facturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios ven facturas de sus clientes o todas si admin"
ON public.facturas FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.clientes WHERE clientes.id = facturas.cliente_id AND clientes.comercial_asignado_id = auth.uid()) OR 
  EXISTS (SELECT 1 FROM public.usuarios WHERE id = auth.uid() AND rol = 'admin')
);

CREATE POLICY "Usuarios autenticados pueden insertar facturas"
ON public.facturas FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Leads
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios ven sus leads o todos si admin"
ON public.leads FOR SELECT
USING (
  auth.uid() = comercial_asignado_id OR 
  EXISTS (SELECT 1 FROM public.usuarios WHERE id = auth.uid() AND rol = 'admin')
);

CREATE POLICY "Usuarios autenticados pueden insertar leads"
ON public.leads FOR INSERT
WITH CHECK (auth.role() = 'authenticated');
