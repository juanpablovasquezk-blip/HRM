-- Migration: Atomic & authorized RPC for saving weekly matrix operational rules (HRM-005)
-- Uses SECURITY INVOKER so existing RLS policies on public.users and public.requirement_templates apply.

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
  v_seen_row_keys text[] := ARRAY[]::text[];
  v_row_key text;
  v_current_ids uuid[];
  v_spec_count int;
  v_existing_count int;
  v_idx int;
  v_updated_rows int := 0;
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

  -- 3. Process rows in deterministic order to prevent deadlocks under concurrent saves
  FOR v_row IN
    SELECT elem
      FROM jsonb_array_elements(p_changes) AS elem
     ORDER BY elem->>'area_id', elem->>'position_id', elem->>'shift_id'
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

    v_specs := v_row->'specs';
    IF v_specs IS NULL OR jsonb_typeof(v_specs) <> 'array' THEN
      RAISE EXCEPTION 'El campo specs debe ser un arreglo JSON.' USING ERRCODE = '22023';
    END IF;

    -- Validate all specs for this row before mutating
    v_seen_row_days := ARRAY[]::int[];

    FOR v_spec IN SELECT elem FROM jsonb_array_elements(v_specs) AS elem
    LOOP
      IF jsonb_typeof(v_spec) <> 'object' THEN
        RAISE EXCEPTION 'Cada regla en specs debe ser un objeto JSON.' USING ERRCODE = '22023';
      END IF;

      IF jsonb_typeof(v_spec->'required_count') <> 'number' THEN
        RAISE EXCEPTION 'required_count debe ser un número entero.' USING ERRCODE = '22023';
      END IF;

      v_req_count_num := (v_spec->>'required_count')::numeric;
      IF v_req_count_num < 0 OR v_req_count_num <> trunc(v_req_count_num) THEN
        RAISE EXCEPTION 'required_count debe ser un entero mayor o igual a cero.' USING ERRCODE = '22023';
      END IF;
      v_req_count := v_req_count_num::int;

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
      END LOOP;
    END LOOP;

    -- 4. Concurrency protection per (area_id, position_id, shift_id)
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

    v_spec_count := jsonb_array_length(v_specs);
    v_existing_count := COALESCE(array_length(v_current_ids, 1), 0);

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
                 days_of_week = v_days
           WHERE id = v_current_ids[v_idx + 1];
        ELSE
          INSERT INTO public.requirement_templates (
            area_id,
            position_id,
            shift_id,
            required_count,
            days_of_week
          ) VALUES (
            v_area_id,
            v_position_id,
            v_shift_id,
            v_req_count,
            v_days
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
