-- ============================================================
-- Migration: Add was_published to roster_audit_logs
-- Run this in the Supabase SQL Editor
-- ============================================================
-- This column records whether the shift_assignment was already
-- published (is_published = true) at the moment the manual change
-- was made. publishAssignments uses it to decide whether to send
-- a WhatsApp notification: only changes to previously-published
-- assignments should trigger an alert to the worker.
-- ============================================================

ALTER TABLE public.roster_audit_logs
  ADD COLUMN IF NOT EXISTS was_published boolean NOT NULL DEFAULT false;
