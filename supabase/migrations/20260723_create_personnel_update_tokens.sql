-- Migration: Create personnel_update_tokens table for worker self-service profile update links
CREATE TABLE IF NOT EXISTS public.personnel_update_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  personnel_id UUID NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personnel_update_tokens_token ON public.personnel_update_tokens(token);
CREATE INDEX IF NOT EXISTS idx_personnel_update_tokens_personnel ON public.personnel_update_tokens(personnel_id);

ALTER TABLE public.personnel_update_tokens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'personnel_update_tokens'
      AND policyname = 'Anyone authenticated or with token can manage personnel_update_tokens'
  ) THEN
    CREATE POLICY "Anyone authenticated or with token can manage personnel_update_tokens"
      ON public.personnel_update_tokens FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
