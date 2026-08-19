-- Migration: Add SAFETY_OFFICER role and configure RLS permissions
-- Created: 2026-08-19

-- 1. Update check constraint on users table if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE public.users DROP CONSTRAINT users_role_check;
    ALTER TABLE public.users ADD CONSTRAINT users_role_check 
      CHECK (role IN ('ADMIN', 'HR', 'SUPERVISOR', 'AIRPORT_ASSISTANT', 'ASSISTANT', 'SAFETY_OFFICER', 'USER'));
  END IF;
END $$;

-- 2. Ensure RLS SELECT access for SAFETY_OFFICER on personnel, documents, and EPP tables
-- Personnel RLS SELECT
DROP POLICY IF EXISTS "Enable read access for authenticated users with valid role" ON public.personnel;
CREATE POLICY "Enable read access for authenticated users with valid role" ON public.personnel
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.id = auth.uid() 
      AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR', 'AIRPORT_ASSISTANT', 'ASSISTANT', 'SAFETY_OFFICER')
    )
  );

-- Personnel Documents RLS SELECT
DROP POLICY IF EXISTS "Enable read access for safety officer and HR on personnel documents" ON public.personnel_documents;
CREATE POLICY "Enable read access for safety officer and HR on personnel documents" ON public.personnel_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.id = auth.uid() 
      AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR', 'AIRPORT_ASSISTANT', 'ASSISTANT', 'SAFETY_OFFICER')
    )
  );

-- EPP Delivery Events RLS SELECT
DROP POLICY IF EXISTS "Enable read access for authorized roles on EPP delivery events" ON public.epp_delivery_events;
CREATE POLICY "Enable read access for authorized roles on EPP delivery events" ON public.epp_delivery_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.id = auth.uid() 
      AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR', 'AIRPORT_ASSISTANT', 'SAFETY_OFFICER')
    )
  );

-- EPP Delivery Items RLS SELECT
DROP POLICY IF EXISTS "Enable read access for authorized roles on EPP delivery items" ON public.epp_delivery_items;
CREATE POLICY "Enable read access for authorized roles on EPP delivery items" ON public.epp_delivery_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.id = auth.uid() 
      AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR', 'AIRPORT_ASSISTANT', 'SAFETY_OFFICER')
    )
  );
