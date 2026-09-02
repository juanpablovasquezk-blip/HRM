-- Migration: Add requires_shifts support to positions and personnel tables
-- Allows administrative and executive positions (e.g. Gerente de Operaciones)
-- to be exempt from operational shift assignments while staying visible in EPP, Safety, Documents, etc.

ALTER TABLE public.positions
ADD COLUMN IF NOT EXISTS requires_shifts boolean DEFAULT true;

ALTER TABLE public.personnel
ADD COLUMN IF NOT EXISTS requires_shifts boolean DEFAULT true;
