-- Migration: Relax renewal_days constraint in epp_delivery_items and epp_position_requirements
-- Date: 2026-10-21
-- Purpose: Allow renewal_days >= 0 so single-delivery items (Plazo Fijo / Entrega única) can be stored with renewal_days = 0 without constraint violation.

ALTER TABLE public.epp_delivery_items DROP CONSTRAINT IF EXISTS epp_delivery_items_renewal_days_check;
ALTER TABLE public.epp_delivery_items ADD CONSTRAINT epp_delivery_items_renewal_days_check CHECK (renewal_days >= 0);

ALTER TABLE public.epp_position_requirements DROP CONSTRAINT IF EXISTS epp_position_requirements_renewal_days_check;
ALTER TABLE public.epp_position_requirements ADD CONSTRAINT epp_position_requirements_renewal_days_check CHECK (renewal_days >= 0);
