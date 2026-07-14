-- Add emergency contact fields to personnel
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT;
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;

-- Add clothing sizes to personnel
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS clothing_tshirt_size TEXT;
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS clothing_polar_size TEXT;
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS clothing_pants_size_letter TEXT;
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS clothing_pants_size_number TEXT;
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS clothing_shoe_size TEXT;
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS clothing_parka_size TEXT;
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS clothing_overall_size TEXT;

-- Add onboarding status to personnel
-- 'pending' = submitted by worker, waiting for admin approval
-- 'approved' = approved by admin, becomes active worker
-- 'rejected' = rejected by admin
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS onboarding_status TEXT DEFAULT NULL;

-- Add AFP and Health System fields
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS afp TEXT;
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS health_system TEXT;
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS isapre TEXT;

-- Add Gender and Bank details fields
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS bank_account_type TEXT;
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS bank_account_number TEXT;



-- Create onboarding tokens table
CREATE TABLE IF NOT EXISTS public.onboarding_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_onboarding_tokens_token ON public.onboarding_tokens(token);

-- Enable RLS
ALTER TABLE public.onboarding_tokens ENABLE ROW LEVEL SECURITY;

-- Simple policies: admins can do everything
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'onboarding_tokens'
      AND policyname = 'Admins can manage onboarding tokens'
  ) THEN
    CREATE POLICY "Admins can manage onboarding tokens"
      ON public.onboarding_tokens FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.users
          WHERE id = auth.uid() AND role IN ('ADMIN', 'HR')
        )
      );
  END IF;

  -- Allow public select of token for verification on the public page
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'onboarding_tokens'
      AND policyname = 'Anyone can view onboarding tokens'
  ) THEN
    CREATE POLICY "Anyone can view onboarding tokens"
      ON public.onboarding_tokens FOR SELECT
      USING (true);
  END IF;
END
$$;
