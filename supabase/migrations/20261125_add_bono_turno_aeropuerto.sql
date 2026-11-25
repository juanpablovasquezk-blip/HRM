-- Migration: Add Bono Turno Aeropuerto ($5.000 CLP) bonus type and scoped active daily uniqueness guard
-- Date: 2026-11-25

INSERT INTO public.bonus_types (
  code,
  name,
  default_amount,
  amount_is_editable,
  requires_ot,
  active
)
VALUES (
  'TURNO_AEROPUERTO',
  'Bono Turno Aeropuerto',
  5000,
  false,
  false,
  true
)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  default_amount = EXCLUDED.default_amount,
  amount_is_editable = EXCLUDED.amount_is_editable,
  requires_ot = EXCLUDED.requires_ot,
  active = true;

-- Garantizar idempotencia a nivel de base de datos únicamente para Bono Turno Aeropuerto activo
CREATE UNIQUE INDEX IF NOT EXISTS uq_bonus_records_active_turno_aeropuerto
  ON public.bonus_records (external_ref)
  WHERE status = 'active' AND starts_with(external_ref, 'TURNO_AEROPUERTO:');
