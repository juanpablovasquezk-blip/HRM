-- Migration: Add attendance_comment column to shift_assignments
ALTER TABLE public.shift_assignments ADD COLUMN IF NOT EXISTS attendance_comment text;
