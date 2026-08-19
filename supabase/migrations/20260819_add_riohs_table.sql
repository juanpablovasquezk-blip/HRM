-- Migration to add RIOHS records table for Prevencion de Riesgos module

CREATE TABLE IF NOT EXISTS public.riohs_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id UUID NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  
  -- Status tracking: PENDING, AUTH_GENERATED, AUTH_UPLOADED, RIOHS_SENT, COMPLETED
  status TEXT NOT NULL DEFAULT 'PENDING' 
    CHECK (status IN ('PENDING', 'AUTH_GENERATED', 'AUTH_UPLOADED', 'RIOHS_SENT', 'COMPLETED')),
  
  -- Step 1: Authorization generated
  auth_generated_at TIMESTAMPTZ,
  
  -- Step 2: Signed authorization upload
  auth_signed_file_url TEXT,
  auth_uploaded_at TIMESTAMPTZ,
  auth_uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  
  -- Step 3: RIOHS email sent
  riohs_sent_at TIMESTAMPTZ,
  riohs_sent_to_email TEXT,
  riohs_sent_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  
  -- Step 4: Signed reception upload
  reception_signed_file_url TEXT,
  reception_uploaded_at TIMESTAMPTZ,
  reception_uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_personnel_riohs UNIQUE (personnel_id)
);

CREATE INDEX IF NOT EXISTS idx_riohs_personnel ON public.riohs_records(personnel_id);
CREATE INDEX IF NOT EXISTS idx_riohs_company ON public.riohs_records(company_id);
CREATE INDEX IF NOT EXISTS idx_riohs_status ON public.riohs_records(status);

ALTER TABLE public.riohs_records ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'riohs_records' AND policyname = 'Allow authenticated users to manage riohs_records'
  ) THEN
    CREATE POLICY "Allow authenticated users to manage riohs_records"
      ON public.riohs_records
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
