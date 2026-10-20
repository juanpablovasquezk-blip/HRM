-- =============================================================================
-- Migration: Create bonus_types and bonus_records tables
-- Description: Módulo integral de gestión y definición de bonos
-- =============================================================================

-- 1. Tabla de Tipos de Bonos (Catálogo Definible)
CREATE TABLE IF NOT EXISTS public.bonus_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  default_amount INTEGER NOT NULL DEFAULT 0 CHECK (default_amount >= 0),
  amount_is_editable BOOLEAN NOT NULL DEFAULT false,
  requires_ot BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de bonus_types
CREATE INDEX IF NOT EXISTS idx_bonus_types_active ON public.bonus_types(active);
CREATE INDEX IF NOT EXISTS idx_bonus_types_code ON public.bonus_types(code);

-- 2. Tabla de Registros de Bonos
CREATE TABLE IF NOT EXISTS public.bonus_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id UUID NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
  bonus_type_id UUID NOT NULL REFERENCES public.bonus_types(id) ON DELETE RESTRICT,
  date DATE NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  ot_number TEXT,
  observations TEXT,
  paid_month TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided')),
  voided_at TIMESTAMPTZ DEFAULT NULL,
  voided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  void_reason TEXT DEFAULT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'womm', 'import')),
  external_ref TEXT DEFAULT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de bonus_records para búsquedas rápidas y reportes
CREATE INDEX IF NOT EXISTS idx_bonus_records_personnel ON public.bonus_records(personnel_id);
CREATE INDEX IF NOT EXISTS idx_bonus_records_type ON public.bonus_records(bonus_type_id);
CREATE INDEX IF NOT EXISTS idx_bonus_records_date ON public.bonus_records(date);
CREATE INDEX IF NOT EXISTS idx_bonus_records_paid_month ON public.bonus_records(paid_month);
CREATE INDEX IF NOT EXISTS idx_bonus_records_status ON public.bonus_records(status);
CREATE INDEX IF NOT EXISTS idx_bonus_records_ot ON public.bonus_records(ot_number);

-- Regla única de negocio: Un colaborador no puede cobrar 2 veces el mismo tipo de bono por la misma OT si el bono está ACTIVO
CREATE UNIQUE INDEX IF NOT EXISTS uq_bonus_records_personnel_type_ot_active 
  ON public.bonus_records(personnel_id, bonus_type_id, ot_number)
  WHERE status = 'active' AND ot_number IS NOT NULL AND ot_number <> '';

-- 3. Habilitar RLS
ALTER TABLE public.bonus_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_records ENABLE ROW LEVEL SECURITY;

-- Políticas bonus_types
CREATE POLICY "Users can view bonus_types" ON public.bonus_types
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage bonus_types" ON public.bonus_types
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('ADMIN', 'HR')
    )
  );

-- Políticas bonus_records
CREATE POLICY "Users can view bonus_records" ON public.bonus_records
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND (
      -- Admins y HR ven todo
      EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND role IN ('ADMIN', 'HR')
      )
      -- Supervisores ven los de su área o asignaciones (o authenticated)
      OR EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND role = 'SUPERVISOR'
      )
      -- Trabajadores ven solo los suyos
      OR personnel_id IN (
        SELECT id FROM public.personnel WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Admins can insert bonus_records" ON public.bonus_records
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('ADMIN', 'HR')
    )
  );

CREATE POLICY "Admins can update bonus_records" ON public.bonus_records
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('ADMIN', 'HR')
    )
  );

CREATE POLICY "Admins can delete bonus_records" ON public.bonus_records
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('ADMIN', 'HR')
    )
  );

-- 4. Seed Inicial de Tipos de Bonos
INSERT INTO public.bonus_types (code, name, description, default_amount, amount_is_editable, requires_ot, active)
VALUES 
  ('ESPECIAL', 'Bono Especial', 'Bono asignado manualmente por actos especiales u ocasiones extraordinarias', 0, true, false, true),
  ('STALL', 'Bono Stall', 'Bono por limpieza, desarmado o armado de stall asociado a N° de OT ($8.000)', 8000, false, true, true),
  ('DERRAME', 'Bono Contención de Derrame', 'Bono por contención y control de derrame asociado a N° de OT ($16.500)', 16500, false, true, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  default_amount = EXCLUDED.default_amount,
  amount_is_editable = EXCLUDED.amount_is_editable,
  requires_ot = EXCLUDED.requires_ot;

-- 5. Migración de Datos Históricos de special_bonuses a bonus_records
DO $$
DECLARE
  v_especial_type_id UUID;
BEGIN
  SELECT id INTO v_especial_type_id FROM public.bonus_types WHERE code = 'ESPECIAL' LIMIT 1;
  
  IF v_especial_type_id IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'special_bonuses') THEN
    INSERT INTO public.bonus_records (
      id,
      personnel_id,
      bonus_type_id,
      date,
      amount,
      ot_number,
      observations,
      paid_month,
      status,
      source,
      created_by,
      created_at
    )
    SELECT
      sb.id,
      sb.personnel_id,
      v_especial_type_id,
      sb.date,
      sb.amount,
      NULL,
      sb.reason,
      sb.paid_month,
      'active',
      'manual',
      sb.created_by,
      sb.created_at
    FROM public.special_bonuses sb
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
