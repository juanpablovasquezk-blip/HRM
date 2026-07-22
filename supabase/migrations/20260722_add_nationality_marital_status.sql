-- Migration: Add nationality and marital_status to personnel table
-- Run this in Supabase SQL Editor

ALTER TABLE personnel ADD COLUMN IF NOT EXISTS nationality TEXT DEFAULT 'CHILENA';
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS marital_status TEXT;
