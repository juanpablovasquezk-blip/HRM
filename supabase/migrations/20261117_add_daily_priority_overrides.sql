-- Migration: Add daily priority_overrides on requirement_templates, priority on shift_requirements,
-- and update save_weekly_matrix_changes RPC with atomic persistence and concurrency checks (HRM-005.2).
-- NOTE: Existing historical shift_requirements default to 'NORMAL', which does not necessarily
-- represent their original operational priority; existing generated rows are not altered retroactively.
-- DO NOT run without explicit authorization.

-- 1. Add priority_overrides jsonb to requirement_templates
ALTER TABLE public.requirement_templates
  ADD COLUMN IF NOT EXISTS priority_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'requirement_templates_priority_overrides_object_check'
       AND conrelid = 'public.requirement_templates'::regclass
  ) THEN
    ALTER TABLE public.requirement_templates
      ADD CONSTRAINT requirement_templates_priority_overrides_object_check
      CHECK (jsonb_typeof(priority_overrides) = 'object');
  END IF;
END
$$;

-- 2. Add priority column to shift_requirements for future monthly generations
-- Historical rows default to 'NORMAL' without retroactive modification.
ALTER TABLE public.shift_requirements
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'NORMAL';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'shift_requirements_priority_check'
       AND conrelid = 'public.shift_requirements'::regclass
  ) THEN
    ALTER TABLE public.shift_requirements
      ADD CONSTRAINT shift_requirements_priority_check
      CHECK (priority IN ('CRITICAL', 'HIGH', 'NORMAL', 'LOW'));
  END IF;
END
$$;

-- 3. Update atomic RPC to persist priority_overrides and enforce optimistic concurrency
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
BEGIN
  -- 1. Authentication & Authorization (matches HRM role system: ADMIN, HR, SUPERVISOR)
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT u.role
    INTO v_user_role
    FROM public.users u
   WHERE u.id = v_uid;

  IF v_user_role IS NULL OR v_user_role NOT IN ('ADMIN', 'HR', 'SUPERVISOR') THEN
    RAISE EXCEPTION 'No autorizado para modificar reglas operacionales.' USING ERRCODE = '42501';
  END IF;

  -- 2. Top-level payload validation
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' OR jsonb_array_length(p_changes) = 0 THEN
    RAISE EXCEPTION 'La carga de cambios debe ser un arreglo JSON no vacío.' USING ERRCODE = '22023';
  END IF;

  -- 3. Full pre-validation pass over ALL rows before acquiring locks or mutating data
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
      RAISE EXCEPTION 'Prioridad operacional inválida. Valores permitidos: CRITICAL, HIGH, NORMAL, LOW.' USING ERRCODE = '22023';
    END IF;

    IF v_row ? 'is_new' AND jsonb_typeof(v_row->'is_new') <> 'boolean' THEN
      RAISE EXCEPTION 'El campo is_new debe ser booleano.' USING ERRCODE = '22023';
    END IF;
    v_is_new := COALESCE((v_row->>'is_new')::boolean, false);

    IF NOT v_is_new THEN
      IF NOT (v_row ? 'expected_counts') OR v_row->'expected_counts' IS NULL THEN
        RAISE EXCEPTION 'Falta expected_counts (7 enteros) para editar una regla existente.' USING ERRCODE = '22023';
      END IF;
      v_expected_counts_json := v_row->'expected_counts';
      IF jsonb_typeof(v_expected_counts_json) <> 'array' OR jsonb_array_length(v_expected_counts_json) <> 7 THEN
        RAISE EXCEPTION 'expected_counts debe ser un arreglo de 7 enteros.' USING ERRCODE = '22023';
      END IF;
      FOR v_day_elem IN SELECT elem FROM jsonb_array_elements(v_expected_counts_json) AS elem
      LOOP
        IF jsonb_typeof(v_day_elem) <> 'number' THEN
          RAISE EXCEPTION 'Cada elemento de expected_counts debe ser un entero.' USING ERRCODE = '22023';
        END IF;
        v_req_count_num := (v_day_elem #>> '{}')::numeric;
        IF v_req_count_num < 0 OR v_req_count_num <> trunc(v_req_count_num) THEN
          RAISE EXCEPTION 'expected_counts contiene valores enteros inválidos.' USING ERRCODE = '22023';
        END IF;
      END LOOP;

      IF NOT (v_row ? 'expected_priority') OR NULLIF(TRIM(v_row->>'expected_priority'), '') IS NULL THEN
        RAISE EXCEPTION 'Falta expected_priority para editar una regla existente.' USING ERRCODE = '22023';
      END IF;
      v_expected_priority := UPPER(TRIM(v_row->>'expected_priority'));
      IF v_expected_priority NOT IN ('CRITICAL', 'HIGH', 'NORMAL', 'LOW') THEN
        RAISE EXCEPTION 'expected_priority inválido.' USING ERRCODE = '22023';
      END IF;

      IF NOT (v_row ? 'expected_priority_overrides') OR v_row->'expected_priority_overrides' IS NULL THEN
        RAISE EXCEPTION 'Falta expected_priority_overrides para editar una regla existente.' USING ERRCODE = '22023';
      END IF;
      v_expected_overrides_json := v_row->'expected_priority_overrides';
      IF jsonb_typeof(v_expected_overrides_json) <> 'object' THEN
        RAISE EXCEPTION 'expected_priority_overrides debe ser un objeto JSON.' USING ERRCODE = '22023';
      END IF;
      FOR v_ov_key, v_ov_val_json IN SELECT key, value FROM jsonb_each(v_expected_overrides_json)
      LOOP
        IF v_ov_key !~ '^[0-6]$' THEN
          RAISE EXCEPTION 'Clave de día inválida en expected_priority_overrides (0-6).' USING ERRCODE = '22023';
        END IF;
        IF jsonb_typeof(v_ov_val_json) <> 'string' THEN
          RAISE EXCEPTION 'Los valores de expected_priority_overrides deben ser cadenas JSON.' USING ERRCODE = '22023';
        END IF;
        v_ov_val := UPPER(TRIM(v_ov_val_json #>> '{}'));
        IF v_ov_val NOT IN ('CRITICAL', 'HIGH', 'NORMAL', 'LOW') THEN
          RAISE EXCEPTION 'Valor de prioridad inválido en expected_priority_overrides.' USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END IF;

    v_specs := v_row->'specs';
    IF v_specs IS NULL OR jsonb_typeof(v_specs) <> 'array' THEN
      RAISE EXCEPTION 'El campo specs debe ser un arreglo JSON.' USING ERRCODE = '22023';
    END IF;

    v_seen_row_days := ARRAY[]::int[];
    v_active_days := ARRAY[]::int[];
    FOR v_spec IN SELECT elem FROM jsonb_array_elements(v_specs) AS elem
    LOOP
      IF jsonb_typeof(v_spec) <> 'object' THEN
        RAISE EXCEPTION 'Cada regla en specs debe ser un objeto JSON.' USING ERRCODE = '22023';
      END IF;

      IF jsonb_typeof(v_spec->'required_count') <> 'number' THEN
        RAISE EXCEPTION 'required_count debe ser un número entero.' USING ERRCODE = '22023';
      END IF;

      v_req_count_num := (v_spec->>'required_count')::numeric;
      IF v_req_count_num < 0 OR v_req_count_num > 2147483647 OR v_req_count_num <> trunc(v_req_count_num) THEN
        RAISE EXCEPTION 'required_count debe ser un entero entre 0 y 2147483647.' USING ERRCODE = '22023';
      END IF;

      v_days_json := v_spec->'days_of_week';
      IF v_days_json IS NULL OR jsonb_typeof(v_days_json) <> 'array' OR jsonb_array_length(v_days_json) = 0 THEN
        RAISE EXCEPTION 'days_of_week debe ser un arreglo no vacío.' USING ERRCODE = '22023';
      END IF;

      v_days := ARRAY[]::int[];
      FOR v_day_elem IN SELECT elem FROM jsonb_array_elements(v_days_json) AS elem
      LOOP
        IF jsonb_typeof(v_day_elem) <> 'number' THEN
          RAISE EXCEPTION 'Cada día en days_of_week debe ser un número entero (0-6).' USING ERRCODE = '22023';
        END IF;

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

    -- Validate priority_overrides (keys 0-6, valid priority, and only on days with required_count > 0)
    v_overrides_json := COALESCE(v_row->'priority_overrides', '{}'::jsonb);
    IF jsonb_typeof(v_overrides_json) <> 'object' THEN
      RAISE EXCEPTION 'priority_overrides debe ser un objeto JSON.' USING ERRCODE = '22023';
    END IF;

    FOR v_ov_key, v_ov_val_json IN SELECT key, value FROM jsonb_each(v_overrides_json)
    LOOP
      IF v_ov_key !~ '^[0-6]$' THEN
        RAISE EXCEPTION 'Clave de día inválida en priority_overrides (0-6).' USING ERRCODE = '22023';
      END IF;
      IF jsonb_typeof(v_ov_val_json) <> 'string' THEN
        RAISE EXCEPTION 'Los valores de priority_overrides deben ser cadenas JSON.' USING ERRCODE = '22023';
      END IF;
      v_ov_val := UPPER(TRIM(v_ov_val_json #>> '{}'));
      IF v_ov_val NOT IN ('CRITICAL', 'HIGH', 'NORMAL', 'LOW') THEN
        RAISE EXCEPTION 'Prioridad inválida en priority_overrides.' USING ERRCODE = '22023';
      END IF;
      IF NOT ((v_ov_key::int) = ANY(v_active_days)) THEN
        RAISE EXCEPTION 'No se permiten excepciones de prioridad en días sin dotación requerida.' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END LOOP;

  -- 4. Lock, check optimistic concurrency, and mutate in deterministic order
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

    -- Normalize priority_overrides: keep only overrides strictly different from general priority
    v_clean_overrides := '{}'::jsonb;
    FOR v_ov_key, v_ov_val IN
      SELECT key, UPPER(TRIM(value #>> '{}'))
        FROM jsonb_each(COALESCE(v_row->'priority_overrides', '{}'::jsonb))
    LOOP
      IF v_ov_val <> v_priority THEN
        v_clean_overrides := v_clean_overrides || jsonb_build_object(v_ov_key, v_ov_val);
      END IF;
    END LOOP;

    -- Concurrency protection per (area_id, position_id, shift_id)
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

      -- Mandatory optimistic concurrency check on counts (bigint avoids int4 SUM overflow)
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

      -- Mandatory optimistic concurrency check on general priority
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

      -- Mandatory optimistic concurrency check on daily priority_overrides across ALL rows
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

    -- 5. Sync specs -> requirement_templates (update existing, insert new, delete excess)
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
            area_id,
            position_id,
            shift_id,
            required_count,
            days_of_week,
            priority,
            priority_overrides
          ) VALUES (
            v_area_id,
            v_position_id,
            v_shift_id,
            v_req_count,
            v_days,
            v_priority,
            v_clean_overrides
          );
        END IF;
      END LOOP;
    END IF;

    IF v_existing_count > v_spec_count THEN
      DELETE FROM public.requirement_templates
       WHERE id = ANY(v_current_ids[(v_spec_count + 1):v_existing_count]);
    END IF;

    v_updated_rows := v_updated_rows + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'updated_rows', v_updated_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_weekly_matrix_changes(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_weekly_matrix_changes(jsonb) TO authenticated;
