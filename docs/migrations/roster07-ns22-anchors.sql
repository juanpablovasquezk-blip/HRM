-- ROSTER-07: Registro persistente de anclas NS22 verificadas en public.personnel
-- Separa el registro de anclas 4x4 de la exención de cuota de domingos libres
-- (mantiene pendiente la exención sin activar has_special_contract).
-- NO ejecutar en la base operativa hasta aprobación expresa.

ALTER TABLE public.personnel
  ADD COLUMN IF NOT EXISTS ns22_anchor_date date NULL;

UPDATE public.personnel
SET ns22_anchor_date = '2026-12-14'::date
WHERE id = '1e2cc199-7a29-417f-86d3-58143d448654'; -- MARCELO ANDRES JARA

UPDATE public.personnel
SET ns22_anchor_date = '2026-12-10'::date
WHERE id = 'dafef0b7-cbab-4eaa-8aec-88ae7b4848d3'; -- JAVIER IGNACIO LOPEZ
