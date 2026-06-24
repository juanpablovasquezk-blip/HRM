-- ============================================================
-- SCRIPT DE SEGURIDAD: Resolver alerta de Supabase
-- "Table publicly accessible - rls_disabled_in_public"
-- Ejecutar en: Supabase → SQL Editor
-- ============================================================

-- 1. Habilitar RLS en todas las tablas públicas
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
-- 2. Agregar columna was_published a roster_audit_logs
--    (migración pendiente del 24-Jun-2026)
-- ============================================================
ALTER TABLE public.roster_audit_logs
  ADD COLUMN IF NOT EXISTS was_published boolean NOT NULL DEFAULT false;

-- ============================================================
-- VERIFICACIÓN: ejecuta esto por separado para ver qué tablas
-- tienen RLS habilitado
-- ============================================================
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
