-- Migration: Add custom_clothing_sizes jsonb column to personnel table
-- Date: 2026-07-20

ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS custom_clothing_sizes JSONB DEFAULT '{}'::jsonb;
