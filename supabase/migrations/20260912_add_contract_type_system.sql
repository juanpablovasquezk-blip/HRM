-- =============================================================================
-- Migration: Add Contract Type System (Plazo Fijo / Indefinido) and History
-- Date: 2026-09-12
-- =============================================================================

-- 1. Add contract fields to personnel table
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS contract_type TEXT 
  CHECK (contract_type IN ('PLAZO_FIJO', 'INDEFINIDO')) 
  DEFAULT 'PLAZO_FIJO';

ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS contract_start_date DATE;
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS contract_duration_days INT;
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS contract_end_date DATE;
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS indefinite_contract_date DATE;

-- Populate existing personnel with hire_date as contract_start_date if not set
UPDATE public.personnel 
SET contract_start_date = hire_date 
WHERE contract_start_date IS NULL AND hire_date IS NOT NULL;

-- 2. Create personnel_contract_history table
CREATE TABLE IF NOT EXISTS public.personnel_contract_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id UUID NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
  contract_type TEXT NOT NULL CHECK (contract_type IN ('PLAZO_FIJO', 'INDEFINIDO')),
  start_date DATE NOT NULL,
  duration_days INT,
  end_date DATE,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_hist_personnel ON public.personnel_contract_history(personnel_id);
CREATE INDEX IF NOT EXISTS idx_contract_hist_dates ON public.personnel_contract_history(start_date, end_date);

-- Enable RLS for history
ALTER TABLE public.personnel_contract_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'personnel_contract_history' 
      AND policyname = 'Staff can manage contract history'
  ) THEN
    CREATE POLICY "Staff can manage contract history"
      ON public.personnel_contract_history FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid()
          AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'personnel_contract_history' 
      AND policyname = 'Users can view own contract history'
  ) THEN
    CREATE POLICY "Users can view own contract history"
      ON public.personnel_contract_history FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.personnel p
          WHERE p.id = personnel_contract_history.personnel_id
          AND p.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 3. Add contract_eligibility to epp_product_catalog
ALTER TABLE public.epp_product_catalog ADD COLUMN IF NOT EXISTS contract_eligibility TEXT 
  CHECK (contract_eligibility IN ('PLAZO_FIJO', 'INDEFINIDO', 'AMBOS')) 
  DEFAULT 'AMBOS';

CREATE INDEX IF NOT EXISTS idx_epp_catalog_contract ON public.epp_product_catalog(contract_eligibility);
