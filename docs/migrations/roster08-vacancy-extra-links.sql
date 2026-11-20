-- ROSTER-08 / ROSTER-07: Vínculo explícito entre faltas ordinarias y Dotación Extra
-- NO ejecutar en la base operativa hasta la aprobación de ROSTER-07.

ALTER TABLE public.shift_requirements
  ADD COLUMN IF NOT EXISTS manual_extra_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_vacancy_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linked_requirement_id uuid NULL REFERENCES public.shift_requirements(id) ON DELETE SET NULL;

ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS extra_target text NULL CHECK (extra_target IN ('manual', 'v2_vacancy')),
  ADD COLUMN IF NOT EXISTS linked_requirement_id uuid NULL REFERENCES public.shift_requirements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shift_requirements_linked_req
  ON public.shift_requirements(linked_requirement_id)
  WHERE linked_requirement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shift_assignments_extra_target
  ON public.shift_assignments(date, area_id, position_id, shift_id, extra_target)
  WHERE is_extra = true;
