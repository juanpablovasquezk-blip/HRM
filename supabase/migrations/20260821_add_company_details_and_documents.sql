-- Migration: Add company legal details and company_documents table
-- Date: 2026-08-21

-- 1. Add company legal details to companies table
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS legal_name TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS legal_representative TEXT;

-- 2. Create company_documents table
CREATE TABLE IF NOT EXISTS public.company_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'GENERAL', -- 'RIOHS', 'POLITICA', 'CERTIFICADO', 'GENERAL'
  title TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by company and category
CREATE INDEX IF NOT EXISTS idx_company_documents_company_cat ON public.company_documents(company_id, category);

-- Enable RLS
ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view company documents
CREATE POLICY "Allow view company_documents" ON public.company_documents
  FOR SELECT USING (true);

-- Allow authenticated users with admin/hr/safety roles or service role to manage company documents
CREATE POLICY "Allow all company_documents for authenticated" ON public.company_documents
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
