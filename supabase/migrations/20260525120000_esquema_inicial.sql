-- FASE 0: ESQUEMA INICIAL DE CORREDURÍA OS (MONETA SEGUROS)

-- Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabla de Usuarios (Extendiendo Auth de Supabase)
CREATE TABLE IF NOT EXISTS public.usuarios (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('admin', 'comercial', 'backoffice')),
    oficina TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabla de Clientes
CREATE TABLE IF NOT EXISTS public.clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipo TEXT NOT NULL CHECK (tipo IN ('particular', 'empresa')),
    nombre_razon_social TEXT NOT NULL,
    nif_cif TEXT NOT NULL,
    email TEXT,
    telefono TEXT,
    direccion JSONB,
    comercial_asignado_id UUID REFERENCES public.usuarios(id),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabla de Pólizas
CREATE TABLE IF NOT EXISTS public.polizas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    numero_poliza TEXT NOT NULL,
    aseguradora TEXT NOT NULL,
    ramo TEXT NOT NULL,
    fecha_emision DATE,
    fecha_inicio DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    prima_anual DECIMAL(10,2) NOT NULL,
    comision_porcentaje DECIMAL(5,2),
    comision_importe DECIMAL(10,2),
    estado TEXT NOT NULL CHECK (estado IN ('activa', 'cancelada', 'renovada')),
    pdf_url TEXT,
    datos_extraidos JSONB,
    comercial_id UUID REFERENCES public.usuarios(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Tabla de Vencimientos (derivada)
CREATE TABLE IF NOT EXISTS public.vencimientos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    poliza_id UUID NOT NULL REFERENCES public.polizas(id) ON DELETE CASCADE,
    fecha_vencimiento DATE NOT NULL,
    estado TEXT NOT NULL CHECK (estado IN ('pendiente', 'avisado', 'renovado')),
    dias_aviso INTEGER DEFAULT 60,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Políticas RLS (Row Level Security)

-- Clientes
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios ven sus clientes o todos si son admin"
ON public.clientes FOR SELECT
USING (
  auth.uid() = comercial_asignado_id OR 
  EXISTS (SELECT 1 FROM public.usuarios WHERE id = auth.uid() AND rol = 'admin')
);

CREATE POLICY "Usuarios pueden insertar clientes"
ON public.clientes FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Polizas
ALTER TABLE public.polizas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios ven pólizas de sus clientes o todas si admin"
ON public.polizas FOR SELECT
USING (
  auth.uid() = comercial_id OR 
  EXISTS (SELECT 1 FROM public.usuarios WHERE id = auth.uid() AND rol = 'admin')
);

CREATE POLICY "Usuarios pueden insertar pólizas"
ON public.polizas FOR INSERT
WITH CHECK (auth.role() = 'authenticated');
