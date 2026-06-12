-- Migration: Create personnel_letters table for amonestaciones and felicitaciones
CREATE TABLE IF NOT EXISTS public.personnel_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id uuid NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('FELICITACION', 'AMONESTACION')),
  date date NOT NULL,
  reason text NOT NULL,
  file_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_personnel_letters_personnel_id ON public.personnel_letters(personnel_id);

-- Enable RLS
ALTER TABLE public.personnel_letters ENABLE ROW LEVEL SECURITY;

-- Policies for RLS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'personnel_letters'
      AND policyname = 'Users can read their own letters'
  ) THEN
    CREATE POLICY "Users can read their own letters"
      ON public.personnel_letters FOR SELECT
      USING (
        personnel_id IN (
          SELECT id FROM public.personnel WHERE user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.users
          WHERE id = auth.uid() AND role IN ('ADMIN', 'HR', 'SUPERVISOR', 'AIRPORT_ASSISTANT')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'personnel_letters'
      AND policyname = 'Admins and Airport Assistants can manage letters'
  ) THEN
    CREATE POLICY "Admins and Airport Assistants can manage letters"
      ON public.personnel_letters FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.users
          WHERE id = auth.uid() AND role IN ('ADMIN', 'AIRPORT_ASSISTANT')
        )
      );
  END IF;
END
$$;
