-- ============================================================
-- Migration: Create roster_audit_logs table
-- Run this in the Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.roster_audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid REFERENCES public.shift_assignments(id) ON DELETE SET NULL,
  personnel_id    uuid NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
  date            date NOT NULL,
  previous_shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  new_shift_id    uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  reason          text,
  changed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups by personnel and date (used in publishAssignments)
CREATE INDEX IF NOT EXISTS idx_roster_audit_logs_personnel_date
  ON public.roster_audit_logs (personnel_id, date);

-- Index for lookups by assignment id
CREATE INDEX IF NOT EXISTS idx_roster_audit_logs_assignment_id
  ON public.roster_audit_logs (assignment_id);

-- Index for date-range queries (used in sendTodayChangeNotifications)
CREATE INDEX IF NOT EXISTS idx_roster_audit_logs_created_at
  ON public.roster_audit_logs (created_at);

-- Enable Row Level Security
ALTER TABLE public.roster_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: admins can do everything
CREATE POLICY "Admins can manage audit logs"
  ON public.roster_audit_logs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );
