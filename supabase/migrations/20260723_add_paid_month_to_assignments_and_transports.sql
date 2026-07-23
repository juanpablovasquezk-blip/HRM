-- Migration: Add paid_month to shift_assignments and transport_requests
-- Description: Adds a column to record the month when extra shifts and personal transports were paid.

ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS paid_month TEXT DEFAULT NULL;

ALTER TABLE public.transport_requests
  ADD COLUMN IF NOT EXISTS paid_month TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_shift_assignments_paid_month ON public.shift_assignments(paid_month);
CREATE INDEX IF NOT EXISTS idx_transport_requests_paid_month ON public.transport_requests(paid_month);
