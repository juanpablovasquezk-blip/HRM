import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// This endpoint creates the document_definitions table if it doesn't exist.
// Call it once: GET /api/db-migrate-documents
export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const sql = `
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

    CREATE INDEX IF NOT EXISTS idx_document_definitions_company_id
      ON public.document_definitions (company_id);

    CREATE INDEX IF NOT EXISTS idx_document_definitions_is_active
      ON public.document_definitions (is_active);

    ALTER TABLE public.document_definitions ENABLE ROW LEVEL SECURITY;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'document_definitions'
          AND policyname = 'Users can read their company document definitions'
      ) THEN
        CREATE POLICY "Users can read their company document definitions"
          ON public.document_definitions FOR SELECT
          USING (
            company_id IS NULL
            OR company_id IN (
              SELECT company_id FROM public.users WHERE id = auth.uid()
              UNION ALL
              SELECT company_id FROM public.personnel WHERE user_id = auth.uid()
            )
          );
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'document_definitions'
          AND policyname = 'Admins can manage document definitions'
      ) THEN
        CREATE POLICY "Admins can manage document definitions"
          ON public.document_definitions FOR ALL
          USING (
            EXISTS (
              SELECT 1 FROM public.users
              WHERE id = auth.uid() AND role IN ('ADMIN', 'HR')
            )
          );
      END IF;
    END
    $$;
  `;

  const { error } = await supabase.rpc('exec_sql', { sql }).single();

  // Supabase doesn't have exec_sql by default; use the raw postgres extension approach
  // Try alternative: use the Supabase management API or check if table already exists
  
  // Check if table was already created by trying to select from it
  const { error: checkError } = await supabase
    .from('document_definitions')
    .select('id')
    .limit(1);

  if (!checkError) {
    return NextResponse.json({
      success: true,
      message: 'La tabla document_definitions ya existe y está operativa.',
      timestamp: new Date().toISOString()
    });
  }

  // Table doesn't exist - return the SQL for the user to run manually
  return NextResponse.json({
    success: false,
    message: 'La tabla no existe. Ejecuta el siguiente SQL en el editor de Supabase:',
    sql: sql.trim(),
    timestamp: new Date().toISOString()
  }, { status: 200 });
}
