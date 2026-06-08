-- ============================================================
-- Migration: Add whatsapp_notified_at to shift_assignments
-- Run this in the Supabase SQL Editor AFTER:
--   20260608_create_roster_audit_logs.sql
-- ============================================================

-- Column tracks WHEN a WhatsApp notification was last sent for this assignment.
-- NULL = never notified. This prevents duplicate messages.
ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS whatsapp_notified_at timestamptz DEFAULT NULL;

-- Index for fast lookups of un-notified manual assignments
CREATE INDEX IF NOT EXISTS idx_shift_assignments_whatsapp_notified
  ON public.shift_assignments (whatsapp_notified_at)
  WHERE whatsapp_notified_at IS NULL AND is_manual = true AND is_published = true;
