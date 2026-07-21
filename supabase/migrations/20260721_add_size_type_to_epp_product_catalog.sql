-- Migration: Add size_type column to epp_product_catalog
-- Differentiates between LETTER (S, M, L...), NUMBER (36, 38...) and SHOE (35, 36...) sizes

ALTER TABLE public.epp_product_catalog
  ADD COLUMN IF NOT EXISTS size_type TEXT CHECK (size_type IN ('LETTER', 'NUMBER', 'SHOE')) DEFAULT NULL;

-- Also ensure epp_size_tokens table exists (may not have been applied yet)
CREATE TABLE IF NOT EXISTS public.epp_size_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  personnel_id UUID NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_epp_size_tokens_token ON public.epp_size_tokens(token);
CREATE INDEX IF NOT EXISTS idx_epp_size_tokens_personnel ON public.epp_size_tokens(personnel_id);

ALTER TABLE public.epp_size_tokens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'epp_size_tokens'
      AND policyname = 'Anyone authenticated or with token can manage epp_size_tokens'
  ) THEN
    CREATE POLICY "Anyone authenticated or with token can manage epp_size_tokens"
      ON public.epp_size_tokens FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
