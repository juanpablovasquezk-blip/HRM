-- Migration: Add rejection and inactive reasons to personnel table
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL;
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS inactive_reason TEXT DEFAULT NULL;
