-- Incremental migration: Blue Express AM 00 priority_quotas & priority-only sync
-- Requires 20261124_add_priority_quotas_tables.sql already applied.

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
          priority = EXCLUDED.priority
    RETURNING id INTO v_req_id;

    DELETE FROM public.shift_requirement_priority_quotas
     WHERE shift_requirement_id = v_req_id;

    IF v_item ? 'priority_quotas' AND v_item->'priority_quotas' IS NOT NULL AND jsonb_typeof(v_item->'priority_quotas') = 'array' AND jsonb_array_length(v_item->'priority_quotas') > 0 THEN
      v_q_sum := 0;
      FOR v_q IN SELECT elem FROM jsonb_array_elements(v_item->'priority_quotas') AS elem
      LOOP
        v_q_prio := UPPER(TRIM(COALESCE(v_q->>'priority', '')));
        v_q_count := ((v_q->>'required_count')::numeric)::int;
        IF v_q_prio NOT IN ('CRITICAL', 'HIGH', 'NORMAL', 'LOW') THEN
          RAISE EXCEPTION 'Prioridad inválida en Blue Express priority_quotas: %', v_q_prio USING ERRCODE = '22023';
        END IF;
        IF v_q_count <= 0 OR v_q_count > 9999 THEN
          RAISE EXCEPTION 'required_count inválido en Blue Express priority_quotas: %', v_q_count USING ERRCODE = '22023';
        END IF;
        v_q_sum := v_q_sum + v_q_count;
        INSERT INTO public.shift_requirement_priority_quotas (
          shift_requirement_id, priority, required_count
        ) VALUES (
          v_req_id, v_q_prio, v_q_count
        );
      END LOOP;
      IF v_q_sum <> v_req_count THEN
        RAISE EXCEPTION 'La suma del desglose por prioridad (%) en Blue Express AM 00 no coincide con la cantidad aprobada (%).', v_q_sum, v_req_count USING ERRCODE = '22023';
      END IF;
    ELSIF v_req_count > 0 THEN
      INSERT INTO public.shift_requirement_priority_quotas (
        shift_requirement_id, priority, required_count
      ) VALUES (
        v_req_id, v_priority, v_req_count
      );
    END IF;

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

DROP FUNCTION IF EXISTS public.apply_rule_changes_to_generated_requirements(uuid[]);

-- 5. Atomic RPC to sync already-generated requirements from current weekly rules (respecting server-verified Chilean national holidays & Blue Express AM 00 priority-only mode)
CREATE OR REPLACE FUNCTION public.apply_rule_changes_to_generated_requirements(
  p_requirement_ids uuid[],
  p_priority_only boolean DEFAULT false
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
  v_quota_group_count int;
  v_quota_sum int;
  v_is_holiday_zero boolean;
  v_is_blue_am00 boolean;
  v_preserve_count boolean;
  v_area_norm text;
  v_pos_norm text;
  v_shift_norm text;
  v_shift_start text;
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
    SELECT sr.id, sr.date, sr.area_id, sr.position_id, sr.shift_id, sr.required_count, sr.priority,
           a.name AS area_name, p.name AS position_name, s.name AS shift_name, COALESCE(s.start_time::text, '') AS shift_start
      FROM public.shift_requirements sr
      LEFT JOIN public.areas a ON a.id = sr.area_id
      LEFT JOIN public.positions p ON p.id = sr.position_id
      LEFT JOIN public.shifts s ON s.id = sr.shift_id
     WHERE sr.id = ANY(p_requirement_ids)
       AND sr.is_extra = false
     ORDER BY sr.date ASC, sr.id ASC
     FOR UPDATE OF sr
  LOOP
    v_dow := EXTRACT(DOW FROM v_req.date)::int;
    v_area_norm := translate(upper(trim(COALESCE(v_req.area_name, ''))), 'ÁÉÍÓÚÜÑ', 'AEIOUUN');
    v_pos_norm := translate(upper(trim(COALESCE(v_req.position_name, ''))), 'ÁÉÍÓÚÜÑ', 'AEIOUUN');
    v_shift_norm := translate(upper(trim(COALESCE(v_req.shift_name, ''))), 'ÁÉÍÓÚÜÑ', 'AEIOUUN');
    v_shift_start := v_req.shift_start;

    v_is_blue_am00 := (
      v_area_norm LIKE '%BLUE%'
      AND v_pos_norm IN ('CONDUCTOR CAMION', 'AYUDANTE')
      AND (v_shift_start LIKE '00:00%' OR v_shift_norm LIKE '%AM 00%' OR v_shift_norm LIKE '%AM00%')
    );
    v_preserve_count := COALESCE(p_priority_only, false) OR v_is_blue_am00;

    v_is_holiday_zero := false;
    IF EXISTS (SELECT 1 FROM public.chile_national_holidays h WHERE h.date = v_req.date) THEN
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
      v_quota_group_count := 0;
    ELSE
      SELECT COUNT(*)::int, COALESCE(SUM(q.required_count), 0)::int,
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
        INTO v_quota_group_count, v_quota_sum, v_next_prio
        FROM public.requirement_template_priority_quotas q
       WHERE q.area_id = v_req.area_id
         AND q.position_id = v_req.position_id
         AND q.shift_id = v_req.shift_id
         AND q.day_of_week = v_dow;

      v_has_quotas := v_quota_group_count > 0;

      IF v_has_quotas THEN
        IF v_preserve_count THEN
          v_next_count := v_req.required_count;
          IF v_quota_group_count > 1 AND v_quota_sum <> v_req.required_count THEN
            RAISE EXCEPTION 'La suma del desglose por prioridad (%) para % (%) no coincide con la cantidad aprobada (%).',
              v_quota_sum, v_req.position_name, v_req.date, v_req.required_count USING ERRCODE = '22023';
          END IF;
        ELSE
          v_next_count := v_quota_sum;
        END IF;
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

        IF v_preserve_count THEN
          v_next_count := v_req.required_count;
        END IF;
      END IF;
    END IF;

    v_next_count := COALESCE(v_next_count, 0);
    v_next_prio := COALESCE(v_next_prio, COALESCE(v_req.priority, 'NORMAL'));

    UPDATE public.shift_requirements
       SET required_count = v_next_count,
           priority = v_next_prio
     WHERE id = v_req.id;

    DELETE FROM public.shift_requirement_priority_quotas
     WHERE shift_requirement_id = v_req.id;

    IF v_has_quotas AND (NOT v_preserve_count OR v_quota_group_count > 1) THEN
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

REVOKE ALL ON FUNCTION public.apply_rule_changes_to_generated_requirements(uuid[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_rule_changes_to_generated_requirements(uuid[], boolean) TO authenticated;

