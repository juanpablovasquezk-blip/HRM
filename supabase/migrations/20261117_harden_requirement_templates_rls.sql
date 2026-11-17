-- Migration: Harden RLS policies on public.requirement_templates (HRM-005)
-- Removes anonymous access and restricts INSERT/UPDATE/DELETE to ADMIN, HR, SUPERVISOR.
-- Compatible with SECURITY INVOKER in public.save_weekly_matrix_changes(jsonb)
-- because public.users allows SELECT on own record (auth.uid() = id).

ALTER TABLE public.requirement_templates ENABLE ROW LEVEL SECURITY;

-- Remove overly permissive policies
DROP POLICY IF EXISTS "Permitir todo a anonimos" ON public.requirement_templates;
DROP POLICY IF EXISTS "Permitir todo a autenticados" ON public.requirement_templates;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.requirement_templates;

-- Drop target policies if re-running migration
DROP POLICY IF EXISTS "Authenticated users can read requirement_templates" ON public.requirement_templates;
DROP POLICY IF EXISTS "Authorized roles can insert requirement_templates" ON public.requirement_templates;
DROP POLICY IF EXISTS "Authorized roles can update requirement_templates" ON public.requirement_templates;
DROP POLICY IF EXISTS "Authorized roles can delete requirement_templates" ON public.requirement_templates;

-- 1. Read access for authenticated users (listTemplates, materializeTemplates, dotacion view)
CREATE POLICY "Authenticated users can read requirement_templates"
  ON public.requirement_templates
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. Write access restricted to ADMIN, HR and SUPERVISOR
CREATE POLICY "Authorized roles can insert requirement_templates"
  ON public.requirement_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.users u
       WHERE u.id = auth.uid()
         AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR')
    )
  );

CREATE POLICY "Authorized roles can update requirement_templates"
  ON public.requirement_templates
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.users u
       WHERE u.id = auth.uid()
         AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.users u
       WHERE u.id = auth.uid()
         AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR')
    )
  );

CREATE POLICY "Authorized roles can delete requirement_templates"
  ON public.requirement_templates
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.users u
       WHERE u.id = auth.uid()
         AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR')
    )
  );
