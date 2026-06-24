-- ============================================================
-- SCRIPT DE SEGURIDAD: Resolver alerta de Supabase
-- "Table publicly accessible - rls_disabled_in_public"
-- Ejecutar en: Supabase → SQL Editor
-- ============================================================

-- 1. Habilitar RLS en la tabla profiles (creada por defecto por Supabase)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Política: cada usuario solo puede ver y editar su propio perfil
-- (DROP IF EXISTS para hacerlo idempotente)
DROP POLICY IF EXISTS "Users can view own profile"    ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile"  ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles"  ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can manage all profiles"
  ON public.profiles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'superadmin')
    )
  );

-- ============================================================
-- 2. Asegurarse de que todas las demás tablas tienen RLS
--    (idempotente: no rompe si ya estaba habilitado)
-- ============================================================
ALTER TABLE public.companies            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personnel            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_requirements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_assignments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaves               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_audit_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personnel_letters    ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. Agregar columna was_published a roster_audit_logs
--    (migración pendiente del 24-Jun-2026)
-- ============================================================
ALTER TABLE public.roster_audit_logs
  ADD COLUMN IF NOT EXISTS was_published boolean NOT NULL DEFAULT false;

-- ============================================================
-- VERIFICACIÓN: Consulta para ver qué tablas tienen RLS
-- (ejecutar por separado si quieres confirmar)
-- ============================================================
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
