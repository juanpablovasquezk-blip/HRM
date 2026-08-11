-- =============================================================================
-- DISMISSAL RECORDS (TICA / PCP Return Process)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dismissal_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id    UUID NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
  credential_type TEXT NOT NULL CHECK (credential_type IN ('TICA', 'PCP')),
  
  -- True if the worker refused to return the card
  refused_to_return BOOLEAN NOT NULL DEFAULT false,
  
  -- Copied image url of the card at dismissal time (for PDF page 2)
  credential_image_url TEXT,
  
  -- Uploaded DGAC signed receipt
  receipt_file_url  TEXT,
  
  -- Status of the return process
  status          TEXT NOT NULL DEFAULT 'pending' 
                  CHECK (status IN ('pending', 'completed')),
  
  -- Metadata
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  created_by      UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_dismissal_records_personnel ON public.dismissal_records(personnel_id);
CREATE INDEX IF NOT EXISTS idx_dismissal_records_status ON public.dismissal_records(status);

-- Add dismissal_status to personnel
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS 
  dismissal_status TEXT CHECK (dismissal_status IN ('pending', 'completed'));

-- Enable RLS
ALTER TABLE public.dismissal_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Staff can manage dismissal records"
  ON public.dismissal_records FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR')
    )
  );

CREATE POLICY "Users can read own dismissal records"
  ON public.dismissal_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.personnel p
      WHERE p.id = dismissal_records.personnel_id
      AND p.user_id = auth.uid()
    )
  );
