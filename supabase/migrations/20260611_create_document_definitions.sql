-- ============================================================
-- Migration: Create document_definitions table
-- Run this in the Supabase SQL Editor OR via /api/db-fix endpoint
-- ============================================================

CREATE TABLE IF NOT EXISTS public.document_definitions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name                      text NOT NULL,
  description               text,
  is_mandatory              boolean NOT NULL DEFAULT true,
  requires_expiration       boolean NOT NULL DEFAULT false,
  applicable_positions      uuid[]  NOT NULL DEFAULT '{}',
  depends_on_definition_id  uuid    REFERENCES public.document_definitions(id) ON DELETE SET NULL,
  cycle_months              integer,
  anchor_days_offset        integer,
  is_active                 boolean NOT NULL DEFAULT true,
  created_at                timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_document_definitions_company_id
  ON public.document_definitions (company_id);

CREATE INDEX IF NOT EXISTS idx_document_definitions_is_active
  ON public.document_definitions (is_active);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.document_definitions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read definitions that belong to their company
CREATE POLICY IF NOT EXISTS "Users can read their company document definitions"
  ON public.document_definitions
  FOR SELECT
  USING (
    company_id IS NULL
    OR company_id IN (
      SELECT company_id FROM public.users WHERE id = auth.uid()
      UNION ALL
      SELECT company_id FROM public.personnel WHERE user_id = auth.uid()
    )
  );

-- Only admins can write
CREATE POLICY IF NOT EXISTS "Admins can manage document definitions"
  ON public.document_definitions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('ADMIN', 'HR')
    )
  );
