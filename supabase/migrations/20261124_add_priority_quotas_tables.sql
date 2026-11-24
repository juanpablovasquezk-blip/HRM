-- Migration: Add priority quota breakdown tables for weekly rules and dated requirements
-- DO NOT run in production without explicit authorization.

-- 1. Cupos por prioridad de la regla semanal
CREATE TABLE IF NOT EXISTS public.requirement_template_priority_quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  position_id uuid NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  priority text NOT NULL CHECK (priority IN ('CRITICAL', 'HIGH', 'NORMAL', 'LOW')),
  required_count integer NOT NULL CHECK (required_count > 0 AND required_count <= 9999),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT requirement_template_priority_quotas_unique
    UNIQUE (area_id, position_id, shift_id, day_of_week, priority)
);

CREATE INDEX IF NOT EXISTS idx_req_tpl_priority_quotas_lookup
  ON public.requirement_template_priority_quotas (area_id, position_id, shift_id);

ALTER TABLE public.requirement_template_priority_quotas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read requirement_template_priority_quotas" ON public.requirement_template_priority_quotas;
DROP POLICY IF EXISTS "Authorized roles can insert requirement_template_priority_quotas" ON public.requirement_template_priority_quotas;
DROP POLICY IF EXISTS "Authorized roles can update requirement_template_priority_quotas" ON public.requirement_template_priority_quotas;
DROP POLICY IF EXISTS "Authorized roles can delete requirement_template_priority_quotas" ON public.requirement_template_priority_quotas;

CREATE POLICY "Authenticated users can read requirement_template_priority_quotas"
  ON public.requirement_template_priority_quotas
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authorized roles can insert requirement_template_priority_quotas"
  ON public.requirement_template_priority_quotas
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR')
    )
  );

CREATE POLICY "Authorized roles can update requirement_template_priority_quotas"
  ON public.requirement_template_priority_quotas
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR')
    )
  );

CREATE POLICY "Authorized roles can delete requirement_template_priority_quotas"
  ON public.requirement_template_priority_quotas
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR')
    )
  );

-- 2. Cupos por prioridad del requerimiento fechado
CREATE TABLE IF NOT EXISTS public.shift_requirement_priority_quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_requirement_id uuid NOT NULL REFERENCES public.shift_requirements(id) ON DELETE CASCADE,
  priority text NOT NULL CHECK (priority IN ('CRITICAL', 'HIGH', 'NORMAL', 'LOW')),
  required_count integer NOT NULL CHECK (required_count > 0 AND required_count <= 9999),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shift_requirement_priority_quotas_unique
    UNIQUE (shift_requirement_id, priority)
);

CREATE INDEX IF NOT EXISTS idx_shift_req_priority_quotas_req_id
  ON public.shift_requirement_priority_quotas (shift_requirement_id);

ALTER TABLE public.shift_requirement_priority_quotas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read shift_requirement_priority_quotas" ON public.shift_requirement_priority_quotas;
DROP POLICY IF EXISTS "Authorized roles can insert shift_requirement_priority_quotas" ON public.shift_requirement_priority_quotas;
DROP POLICY IF EXISTS "Authorized roles can update shift_requirement_priority_quotas" ON public.shift_requirement_priority_quotas;
DROP POLICY IF EXISTS "Authorized roles can delete shift_requirement_priority_quotas" ON public.shift_requirement_priority_quotas;

CREATE POLICY "Authenticated users can read shift_requirement_priority_quotas"
  ON public.shift_requirement_priority_quotas
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authorized roles can insert shift_requirement_priority_quotas"
  ON public.shift_requirement_priority_quotas
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR')
    )
  );

CREATE POLICY "Authorized roles can update shift_requirement_priority_quotas"
  ON public.shift_requirement_priority_quotas
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR')
    )
  );

CREATE POLICY "Authorized roles can delete shift_requirement_priority_quotas"
  ON public.shift_requirement_priority_quotas
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'HR', 'SUPERVISOR')
    )
  );

-- 2b. Canonical server-side verified Chilean national holidays (read-only for authenticated)
CREATE TABLE IF NOT EXISTS public.chile_national_holidays (
  date date PRIMARY KEY,
  year integer NOT NULL,
  name text NOT NULL,
  irrenunciable boolean NOT NULL DEFAULT false,
  source text NOT NULL,
  reviewed_at date NOT NULL
);

ALTER TABLE public.chile_national_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read chile_national_holidays" ON public.chile_national_holidays;
CREATE POLICY "Authenticated users can read chile_national_holidays"
  ON public.chile_national_holidays
  FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO public.chile_national_holidays (date, year, name, irrenunciable, source, reviewed_at) VALUES
  ('2026-01-01', 2026, 'Año Nuevo', true, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.973 y modificaciones vigentes)', '2026-11-20'),
  ('2026-04-03', 2026, 'Viernes Santo', false, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.973 y modificaciones vigentes)', '2026-11-20'),
  ('2026-04-04', 2026, 'Sábado Santo', false, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.973 y modificaciones vigentes)', '2026-11-20'),
  ('2026-05-01', 2026, 'Día Nacional del Trabajo', true, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.973 y modificaciones vigentes)', '2026-11-20'),
  ('2026-05-21', 2026, 'Día de las Glorias Navales', false, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.973 y modificaciones vigentes)', '2026-11-20'),
  ('2026-06-21', 2026, 'Día Nacional de los Pueblos Indígenas', false, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.973 y modificaciones vigentes)', '2026-11-20'),
  ('2026-06-29', 2026, 'San Pedro y San Pablo', false, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.973 y modificaciones vigentes)', '2026-11-20'),
  ('2026-07-16', 2026, 'Día de la Virgen del Carmen', false, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.973 y modificaciones vigentes)', '2026-11-20'),
  ('2026-08-15', 2026, 'Asunción de la Virgen', false, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.973 y modificaciones vigentes)', '2026-11-20'),
  ('2026-09-18', 2026, 'Independencia Nacional', true, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.973 y modificaciones vigentes)', '2026-11-20'),
  ('2026-09-19', 2026, 'Día de las Glorias del Ejército', true, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.973 y modificaciones vigentes)', '2026-11-20'),
  ('2026-10-12', 2026, 'Encuentro de Dos Mundos', false, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.973 y modificaciones vigentes)', '2026-11-20'),
  ('2026-10-31', 2026, 'Día de las Iglesias Evangélicas y Protestantes', false, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.973 y modificaciones vigentes)', '2026-11-20'),
  ('2026-11-01', 2026, 'Día de Todos los Santos', false, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.973 y modificaciones vigentes)', '2026-11-20'),
  ('2026-12-08', 2026, 'Inmaculada Concepción', false, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.973 y modificaciones vigentes)', '2026-11-20'),
  ('2026-12-25', 2026, 'Navidad', true, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.973 y modificaciones vigentes)', '2026-11-20'),
  ('2027-01-01', 2027, 'Año Nuevo', true, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.668, Ley 19.973, Ley 20.148, Ley 20.299, Ley 20.629, Ley 20.983, Ley 21.357)', '2026-11-20'),
  ('2027-03-26', 2027, 'Viernes Santo', false, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.668, Ley 19.973, Ley 20.148, Ley 20.299, Ley 20.629, Ley 20.983, Ley 21.357)', '2026-11-20'),
  ('2027-03-27', 2027, 'Sábado Santo', false, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.668, Ley 19.973, Ley 20.148, Ley 20.299, Ley 20.629, Ley 20.983, Ley 21.357)', '2026-11-20'),
  ('2027-05-01', 2027, 'Día Nacional del Trabajo', true, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.668, Ley 19.973, Ley 20.148, Ley 20.299, Ley 20.629, Ley 20.983, Ley 21.357)', '2026-11-20'),
  ('2027-05-21', 2027, 'Día de las Glorias Navales', false, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.668, Ley 19.973, Ley 20.148, Ley 20.299, Ley 20.629, Ley 20.983, Ley 21.357)', '2026-11-20'),
  ('2027-06-21', 2027, 'Día Nacional de los Pueblos Indígenas', false, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.668, Ley 19.973, Ley 20.148, Ley 20.299, Ley 20.629, Ley 20.983, Ley 21.357)', '2026-11-20'),
  ('2027-06-28', 2027, 'San Pedro y San Pablo', false, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.668, Ley 19.973, Ley 20.148, Ley 20.299, Ley 20.629, Ley 20.983, Ley 21.357)', '2026-11-20'),
  ('2027-07-16', 2027, 'Día de la Virgen del Carmen', false, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.668, Ley 19.973, Ley 20.148, Ley 20.299, Ley 20.629, Ley 20.983, Ley 21.357)', '2026-11-20'),
  ('2027-08-15', 2027, 'Asunción de la Virgen', false, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.668, Ley 19.973, Ley 20.148, Ley 20.299, Ley 20.629, Ley 20.983, Ley 21.357)', '2026-11-20'),
  ('2027-09-17', 2027, 'Feriado adicional de Fiestas Patrias', false, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.668, Ley 19.973, Ley 20.148, Ley 20.299, Ley 20.629, Ley 20.983, Ley 21.357)', '2026-11-20'),
  ('2027-09-18', 2027, 'Independencia Nacional', true, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.668, Ley 19.973, Ley 20.148, Ley 20.299, Ley 20.629, Ley 20.983, Ley 21.357)', '2026-11-20'),
  ('2027-09-19', 2027, 'Día de las Glorias del Ejército', true, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.668, Ley 19.973, Ley 20.148, Ley 20.299, Ley 20.629, Ley 20.983, Ley 21.357)', '2026-11-20'),
  ('2027-10-11', 2027, 'Encuentro de Dos Mundos', false, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.668, Ley 19.973, Ley 20.148, Ley 20.299, Ley 20.629, Ley 20.983, Ley 21.357)', '2026-11-20'),
  ('2027-10-31', 2027, 'Día Nacional de las Iglesias Evangélicas y Protestantes', false, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.668, Ley 19.973, Ley 20.148, Ley 20.299, Ley 20.629, Ley 20.983, Ley 21.357)', '2026-11-20'),
  ('2027-11-01', 2027, 'Día de Todos los Santos', false, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.668, Ley 19.973, Ley 20.148, Ley 20.299, Ley 20.629, Ley 20.983, Ley 21.357)', '2026-11-20'),
  ('2027-12-08', 2027, 'Inmaculada Concepción', false, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.668, Ley 19.973, Ley 20.148, Ley 20.299, Ley 20.629, Ley 20.983, Ley 21.357)', '2026-11-20'),
  ('2027-12-25', 2027, 'Navidad', true, 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.668, Ley 19.973, Ley 20.148, Ley 20.299, Ley 20.629, Ley 20.983, Ley 21.357)', '2026-11-20')
ON CONFLICT (date) DO NOTHING;

-- 3. Update save_weekly_matrix_changes RPC to persist priority_quotas atomically
CREATE OR REPLACE FUNCTION public.save_weekly_matrix_changes(p_changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_user_role text;
  v_row jsonb;
  v_area_id uuid;
  v_position_id uuid;
  v_shift_id uuid;
  v_priority text;
  v_overrides_json jsonb;
  v_clean_overrides jsonb;
  v_ov_key text;
  v_ov_val_json jsonb;
  v_ov_val text;
  v_specs jsonb;
  v_spec jsonb;
  v_req_count_num numeric;
  v_req_count int;
  v_days_json jsonb;
  v_day_elem jsonb;
  v_day_num numeric;
  v_day int;
  v_days int[];
  v_seen_row_days int[];
  v_active_days int[];
  v_seen_row_keys text[] := ARRAY[]::text[];
  v_row_key text;
  v_current_ids uuid[];
  v_spec_count int;
  v_existing_count int;
  v_idx int;
  v_updated_rows int := 0;
  v_is_new boolean;
  v_expected_counts_json jsonb;
  v_expected_counts bigint[];
  v_expected_priority text;
  v_expected_overrides_json jsonb;
  v_actual_counts bigint[];
  v_actual_priority text;
  v_actual_overrides jsonb;
  v_distinct_overrides_count int;
  v_quotas_json jsonb;
  v_quota_elem jsonb;
  v_quota_day int;
  v_quota_prio text;
  v_quota_count int;
  v_seen_quota_keys text[];
  v_quota_key text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT u.role INTO v_user_role FROM public.users u WHERE u.id = v_uid;
  IF v_user_role IS NULL OR v_user_role NOT IN ('ADMIN', 'HR', 'SUPERVISOR') THEN
    RAISE EXCEPTION 'No autorizado para modificar reglas operacionales.' USING ERRCODE = '42501';
  END IF;

  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' OR jsonb_array_length(p_changes) = 0 THEN
    RAISE EXCEPTION 'La carga de cambios debe ser un arreglo JSON no vacío.' USING ERRCODE = '22023';
  END IF;

  -- Pre-validation pass
  FOR v_row IN SELECT elem FROM jsonb_array_elements(p_changes) AS elem
  LOOP
    IF jsonb_typeof(v_row) <> 'object' THEN
      RAISE EXCEPTION 'Cada fila de cambio debe ser un objeto JSON.' USING ERRCODE = '22023';
    END IF;

    IF COALESCE(v_row->>'area_id', '') = ''
       OR COALESCE(v_row->>'position_id', '') = ''
       OR COALESCE(v_row->>'shift_id', '') = '' THEN
      RAISE EXCEPTION 'Faltan identificadores de área, cargo o turno.' USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_area_id := (v_row->>'area_id')::uuid;
      v_position_id := (v_row->>'position_id')::uuid;
      v_shift_id := (v_row->>'shift_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Identificadores UUID inválidos en la fila de cambio.' USING ERRCODE = '22P02';
    END;

    v_row_key := v_area_id::text || '|' || v_position_id::text || '|' || v_shift_id::text;
    IF v_row_key = ANY(v_seen_row_keys) THEN
      RAISE EXCEPTION 'Combinación duplicada de área, cargo y turno en p_changes.' USING ERRCODE = '22023';
    END IF;
    v_seen_row_keys := array_append(v_seen_row_keys, v_row_key);

    v_priority := COALESCE(NULLIF(UPPER(TRIM(v_row->>'priority')), ''), 'NORMAL');
    IF v_priority NOT IN ('CRITICAL', 'HIGH', 'NORMAL', 'LOW') THEN
      RAISE EXCEPTION 'Prioridad operacional inválida.' USING ERRCODE = '22023';
    END IF;

    IF v_row ? 'is_new' AND jsonb_typeof(v_row->'is_new') <> 'boolean' THEN
      RAISE EXCEPTION 'El campo is_new debe ser booleano.' USING ERRCODE = '22023';
    END IF;
    v_is_new := COALESCE((v_row->>'is_new')::boolean, false);

    IF NOT v_is_new THEN
      v_expected_counts_json := v_row->'expected_counts';
      IF v_expected_counts_json IS NULL OR jsonb_typeof(v_expected_counts_json) <> 'array' OR jsonb_array_length(v_expected_counts_json) <> 7 THEN
        RAISE EXCEPTION 'expected_counts debe ser un arreglo de 7 enteros.' USING ERRCODE = '22023';
      END IF;
      IF NOT (v_row ? 'expected_priority') OR NULLIF(TRIM(v_row->>'expected_priority'), '') IS NULL THEN
        RAISE EXCEPTION 'Falta expected_priority para editar una regla existente.' USING ERRCODE = '22023';
      END IF;
      v_expected_priority := UPPER(TRIM(v_row->>'expected_priority'));
      IF v_expected_priority NOT IN ('CRITICAL', 'HIGH', 'NORMAL', 'LOW') THEN
        RAISE EXCEPTION 'expected_priority inválido.' USING ERRCODE = '22023';
      END IF;
      v_expected_overrides_json := v_row->'expected_priority_overrides';
      IF v_expected_overrides_json IS NULL OR jsonb_typeof(v_expected_overrides_json) <> 'object' THEN
        RAISE EXCEPTION 'expected_priority_overrides debe ser un objeto JSON.' USING ERRCODE = '22023';
      END IF;
    END IF;

    v_specs := v_row->'specs';
    IF v_specs IS NULL OR jsonb_typeof(v_specs) <> 'array' THEN
      RAISE EXCEPTION 'El campo specs debe ser un arreglo JSON.' USING ERRCODE = '22023';
    END IF;

    v_seen_row_days := ARRAY[]::int[];
    v_active_days := ARRAY[]::int[];
    FOR v_spec IN SELECT elem FROM jsonb_array_elements(v_specs) AS elem
    LOOP
      v_req_count_num := (v_spec->>'required_count')::numeric;
      IF v_req_count_num < 0 OR v_req_count_num > 9999 OR v_req_count_num <> trunc(v_req_count_num) THEN
        RAISE EXCEPTION 'required_count debe ser un entero entre 0 y 9999.' USING ERRCODE = '22023';
      END IF;
      v_days_json := v_spec->'days_of_week';
      IF v_days_json IS NULL OR jsonb_typeof(v_days_json) <> 'array' OR jsonb_array_length(v_days_json) = 0 THEN
        RAISE EXCEPTION 'days_of_week debe ser un arreglo no vacío.' USING ERRCODE = '22023';
      END IF;
      v_days := ARRAY[]::int[];
      FOR v_day_elem IN SELECT elem FROM jsonb_array_elements(v_days_json) AS elem
      LOOP
        v_day_num := (v_day_elem #>> '{}')::numeric;
        IF v_day_num < 0 OR v_day_num > 6 OR v_day_num <> trunc(v_day_num) THEN
          RAISE EXCEPTION 'Los días de la semana deben estar entre 0 y 6.' USING ERRCODE = '22023';
        END IF;
        v_day := v_day_num::int;
        IF v_day = ANY(v_days) OR v_day = ANY(v_seen_row_days) THEN
          RAISE EXCEPTION 'Día de semana duplicado en la misma fila.' USING ERRCODE = '22023';
        END IF;
        v_days := array_append(v_days, v_day);
        v_seen_row_days := array_append(v_seen_row_days, v_day);
        IF v_req_count_num > 0 THEN
          v_active_days := array_append(v_active_days, v_day);
        END IF;
      END LOOP;
    END LOOP;

    v_overrides_json := COALESCE(v_row->'priority_overrides', '{}'::jsonb);
    IF jsonb_typeof(v_overrides_json) <> 'object' THEN
      RAISE EXCEPTION 'priority_overrides debe ser un objeto JSON.' USING ERRCODE = '22023';
    END IF;
    FOR v_ov_key, v_ov_val_json IN SELECT key, value FROM jsonb_each(v_overrides_json)
    LOOP
      IF v_ov_key !~ '^[0-6]$' THEN
        RAISE EXCEPTION 'Clave de día inválida en priority_overrides (0-6).' USING ERRCODE = '22023';
      END IF;
      v_ov_val := UPPER(TRIM(v_ov_val_json #>> '{}'));
      IF v_ov_val NOT IN ('CRITICAL', 'HIGH', 'NORMAL', 'LOW') THEN
        RAISE EXCEPTION 'Prioridad inválida en priority_overrides.' USING ERRCODE = '22023';
      END IF;
      IF NOT ((v_ov_key::int) = ANY(v_active_days)) THEN
        RAISE EXCEPTION 'No se permiten excepciones de prioridad en días sin dotación requerida.' USING ERRCODE = '22023';
      END IF;
    END LOOP;

    IF v_row ? 'priority_quotas' AND v_row->'priority_quotas' IS NOT NULL THEN
      v_quotas_json := v_row->'priority_quotas';
      IF jsonb_typeof(v_quotas_json) <> 'array' THEN
        RAISE EXCEPTION 'priority_quotas debe ser un arreglo JSON.' USING ERRCODE = '22023';
      END IF;
      v_seen_quota_keys := ARRAY[]::text[];
      FOR v_quota_elem IN SELECT elem FROM jsonb_array_elements(v_quotas_json) AS elem
      LOOP
        v_quota_day := ((v_quota_elem->>'day_of_week')::numeric)::int;
        v_quota_prio := UPPER(TRIM(COALESCE(v_quota_elem->>'priority', '')));
        v_quota_count := ((v_quota_elem->>'required_count')::numeric)::int;
        IF v_quota_day < 0 OR v_quota_day > 6 THEN
          RAISE EXCEPTION 'day_of_week inválido en priority_quotas.' USING ERRCODE = '22023';
        END IF;
        IF v_quota_prio NOT IN ('CRITICAL', 'HIGH', 'NORMAL', 'LOW') THEN
          RAISE EXCEPTION 'priority inválido en priority_quotas.' USING ERRCODE = '22023';
        END IF;
        IF v_quota_count <= 0 OR v_quota_count > 9999 THEN
          RAISE EXCEPTION 'required_count inválido en priority_quotas.' USING ERRCODE = '22023';
        END IF;
        v_quota_key := v_quota_day::text || '|' || v_quota_prio;
        IF v_quota_key = ANY(v_seen_quota_keys) THEN
          RAISE EXCEPTION 'Prioridad duplicada para el mismo día en priority_quotas.' USING ERRCODE = '22023';
        END IF;
        v_seen_quota_keys := array_append(v_seen_quota_keys, v_quota_key);
      END LOOP;
    END IF;
  END LOOP;

  -- Lock, verify concurrency, and mutate
  FOR v_row IN
    SELECT elem
      FROM jsonb_array_elements(p_changes) AS elem
     ORDER BY (elem->>'area_id')::uuid, (elem->>'position_id')::uuid, (elem->>'shift_id')::uuid
  LOOP
    v_area_id := (v_row->>'area_id')::uuid;
    v_position_id := (v_row->>'position_id')::uuid;
    v_shift_id := (v_row->>'shift_id')::uuid;
    v_priority := COALESCE(NULLIF(UPPER(TRIM(v_row->>'priority')), ''), 'NORMAL');
    v_specs := v_row->'specs';
    v_is_new := COALESCE((v_row->>'is_new')::boolean, false);

    v_clean_overrides := '{}'::jsonb;
    FOR v_ov_key, v_ov_val IN
      SELECT key, UPPER(TRIM(value #>> '{}'))
        FROM jsonb_each(COALESCE(v_row->'priority_overrides', '{}'::jsonb))
    LOOP
      IF v_ov_val <> v_priority THEN
        v_clean_overrides := v_clean_overrides || jsonb_build_object(v_ov_key, v_ov_val);
      END IF;
    END LOOP;

    PERFORM pg_advisory_xact_lock(
      hashtext(v_area_id::text || '|' || v_position_id::text || '|' || v_shift_id::text)
    );

    SELECT COALESCE(array_agg(rt.id ORDER BY rt.created_at ASC, rt.id ASC), ARRAY[]::uuid[])
      INTO v_current_ids
      FROM (
        SELECT id, created_at
          FROM public.requirement_templates
         WHERE area_id = v_area_id
           AND position_id = v_position_id
           AND shift_id = v_shift_id
         ORDER BY created_at ASC, id ASC
         FOR UPDATE
      ) rt;

    v_existing_count := COALESCE(array_length(v_current_ids, 1), 0);

    IF v_is_new THEN
      IF v_existing_count > 0 THEN
        RAISE EXCEPTION 'Conflicto de concurrencia: esta combinación Área + Cargo + Turno ya fue creada por otro usuario. Recarga la matriz.' USING ERRCODE = '40001';
      END IF;
    ELSE
      IF v_existing_count = 0 THEN
        RAISE EXCEPTION 'Conflicto de concurrencia: esta regla fue eliminada por otro usuario o requiere is_new: true para crearse. Recarga la matriz.' USING ERRCODE = '40001';
      END IF;

      SELECT array_agg(((elem #>> '{}')::numeric)::bigint)
        INTO v_expected_counts
        FROM jsonb_array_elements(v_row->'expected_counts') AS elem;

      SELECT array_agg(COALESCE(day_sum, 0)::bigint ORDER BY u.ord)
        INTO v_actual_counts
        FROM unnest(ARRAY[1, 2, 3, 4, 5, 6, 0]) WITH ORDINALITY AS u(db_day, ord)
        LEFT JOIN LATERAL (
          SELECT SUM(rt.required_count::bigint)::bigint AS day_sum
            FROM public.requirement_templates rt
           WHERE rt.id = ANY(v_current_ids)
             AND u.db_day = ANY(rt.days_of_week)
        ) s ON true;

      IF v_actual_counts IS DISTINCT FROM v_expected_counts THEN
        RAISE EXCEPTION 'Conflicto de concurrencia: otro usuario modificó las cantidades de esta regla mientras editabas. Recarga la matriz e intenta nuevamente.' USING ERRCODE = '40001';
      END IF;

      v_expected_priority := UPPER(TRIM(v_row->>'expected_priority'));

      SELECT CASE MAX(
               CASE rt.priority
                 WHEN 'CRITICAL' THEN 4
                 WHEN 'HIGH' THEN 3
                 WHEN 'NORMAL' THEN 2
                 WHEN 'LOW' THEN 1
                 ELSE 2
               END
             )
               WHEN 4 THEN 'CRITICAL'
               WHEN 3 THEN 'HIGH'
               WHEN 2 THEN 'NORMAL'
               WHEN 1 THEN 'LOW'
               ELSE NULL
             END
        INTO v_actual_priority
        FROM public.requirement_templates rt
       WHERE rt.id = ANY(v_current_ids);

      IF v_actual_priority IS DISTINCT FROM v_expected_priority THEN
        RAISE EXCEPTION 'Conflicto de concurrencia: otro usuario modificó la prioridad de esta regla mientras editabas. Recarga la matriz e intenta nuevamente.' USING ERRCODE = '40001';
      END IF;

      SELECT COUNT(DISTINCT COALESCE(rt.priority_overrides, '{}'::jsonb))
        INTO v_distinct_overrides_count
        FROM public.requirement_templates rt
       WHERE rt.id = ANY(v_current_ids);

      IF v_distinct_overrides_count > 1 THEN
        RAISE EXCEPTION 'Inconsistencia en excepciones de prioridad entre filas de la misma combinación Área + Cargo + Turno. Recarga la matriz antes de guardar.' USING ERRCODE = '40001';
      END IF;

      SELECT COALESCE(
               (
                 SELECT COALESCE(rt.priority_overrides, '{}'::jsonb)
                   FROM public.requirement_templates rt
                  WHERE rt.id = ANY(v_current_ids)
                  LIMIT 1
               ),
               '{}'::jsonb
             )
        INTO v_actual_overrides;

      SELECT COALESCE(
               jsonb_object_agg(key, UPPER(TRIM(value #>> '{}'))),
               '{}'::jsonb
             )
        INTO v_expected_overrides_json
        FROM jsonb_each(v_row->'expected_priority_overrides');

      IF v_actual_overrides IS DISTINCT FROM v_expected_overrides_json THEN
        RAISE EXCEPTION 'Conflicto de concurrencia: otro usuario modificó las excepciones de prioridad de esta regla mientras editabas. Recarga la matriz e intenta nuevamente.' USING ERRCODE = '40001';
      END IF;
    END IF;

    v_spec_count := jsonb_array_length(v_specs);

    IF v_spec_count > 0 THEN
      FOR v_idx IN 0..(v_spec_count - 1)
      LOOP
        v_spec := v_specs->v_idx;
        v_req_count := ((v_spec->>'required_count')::numeric)::int;
        SELECT array_agg(((elem #>> '{}')::numeric)::int)
          INTO v_days
          FROM jsonb_array_elements(v_spec->'days_of_week') AS elem;

        IF (v_idx + 1) <= v_existing_count THEN
          UPDATE public.requirement_templates
             SET required_count = v_req_count,
                 days_of_week = v_days,
                 priority = v_priority,
                 priority_overrides = v_clean_overrides
           WHERE id = v_current_ids[v_idx + 1];
        ELSE
          INSERT INTO public.requirement_templates (
            area_id, position_id, shift_id, required_count, days_of_week, priority, priority_overrides
          ) VALUES (
            v_area_id, v_position_id, v_shift_id, v_req_count, v_days, v_priority, v_clean_overrides
          );
        END IF;
      END LOOP;
    END IF;

    IF v_existing_count > v_spec_count THEN
      DELETE FROM public.requirement_templates
       WHERE id = ANY(v_current_ids[(v_spec_count + 1):v_existing_count]);
    END IF;

    -- Sync priority_quotas if provided
    IF v_row ? 'priority_quotas' AND v_row->'priority_quotas' IS NOT NULL THEN
      DELETE FROM public.requirement_template_priority_quotas
       WHERE area_id = v_area_id
         AND position_id = v_position_id
         AND shift_id = v_shift_id;

      FOR v_quota_elem IN SELECT elem FROM jsonb_array_elements(v_row->'priority_quotas') AS elem
      LOOP
        INSERT INTO public.requirement_template_priority_quotas (
          area_id, position_id, shift_id, day_of_week, priority, required_count
        ) VALUES (
          v_area_id,
          v_position_id,
          v_shift_id,
          ((v_quota_elem->>'day_of_week')::numeric)::int,
          UPPER(TRIM(v_quota_elem->>'priority')),
          ((v_quota_elem->>'required_count')::numeric)::int
        );
      END LOOP;
    ELSIF v_spec_count = 0 THEN
      DELETE FROM public.requirement_template_priority_quotas
       WHERE area_id = v_area_id
         AND position_id = v_position_id
         AND shift_id = v_shift_id;
    END IF;

    v_updated_rows := v_updated_rows + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated_rows', v_updated_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.save_weekly_matrix_changes(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_weekly_matrix_changes(jsonb) TO authenticated;

-- 4. Atomic RPC for Generar Mes (requirements + priority_quotas + holiday cleanup + Blue Express AM 00 in one transaction)
CREATE OR REPLACE FUNCTION public.materialize_requirements_with_quotas(
  p_items jsonb,
  p_holiday_delete_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_blue_upserts jsonb DEFAULT '[]'::jsonb,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_user_role text;
  v_item jsonb;
  v_area_id uuid;
  v_position_id uuid;
  v_shift_id uuid;
  v_date date;
  v_req_count int;
  v_priority text;
  v_req_id uuid;
  v_created_count int := 0;
  v_holiday_cleaned_count int := 0;
  v_blue_upserted_count int := 0;
  v_q jsonb;
  v_q_prio text;
  v_q_count int;
  v_q_sum int;
  v_del_id uuid;
  v_del_row record;
  v_area_norm text;
  v_pos_norm text;
  v_shift_norm text;
  v_shift_start text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT u.role INTO v_user_role FROM public.users u WHERE u.id = v_uid;
  IF v_user_role IS NULL OR v_user_role NOT IN ('ADMIN', 'HR', 'SUPERVISOR') THEN
    RAISE EXCEPTION 'No autorizado para generar requerimientos.' USING ERRCODE = '42501';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items debe ser un arreglo JSON.' USING ERRCODE = '22023';
  END IF;
  IF p_blue_upserts IS NULL OR jsonb_typeof(p_blue_upserts) <> 'array' THEN
    RAISE EXCEPTION 'p_blue_upserts debe ser un arreglo JSON.' USING ERRCODE = '22023';
  END IF;
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND p_start_date > p_end_date THEN
    RAISE EXCEPTION 'Rango de fechas inválido en materialize_requirements_with_quotas.' USING ERRCODE = '22023';
  END IF;

  -- Step A: Insert missing ordinary requirements + priority_quotas
  FOR v_item IN SELECT elem FROM jsonb_array_elements(p_items) AS elem
  LOOP
    v_area_id := (v_item->>'area_id')::uuid;
    v_position_id := (v_item->>'position_id')::uuid;
    v_shift_id := (v_item->>'shift_id')::uuid;
    v_date := (v_item->>'date')::date;
    v_req_count := ((v_item->>'required_count')::numeric)::int;
    v_priority := UPPER(TRIM(COALESCE(NULLIF(v_item->>'priority', ''), 'NORMAL')));

    IF (p_start_date IS NOT NULL AND v_date < p_start_date) OR (p_end_date IS NOT NULL AND v_date > p_end_date) THEN
      RAISE EXCEPTION 'Fecha % fuera del rango seleccionado.', v_date USING ERRCODE = '22023';
    END IF;
    IF v_priority NOT IN ('CRITICAL', 'HIGH', 'NORMAL', 'LOW') THEN
      RAISE EXCEPTION 'Prioridad inválida en requerimiento: %', v_priority USING ERRCODE = '22023';
    END IF;
    IF v_req_count < 0 OR v_req_count > 9999 THEN
      RAISE EXCEPTION 'required_count inválido: %', v_req_count USING ERRCODE = '22023';
    END IF;

    v_req_id := NULL;
    INSERT INTO public.shift_requirements (
      area_id, position_id, shift_id, date, required_count, priority, is_extra
    ) VALUES (
      v_area_id, v_position_id, v_shift_id, v_date, v_req_count, v_priority, false
    )
    ON CONFLICT (area_id, position_id, shift_id, date, is_extra) DO NOTHING
    RETURNING id INTO v_req_id;

    IF v_req_id IS NOT NULL THEN
      v_created_count := v_created_count + 1;

      IF v_item ? 'priority_quotas' AND v_item->'priority_quotas' IS NOT NULL THEN
        IF jsonb_typeof(v_item->'priority_quotas') <> 'array' THEN
          RAISE EXCEPTION 'priority_quotas debe ser un arreglo JSON.' USING ERRCODE = '22023';
        END IF;
        v_q_sum := 0;
        FOR v_q IN SELECT elem FROM jsonb_array_elements(v_item->'priority_quotas') AS elem
        LOOP
          v_q_prio := UPPER(TRIM(COALESCE(v_q->>'priority', '')));
          v_q_count := ((v_q->>'required_count')::numeric)::int;
          IF v_q_prio NOT IN ('CRITICAL', 'HIGH', 'NORMAL', 'LOW') THEN
            RAISE EXCEPTION 'Prioridad inválida en priority_quotas: %', v_q_prio USING ERRCODE = '22023';
          END IF;
          IF v_q_count <= 0 OR v_q_count > 9999 THEN
            RAISE EXCEPTION 'required_count inválido en priority_quotas: %', v_q_count USING ERRCODE = '22023';
          END IF;
          v_q_sum := v_q_sum + v_q_count;
          INSERT INTO public.shift_requirement_priority_quotas (
            shift_requirement_id, priority, required_count
          ) VALUES (
            v_req_id, v_q_prio, v_q_count
          );
        END LOOP;
        IF jsonb_array_length(v_item->'priority_quotas') > 0 AND v_q_sum <> v_req_count THEN
          RAISE EXCEPTION 'La suma del desglose por prioridad (%) no coincide con required_count (%).', v_q_sum, v_req_count USING ERRCODE = '22023';
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- Step B: Validate & clean pre-existing holiday zero-staffing pairs (must be in range, on verified holiday, and one of the 3 allowed pairs)
  IF p_holiday_delete_ids IS NOT NULL AND COALESCE(array_length(p_holiday_delete_ids, 1), 0) > 0 THEN
    FOREACH v_del_id IN ARRAY p_holiday_delete_ids
    LOOP
      SELECT sr.id, sr.date, sr.is_extra, a.name AS area_name, p.name AS position_name
        INTO v_del_row
        FROM public.shift_requirements sr
        LEFT JOIN public.areas a ON a.id = sr.area_id
        LEFT JOIN public.positions p ON p.id = sr.position_id
       WHERE sr.id = v_del_id
       FOR UPDATE OF sr;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Requerimiento a eliminar (%) no existe.', v_del_id USING ERRCODE = '22023';
      END IF;
      IF v_del_row.is_extra IS TRUE THEN
        RAISE EXCEPTION 'No se permite eliminar cupos Extra (%) en limpieza de feriados.', v_del_id USING ERRCODE = '22023';
      END IF;
      IF (p_start_date IS NOT NULL AND v_del_row.date < p_start_date) OR (p_end_date IS NOT NULL AND v_del_row.date > p_end_date) THEN
        RAISE EXCEPTION 'Requerimiento (%) fuera del rango seleccionado (%..%).', v_del_id, p_start_date, p_end_date USING ERRCODE = '22023';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.chile_national_holidays h WHERE h.date = v_del_row.date
      ) THEN
        RAISE EXCEPTION 'La fecha % del requerimiento (%) no corresponde a un feriado nacional verificado.', v_del_row.date, v_del_id USING ERRCODE = '22023';
      END IF;

      v_area_norm := translate(upper(trim(COALESCE(v_del_row.area_name, ''))), 'ÁÉÍÓÚÜÑ', 'AEIOUUN');
      v_pos_norm := translate(upper(trim(COALESCE(v_del_row.position_name, ''))), 'ÁÉÍÓÚÜÑ', 'AEIOUUN');
      IF NOT (
        (v_area_norm = 'ATREX' AND v_pos_norm IN ('OPERADOR DE GRUA', 'OPERADOR GRUA', 'OPERADOR GRUA HORQUILLA', 'OPERADOR DE GRUA HORQUILLA'))
        OR (v_area_norm IN ('BASE', 'BASE MINERQUIM') AND v_pos_norm IN ('OPERADOR DE GRUA', 'OPERADOR GRUA', 'OPERADOR GRUA HORQUILLA', 'OPERADOR DE GRUA HORQUILLA', 'SUPERVISOR', 'SUPERVISOR BASE'))
      ) THEN
        RAISE EXCEPTION 'El requerimiento (%) no pertenece a Grúa Atrex, Grúa Base o Supervisor Base.', v_del_id USING ERRCODE = '22023';
      END IF;
    END LOOP;

    DELETE FROM public.shift_requirements
     WHERE id = ANY(p_holiday_delete_ids)
       AND is_extra = false;
    GET DIAGNOSTICS v_holiday_cleaned_count = ROW_COUNT;
  END IF;

  -- Step C: Validate & upsert Blue Express AM 00 approved proposal (Conductor Camión / Ayudante en Blue Express AM 00 dentro del rango)
  FOR v_item IN SELECT elem FROM jsonb_array_elements(p_blue_upserts) AS elem
  LOOP
    v_area_id := (v_item->>'area_id')::uuid;
    v_position_id := (v_item->>'position_id')::uuid;
    v_shift_id := (v_item->>'shift_id')::uuid;
    v_date := (v_item->>'date')::date;
    v_req_count := ((v_item->>'required_count')::numeric)::int;
    v_priority := UPPER(TRIM(COALESCE(NULLIF(v_item->>'priority', ''), 'NORMAL')));

    IF (p_start_date IS NOT NULL AND v_date < p_start_date) OR (p_end_date IS NOT NULL AND v_date > p_end_date) THEN
      RAISE EXCEPTION 'Fecha % en Blue Express AM 00 fuera del rango seleccionado.', v_date USING ERRCODE = '22023';
    END IF;
    IF v_priority NOT IN ('CRITICAL', 'HIGH', 'NORMAL', 'LOW') THEN
      RAISE EXCEPTION 'Prioridad inválida en Blue Express AM 00: %', v_priority USING ERRCODE = '22023';
    END IF;
    IF v_req_count < 0 OR v_req_count > 9999 THEN
      RAISE EXCEPTION 'required_count inválido en Blue Express AM 00: %', v_req_count USING ERRCODE = '22023';
    END IF;

    SELECT translate(upper(trim(COALESCE(a.name, ''))), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
           translate(upper(trim(COALESCE(p.name, ''))), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
           translate(upper(trim(COALESCE(s.name, ''))), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
           COALESCE(s.start_time::text, '')
      INTO v_area_norm, v_pos_norm, v_shift_norm, v_shift_start
      FROM public.areas a, public.positions p, public.shifts s
     WHERE a.id = v_area_id AND p.id = v_position_id AND s.id = v_shift_id;

    IF NOT FOUND
       OR v_area_norm NOT LIKE '%BLUE%'
       OR v_pos_norm NOT IN ('CONDUCTOR CAMION', 'AYUDANTE')
       OR (v_shift_start NOT LIKE '00:00%' AND v_shift_norm NOT LIKE '%AM 00%' AND v_shift_norm NOT LIKE '%AM00%') THEN
      RAISE EXCEPTION 'Solo se permiten cupos de Conductor Camión o Ayudante en Blue Express AM 00.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.shift_requirements (
      area_id, position_id, shift_id, date, required_count, priority, is_extra
    ) VALUES (
      v_area_id, v_position_id, v_shift_id, v_date, v_req_count, v_priority, false
    )
    ON CONFLICT (area_id, position_id, shift_id, date, is_extra) DO UPDATE
      SET required_count = EXCLUDED.required_count,
          priority = EXCLUDED.priority;

    v_blue_upserted_count := v_blue_upserted_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'created_count', v_created_count,
    'holiday_cleaned_count', v_holiday_cleaned_count,
    'blue_upserted_count', v_blue_upserted_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.materialize_requirements_with_quotas(jsonb, uuid[], jsonb, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materialize_requirements_with_quotas(jsonb, uuid[], jsonb, date, date) TO authenticated;

-- 5. Atomic RPC to sync already-generated requirements from current weekly rules (respecting server-verified Chilean national holidays)
CREATE OR REPLACE FUNCTION public.apply_rule_changes_to_generated_requirements(
  p_requirement_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_user_role text;
  v_req record;
  v_dow int;
  v_next_count int;
  v_next_prio text;
  v_has_quotas boolean;
  v_is_holiday_zero boolean;
  v_area_norm text;
  v_pos_norm text;
  v_updated_count int := 0;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT u.role INTO v_user_role FROM public.users u WHERE u.id = v_uid;
  IF v_user_role IS NULL OR v_user_role NOT IN ('ADMIN', 'HR', 'SUPERVISOR') THEN
    RAISE EXCEPTION 'No autorizado para actualizar requerimientos.' USING ERRCODE = '42501';
  END IF;

  IF p_requirement_ids IS NULL OR COALESCE(array_length(p_requirement_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object('success', true, 'updated_count', 0);
  END IF;

  FOR v_req IN
    SELECT sr.id, sr.date, sr.area_id, sr.position_id, sr.shift_id,
           a.name AS area_name, p.name AS position_name
      FROM public.shift_requirements sr
      LEFT JOIN public.areas a ON a.id = sr.area_id
      LEFT JOIN public.positions p ON p.id = sr.position_id
     WHERE sr.id = ANY(p_requirement_ids)
       AND sr.is_extra = false
     ORDER BY sr.date ASC, sr.id ASC
     FOR UPDATE OF sr
  LOOP
    v_dow := EXTRACT(DOW FROM v_req.date)::int;
    v_is_holiday_zero := false;

    IF EXISTS (SELECT 1 FROM public.chile_national_holidays h WHERE h.date = v_req.date) THEN
      v_area_norm := translate(upper(trim(COALESCE(v_req.area_name, ''))), 'ÁÉÍÓÚÜÑ', 'AEIOUUN');
      v_pos_norm := translate(upper(trim(COALESCE(v_req.position_name, ''))), 'ÁÉÍÓÚÜÑ', 'AEIOUUN');
      IF (
        v_area_norm = 'ATREX'
        AND v_pos_norm IN ('OPERADOR DE GRUA', 'OPERADOR GRUA', 'OPERADOR GRUA HORQUILLA', 'OPERADOR DE GRUA HORQUILLA')
      ) OR (
        v_area_norm IN ('BASE', 'BASE MINERQUIM')
        AND v_pos_norm IN ('OPERADOR DE GRUA', 'OPERADOR GRUA', 'OPERADOR GRUA HORQUILLA', 'OPERADOR DE GRUA HORQUILLA', 'SUPERVISOR', 'SUPERVISOR BASE')
      ) THEN
        v_is_holiday_zero := true;
      END IF;
    END IF;

    IF v_is_holiday_zero THEN
      v_next_count := 0;
      v_next_prio := 'NORMAL';
      v_has_quotas := false;
    ELSE
      SELECT EXISTS (
        SELECT 1
          FROM public.requirement_template_priority_quotas q
         WHERE q.area_id = v_req.area_id
           AND q.position_id = v_req.position_id
           AND q.shift_id = v_req.shift_id
           AND q.day_of_week = v_dow
      ) INTO v_has_quotas;

      IF v_has_quotas THEN
        SELECT COALESCE(SUM(q.required_count), 0)::int,
               CASE MAX(
                 CASE q.priority
                   WHEN 'CRITICAL' THEN 4
                   WHEN 'HIGH' THEN 3
                   WHEN 'NORMAL' THEN 2
                   WHEN 'LOW' THEN 1
                   ELSE 2
                 END
               )
                 WHEN 4 THEN 'CRITICAL'
                 WHEN 3 THEN 'HIGH'
                 WHEN 2 THEN 'NORMAL'
                 WHEN 1 THEN 'LOW'
                 ELSE 'NORMAL'
               END
          INTO v_next_count, v_next_prio
          FROM public.requirement_template_priority_quotas q
         WHERE q.area_id = v_req.area_id
           AND q.position_id = v_req.position_id
           AND q.shift_id = v_req.shift_id
           AND q.day_of_week = v_dow;
      ELSE
        SELECT COALESCE(SUM(rt.required_count), 0)::int,
               CASE MAX(
                 CASE COALESCE(NULLIF(rt.priority_overrides->>v_dow::text, ''), rt.priority)
                   WHEN 'CRITICAL' THEN 4
                   WHEN 'HIGH' THEN 3
                   WHEN 'NORMAL' THEN 2
                   WHEN 'LOW' THEN 1
                   ELSE 2
                 END
               )
                 WHEN 4 THEN 'CRITICAL'
                 WHEN 3 THEN 'HIGH'
                 WHEN 2 THEN 'NORMAL'
                 WHEN 1 THEN 'LOW'
                 ELSE 'NORMAL'
               END
          INTO v_next_count, v_next_prio
          FROM public.requirement_templates rt
         WHERE rt.area_id = v_req.area_id
           AND rt.position_id = v_req.position_id
           AND rt.shift_id = v_req.shift_id
           AND rt.is_active IS NOT FALSE
           AND v_dow = ANY(rt.days_of_week);
      END IF;
    END IF;

    v_next_count := COALESCE(v_next_count, 0);
    v_next_prio := COALESCE(v_next_prio, 'NORMAL');

    UPDATE public.shift_requirements
       SET required_count = v_next_count,
           priority = v_next_prio
     WHERE id = v_req.id;

    DELETE FROM public.shift_requirement_priority_quotas
     WHERE shift_requirement_id = v_req.id;

    IF v_has_quotas THEN
      INSERT INTO public.shift_requirement_priority_quotas (
        shift_requirement_id, priority, required_count
      )
      SELECT v_req.id, q.priority, q.required_count
        FROM public.requirement_template_priority_quotas q
       WHERE q.area_id = v_req.area_id
         AND q.position_id = v_req.position_id
         AND q.shift_id = v_req.shift_id
         AND q.day_of_week = v_dow;
    ELSIF v_next_count > 0 THEN
      INSERT INTO public.shift_requirement_priority_quotas (
        shift_requirement_id, priority, required_count
      ) VALUES (
        v_req.id, v_next_prio, v_next_count
      );
    END IF;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated_count);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_rule_changes_to_generated_requirements(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_rule_changes_to_generated_requirements(uuid[]) TO authenticated;
