import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET /api/db-migrate-company-docs
export async function GET() {
  const supabase = createAdminClient();

  // Check if company_documents table exists
  const { error: checkError } = await supabase
    .from('company_documents')
    .select('id')
    .limit(1);

  if (!checkError) {
    return NextResponse.json({
      success: true,
      message: 'La tabla company_documents ya existe y está lista.',
      timestamp: new Date().toISOString()
    });
  }

  // Return the SQL migration to execute in Supabase SQL Editor if table doesn't exist
  const sql = `
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS legal_name TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS legal_representative TEXT;

CREATE TABLE IF NOT EXISTS public.company_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'GENERAL',
  title TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_documents_company_cat ON public.company_documents(company_id, category);

ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow view company_documents" ON public.company_documents;
CREATE POLICY "Allow view company_documents" ON public.company_documents FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all company_documents for authenticated" ON public.company_documents;
CREATE POLICY "Allow all company_documents for authenticated" ON public.company_documents FOR ALL USING (true);
  `;

  return NextResponse.json({
    success: false,
    message: 'La tabla company_documents no existe aún en la base de datos Supabase.',
    sql: sql.trim(),
    instructions: 'Por favor copia y ejecuta esta sentencia SQL en tu consola de Supabase -> SQL Editor.'
  });
}
