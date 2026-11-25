-- Atomic shared-quota reservation for worker free-day and vacation requests,
-- and transactional HR approval with impact revalidation.

CREATE OR REPLACE FUNCTION public.submit_worker_leave_request_tx(
  p_personnel_id uuid,
  p_kind text,
  p_dates date[] DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today date;
  v_dates date[];
  v_d date;
  v_deadline date;
  v_closed_dates date[] := ARRAY[]::date[];
  v_self_overlap date[] := ARRAY[]::date[];
  v_occupied_dates date[] := ARRAY[]::date[];
  v_main_position uuid;
  v_area_id uuid;
  v_rotation_pattern text;
  v_norm_pattern text;
  v_ns22_anchor_date text;
  v_requires_shifts boolean;
  v_birth_date text;
  v_is_5x2 boolean := false;
  v_week_start date;
  v_week_end date;
  v_bday_in_week date;
  v_existing_in_week date[];
  v_weekly_total_count integer;
  v_bday_name text;
  v_existing_name text;
  v_month_start date;
  v_month_end date;
  v_existing_free_count integer;
  v_new_free_count integer;
  v_inserted_ids uuid[] := ARRAY[]::uuid[];
  v_new_id uuid;
BEGIN
  IF p_kind NOT IN ('free_day', 'vacation') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_KIND', 'error', 'Tipo de solicitud inválido.');
  END IF;

  v_today := (p_now AT TIME ZONE 'America/Santiago')::date;

  IF p_kind = 'free_day' THEN
    SELECT ARRAY(
      SELECT DISTINCT u.d
      FROM unnest(COALESCE(p_dates, ARRAY[]::date[])) AS u(d)
      ORDER BY u.d
    ) INTO v_dates;

    IF v_dates IS NULL OR array_length(v_dates, 1) IS NULL OR array_length(v_dates, 1) < 1 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'EMPTY_DATES', 'error', 'Selecciona al menos una fecha.');
    END IF;
    IF array_length(v_dates, 1) > 2 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'MONTHLY_LIMIT_EXCEEDED', 'error', 'Máximo 2 días libres por mes.');
    END IF;
  ELSE
    IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_RANGE', 'error', 'El rango de vacaciones es inválido.');
    END IF;

    SELECT ARRAY(
      SELECT g::date
      FROM generate_series(p_start_date, p_end_date, interval '1 day') AS g
      ORDER BY g
    ) INTO v_dates;
  END IF;

  -- Check Santiago day-20 previous-month deadline for every date
  FOREACH v_d IN ARRAY v_dates LOOP
    v_deadline := (date_trunc('month', v_d)::date - interval '1 month' + interval '19 days')::date;
    IF v_today > v_deadline THEN
      v_closed_dates := array_append(v_closed_dates, v_d);
    END IF;
  END LOOP;

  IF array_length(v_closed_dates, 1) IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'PERIOD_CLOSED',
      'closed_dates', to_jsonb(v_closed_dates),
      'error', 'El período seleccionado está cerrado para nuevas solicitudes.'
    );
  END IF;

  -- Resolve worker's main_position, area_id, rotation_pattern, ns22_anchor_date, requires_shifts, and birth_date
  SELECT p.main_position, pos.area_id, p.rotation_pattern, p.ns22_anchor_date::text, p.requires_shifts, p.birth_date::text
  INTO v_main_position, v_area_id, v_rotation_pattern, v_ns22_anchor_date, v_requires_shifts, v_birth_date
  FROM public.personnel p
  LEFT JOIN public.positions pos ON pos.id = p.main_position
  WHERE p.id = p_personnel_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PERSONNEL_NOT_FOUND', 'error', 'Trabajador no encontrado.');
  END IF;

  v_norm_pattern := UPPER(REPLACE(COALESCE(v_rotation_pattern, ''), '×', 'X'));
  v_is_5x2 := COALESCE(v_requires_shifts, true)
    AND v_ns22_anchor_date IS NULL
    AND v_norm_pattern NOT LIKE '%4X4%'
    AND v_norm_pattern NOT LIKE '%7X7%';

  -- Acquire per-worker + month advisory lock and per-worker + week advisory lock (5x2)
  IF p_kind = 'free_day' THEN
    FOR v_month_start IN
      SELECT DISTINCT date_trunc('month', d)::date AS m_start
      FROM unnest(v_dates) AS d
      ORDER BY m_start
    LOOP
      PERFORM pg_advisory_xact_lock(
        hashtext('worker_month_free_cap|' || p_personnel_id::text || '|' || to_char(v_month_start, 'YYYY-MM'))
      );
    END LOOP;

    IF v_is_5x2 THEN
      FOR v_week_start IN
        SELECT DISTINCT date_trunc('week', d)::date AS w_start
        FROM unnest(v_dates) AS d
        ORDER BY w_start
      LOOP
        PERFORM pg_advisory_xact_lock(
          hashtext('worker_week_free_cap|' || p_personnel_id::text || '|' || to_char(v_week_start, 'YYYY-MM-DD'))
        );
      END LOOP;
    END IF;
  END IF;

  -- Acquire deterministic transaction-scoped advisory locks in date order
  FOREACH v_d IN ARRAY v_dates LOOP
    PERFORM pg_advisory_xact_lock(hashtext('worker_self|' || p_personnel_id::text || '|' || v_d::text));
    IF v_main_position IS NOT NULL AND v_area_id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(
        hashtext('shared_quota|' || v_area_id::text || '|' || v_main_position::text || '|' || v_d::text)
      );
    END IF;
  END LOOP;

  -- Check worker's own overlapping requests / approved leaves (except rejected)
  SELECT ARRAY(
    SELECT d
    FROM unnest(v_dates) AS d
    WHERE EXISTS (
      SELECT 1
      FROM public.leaves l
      WHERE l.personnel_id = p_personnel_id
        AND l.status IN ('pending', 'approved')
        AND l.start_date::date <= d
        AND l.end_date::date >= d
    )
    ORDER BY d
  ) INTO v_self_overlap;

  IF array_length(v_self_overlap, 1) IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'SELF_OVERLAP',
      'occupied_dates', to_jsonb(v_self_overlap),
      'error', 'Ya tienes una solicitud o ausencia registrada en alguna de estas fechas.'
    );
  END IF;

  -- Check monthly 2-day cap for free_day requests (counting pending + approved)
  IF p_kind = 'free_day' THEN
    FOR v_month_start IN
      SELECT DISTINCT date_trunc('month', d)::date AS m_start
      FROM unnest(v_dates) AS d
      ORDER BY m_start
    LOOP
      v_month_end := (v_month_start + interval '1 month' - interval '1 day')::date;

      SELECT COUNT(DISTINCT g::date)
      INTO v_existing_free_count
      FROM public.leaves l
      CROSS JOIN LATERAL generate_series(
        GREATEST(l.start_date::date, v_month_start),
        LEAST(l.end_date::date, v_month_end),
        interval '1 day'
      ) AS g
      WHERE l.personnel_id = p_personnel_id
        AND l.status IN ('pending', 'approved')
        AND l.type = 'other'
        AND l.reason = 'Solicitud mensual de días libres'
        AND l.start_date::date <= v_month_end
        AND l.end_date::date >= v_month_start;

      SELECT COUNT(*)
      INTO v_new_free_count
      FROM unnest(v_dates) AS d
      WHERE d >= v_month_start AND d <= v_month_end;

      IF (COALESCE(v_existing_free_count, 0) + COALESCE(v_new_free_count, 0)) > 2 THEN
        RETURN jsonb_build_object(
          'ok', false,
          'code', 'MONTHLY_LIMIT_EXCEEDED',
          'error', 'Superas el máximo de 2 días libres permitidos para este mes.'
        );
      END IF;
    END LOOP;

    -- Check 5x2 weekly (Monday-to-Sunday) cap of 2 free days (birthday + pending/approved + selected, deduplicated)
    IF v_is_5x2 THEN
      FOR v_week_start IN
        SELECT DISTINCT date_trunc('week', d)::date AS w_start
        FROM unnest(v_dates) AS d
        ORDER BY w_start
      LOOP
        v_week_end := v_week_start + 6;
        v_bday_in_week := NULL;

        IF v_birth_date IS NOT NULL AND length(trim(v_birth_date)) >= 10 THEN
          SELECT g::date
          INTO v_bday_in_week
          FROM generate_series(v_week_start, v_week_end, interval '1 day') AS g
          WHERE to_char(g::date, 'MM-DD') = substring(trim(v_birth_date) FROM 6 FOR 5)
          LIMIT 1;
        END IF;

        SELECT COALESCE(ARRAY(
          SELECT DISTINCT g::date
          FROM public.leaves l
          CROSS JOIN LATERAL generate_series(
            GREATEST(l.start_date::date, v_week_start),
            LEAST(l.end_date::date, v_week_end),
            interval '1 day'
          ) AS g
          WHERE l.personnel_id = p_personnel_id
            AND l.status IN ('pending', 'approved')
            AND l.type = 'other'
            AND l.reason = 'Solicitud mensual de días libres'
            AND l.start_date::date <= v_week_end
            AND l.end_date::date >= v_week_start
          ORDER BY g::date
        ), ARRAY[]::date[]) INTO v_existing_in_week;

        SELECT COUNT(DISTINCT u.d)
        INTO v_weekly_total_count
        FROM (
          SELECT v_bday_in_week AS d WHERE v_bday_in_week IS NOT NULL
          UNION
          SELECT x AS d FROM unnest(v_existing_in_week) AS x
          UNION
          SELECT x AS d FROM unnest(v_dates) AS x WHERE x >= v_week_start AND x <= v_week_end
        ) AS u;

        IF v_weekly_total_count > 2 THEN
          IF v_bday_in_week IS NOT NULL THEN
            v_bday_name := CASE EXTRACT(ISODOW FROM v_bday_in_week)::int
              WHEN 1 THEN 'lunes' WHEN 2 THEN 'martes' WHEN 3 THEN 'miércoles'
              WHEN 4 THEN 'jueves' WHEN 5 THEN 'viernes' WHEN 6 THEN 'sábado' ELSE 'domingo'
            END;
            IF array_length(v_existing_in_week, 1) IS NOT NULL THEN
              v_existing_name := CASE EXTRACT(ISODOW FROM v_existing_in_week[1])::int
                WHEN 1 THEN 'lunes' WHEN 2 THEN 'martes' WHEN 3 THEN 'miércoles'
                WHEN 4 THEN 'jueves' WHEN 5 THEN 'viernes' WHEN 6 THEN 'sábado' ELSE 'domingo'
              END;
              RETURN jsonb_build_object(
                'ok', false,
                'code', 'WEEKLY_LIMIT_EXCEEDED',
                'error', 'El ' || v_bday_name || ' ya tienes libre por tu cumpleaños. Con el ' || v_existing_name || ' completas tus dos días libres de esta semana.'
              );
            ELSE
              RETURN jsonb_build_object(
                'ok', false,
                'code', 'WEEKLY_LIMIT_EXCEEDED',
                'error', 'El ' || v_bday_name || ' ya tienes libre por tu cumpleaños. Solo puedes elegir un día libre adicional esta semana (elige uno).'
              );
            END IF;
          ELSE
            RETURN jsonb_build_object(
              'ok', false,
              'code', 'WEEKLY_LIMIT_EXCEEDED',
              'error', 'Ya completas tus dos días libres permitidos para esta semana (lunes a domingo). Elige otra fecha.'
            );
          END IF;
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- Check shared quota (1 slot per date for same main_position + area_id)
  IF v_main_position IS NOT NULL AND v_area_id IS NOT NULL THEN
    SELECT ARRAY(
      SELECT d
      FROM unnest(v_dates) AS d
      WHERE EXISTS (
        SELECT 1
        FROM public.leaves l
        JOIN public.personnel p ON p.id = l.personnel_id
        JOIN public.positions pos ON pos.id = p.main_position
        WHERE l.personnel_id <> p_personnel_id
          AND p.main_position = v_main_position
          AND pos.area_id = v_area_id
          AND l.status IN ('pending', 'approved')
          AND (
            l.type = 'vacation'
            OR (l.type = 'other' AND l.reason = 'Solicitud mensual de días libres')
          )
          AND l.start_date::date <= d
          AND l.end_date::date >= d
      )
      ORDER BY d
    ) INTO v_occupied_dates;

    IF array_length(v_occupied_dates, 1) IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'QUOTA_OCCUPIED',
        'occupied_dates', to_jsonb(v_occupied_dates),
        'error', 'El cupo para tu cargo y área ya está ocupado en las fechas indicadas. Elige otras fechas disponibles.'
      );
    END IF;
  END IF;

  -- Insert pending leave record(s) without touching shifts or transport
  IF p_kind = 'free_day' THEN
    FOREACH v_d IN ARRAY v_dates LOOP
      INSERT INTO public.leaves (personnel_id, start_date, end_date, type, status, reason)
      VALUES (p_personnel_id, v_d::text, v_d::text, 'other', 'pending', 'Solicitud mensual de días libres')
      RETURNING id INTO v_new_id;
      v_inserted_ids := array_append(v_inserted_ids, v_new_id);
    END LOOP;
  ELSE
    INSERT INTO public.leaves (personnel_id, start_date, end_date, type, status, reason)
    VALUES (p_personnel_id, p_start_date::text, p_end_date::text, 'vacation', 'pending', 'Solicitud de vacaciones')
    RETURNING id INTO v_new_id;
    v_inserted_ids := array_append(v_inserted_ids, v_new_id);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'ids', to_jsonb(v_inserted_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_worker_leave_request_tx(uuid, text, date[], date, date, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_worker_leave_request_tx(uuid, text, date[], date, date, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.submit_worker_leave_request_tx(uuid, text, date[], date, date, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.submit_worker_leave_request_tx(uuid, text, date[], date, date, timestamptz) TO service_role;


CREATE OR REPLACE FUNCTION public.approve_leave_with_impact_tx(
  p_leave_id uuid,
  p_approved_by text,
  p_expected_dates date[] DEFAULT NULL,
  p_expected_shift_ids uuid[] DEFAULT NULL,
  p_expected_transport_ids uuid[] DEFAULT NULL,
  p_expected_shift_signatures text[] DEFAULT NULL,
  p_expected_transport_signatures text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_leave record;
  v_actual_dates date[];
  v_expected_dates_sorted date[];
  v_actual_shift_ids uuid[];
  v_expected_shift_ids_sorted uuid[];
  v_actual_shift_sigs text[];
  v_expected_shift_sigs_sorted text[];
  v_actual_transport_ids uuid[];
  v_expected_transport_ids_sorted uuid[];
  v_actual_transport_sigs text[];
  v_expected_transport_sigs_sorted text[];
  v_conf record;
  v_prev_day date;
  v_next_day date;
BEGIN
  SELECT * INTO v_leave
  FROM public.leaves
  WHERE id = p_leave_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'Solicitud no encontrada.');
  END IF;

  IF v_leave.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'STALE_STATUS',
      'error', 'La solicitud ya no está pendiente de revisión. Actualiza la vista.'
    );
  END IF;

  IF p_expected_dates IS NULL
     OR p_expected_shift_ids IS NULL
     OR p_expected_transport_ids IS NULL
     OR p_expected_shift_signatures IS NULL
     OR p_expected_transport_signatures IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'MISSING_IMPACT',
      'error', 'Debes revisar el impacto de fechas, turnos y traslados antes de aprobar.'
    );
  END IF;

  SELECT COALESCE(ARRAY(
    SELECT g::date
    FROM generate_series(v_leave.start_date::date, v_leave.end_date::date, interval '1 day') AS g
    ORDER BY g
  ), ARRAY[]::date[]) INTO v_actual_dates;

  SELECT COALESCE(ARRAY(
    SELECT DISTINCT d FROM unnest(p_expected_dates) AS d ORDER BY d
  ), ARRAY[]::date[]) INTO v_expected_dates_sorted;

  IF v_actual_dates IS DISTINCT FROM v_expected_dates_sorted THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'IMPACT_CHANGED',
      'error', 'Las fechas de la solicitud cambiaron desde la última revisión. Revisa el impacto actualizado.'
    );
  END IF;

  -- Revalidate ALL non-cancelled shifts (published AND drafts) in the range, including schedule & shift_id
  SELECT
    COALESCE(ARRAY_AGG(sa.id ORDER BY sa.id), ARRAY[]::uuid[]),
    COALESCE(ARRAY_AGG(
      sa.id::text || '|' || sa.date::text || '|' || sa.shift_id::text || '|' || sa.is_published::text || '|' ||
      COALESCE(s.start_time::text, '') || '|' || COALESCE(s.end_time::text, '')
      ORDER BY sa.id
    ), ARRAY[]::text[])
  INTO v_actual_shift_ids, v_actual_shift_sigs
  FROM public.shift_assignments sa
  LEFT JOIN public.shifts s ON s.id = sa.shift_id
  WHERE sa.personnel_id = v_leave.personnel_id
    AND sa.date::date >= v_leave.start_date::date
    AND sa.date::date <= v_leave.end_date::date
    AND sa.status <> 'cancelled';

  SELECT COALESCE(ARRAY(
    SELECT DISTINCT x FROM unnest(p_expected_shift_ids) AS x ORDER BY x
  ), ARRAY[]::uuid[]) INTO v_expected_shift_ids_sorted;

  IF v_actual_shift_ids IS DISTINCT FROM v_expected_shift_ids_sorted THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'IMPACT_CHANGED',
      'error', 'Los turnos afectados cambiaron desde que revisaste la solicitud. Revisa el impacto actualizado.'
    );
  END IF;

  SELECT COALESCE(ARRAY(
    SELECT DISTINCT x FROM unnest(p_expected_shift_signatures) AS x ORDER BY x
  ), ARRAY[]::text[]) INTO v_expected_shift_sigs_sorted;

  IF v_actual_shift_sigs IS DISTINCT FROM v_expected_shift_sigs_sorted THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'IMPACT_CHANGED',
      'error', 'El horario o estado de los turnos afectados cambió desde que revisaste la solicitud. Revisa el impacto actualizado.'
    );
  END IF;

  SELECT
    COALESCE(ARRAY_AGG(tr.id ORDER BY tr.id), ARRAY[]::uuid[]),
    COALESCE(ARRAY_AGG(
      tr.id::text || '|' || tr.date::text || '|' || COALESCE(tr.transport_type, '') || '|' || COALESCE(tr.status, '')
      ORDER BY tr.id
    ), ARRAY[]::text[])
  INTO v_actual_transport_ids, v_actual_transport_sigs
  FROM public.transport_requests tr
  WHERE tr.personnel_id = v_leave.personnel_id
    AND tr.date::date >= v_leave.start_date::date
    AND tr.date::date <= v_leave.end_date::date;

  SELECT COALESCE(ARRAY(
    SELECT DISTINCT t FROM unnest(p_expected_transport_ids) AS t ORDER BY t
  ), ARRAY[]::uuid[]) INTO v_expected_transport_ids_sorted;

  IF v_actual_transport_ids IS DISTINCT FROM v_expected_transport_ids_sorted THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'IMPACT_CHANGED',
      'error', 'Los traslados afectados cambiaron desde que revisaste la solicitud. Revisa el impacto actualizado.'
    );
  END IF;

  SELECT COALESCE(ARRAY(
    SELECT DISTINCT t FROM unnest(p_expected_transport_signatures) AS t ORDER BY t
  ), ARRAY[]::text[]) INTO v_expected_transport_sigs_sorted;

  IF v_actual_transport_sigs IS DISTINCT FROM v_expected_transport_sigs_sorted THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'IMPACT_CHANGED',
      'error', 'El detalle de los traslados afectados cambió desde que revisaste la solicitud. Revisa el impacto actualizado.'
    );
  END IF;

  -- Priority rule: approved vacation/sick overrides overlapping monthly free-day requests
  IF v_leave.type IN ('vacation', 'sick') THEN
    FOR v_conf IN
      SELECT *
      FROM public.leaves
      WHERE personnel_id = v_leave.personnel_id
        AND id <> p_leave_id
        AND status <> 'rejected'
        AND type = 'other'
        AND reason = 'Solicitud mensual de días libres'
        AND start_date::date <= v_leave.end_date::date
        AND end_date::date >= v_leave.start_date::date
      FOR UPDATE
    LOOP
      IF v_conf.start_date::date >= v_leave.start_date::date AND v_conf.end_date::date <= v_leave.end_date::date THEN
        DELETE FROM public.leaves WHERE id = v_conf.id;
      ELSIF v_conf.start_date::date < v_leave.start_date::date AND v_conf.end_date::date <= v_leave.end_date::date THEN
        v_prev_day := v_leave.start_date::date - 1;
        UPDATE public.leaves SET end_date = v_prev_day::text WHERE id = v_conf.id;
      ELSIF v_conf.start_date::date >= v_leave.start_date::date AND v_conf.end_date::date > v_leave.end_date::date THEN
        v_next_day := v_leave.end_date::date + 1;
        UPDATE public.leaves SET start_date = v_next_day::text WHERE id = v_conf.id;
      ELSIF v_conf.start_date::date < v_leave.start_date::date AND v_conf.end_date::date > v_leave.end_date::date THEN
        v_prev_day := v_leave.start_date::date - 1;
        v_next_day := v_leave.end_date::date + 1;
        UPDATE public.leaves SET end_date = v_prev_day::text WHERE id = v_conf.id;
        INSERT INTO public.leaves (personnel_id, type, status, reason, start_date, end_date)
        VALUES (v_leave.personnel_id, v_conf.type, v_conf.status, v_conf.reason, v_next_day::text, v_conf.end_date);
      END IF;
    END LOOP;
  END IF;

  -- 1. Approve leave
  UPDATE public.leaves
  SET status = 'approved',
      approved_by = p_approved_by,
      approved_at = now()
  WHERE id = p_leave_id;

  -- 2. Cancel ONLY the exact reviewed shift assignments
  IF array_length(v_actual_shift_ids, 1) IS NOT NULL THEN
    UPDATE public.shift_assignments
    SET status = 'cancelled'
    WHERE id = ANY(v_actual_shift_ids);
  END IF;

  -- 3. Delete ONLY the exact reviewed transport requests
  IF array_length(v_actual_transport_ids, 1) IS NOT NULL THEN
    DELETE FROM public.transport_requests
    WHERE id = ANY(v_actual_transport_ids);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'leave_type', v_leave.type,
    'personnel_id', v_leave.personnel_id,
    'start_date', v_leave.start_date,
    'end_date', v_leave.end_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_leave_with_impact_tx(uuid, text, date[], uuid[], uuid[], text[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_leave_with_impact_tx(uuid, text, date[], uuid[], uuid[], text[], text[]) FROM anon;
REVOKE ALL ON FUNCTION public.approve_leave_with_impact_tx(uuid, text, date[], uuid[], uuid[], text[], text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.approve_leave_with_impact_tx(uuid, text, date[], uuid[], uuid[], text[], text[]) TO service_role;
