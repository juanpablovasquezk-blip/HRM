-- Migration: Add form_number to epp_delivery_events
-- Starts at 300 as requested (global correlative number for all delivery acts)

ALTER TABLE public.epp_delivery_events
  ADD COLUMN IF NOT EXISTS form_number INT DEFAULT NULL;

-- Create a global sequence starting at 300
CREATE SEQUENCE IF NOT EXISTS epp_form_number_seq START 300 INCREMENT 1 NO CYCLE;

-- Back-fill existing events with correlative numbers ordered by creation date
DO $$
DECLARE
  rec RECORD;
  seq_val INT;
BEGIN
  FOR rec IN
    SELECT id FROM public.epp_delivery_events
    WHERE form_number IS NULL
    ORDER BY created_at ASC
  LOOP
    seq_val := nextval('epp_form_number_seq');
    UPDATE public.epp_delivery_events SET form_number = seq_val WHERE id = rec.id;
  END LOOP;
END $$;
