-- ROSTER-07: Respaldo previo al guardado de v2, control de concurrencia y transacción atómica
-- NO ejecutar en la base operativa hasta la aprobación expresa de ROSTER-07.

CREATE TABLE IF NOT EXISTS public.roster_v2_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date date NOT NULL,
  end_date date NOT NULL,
  engine text NOT NULL DEFAULT 'v2' CHECK (engine IN ('v1', 'v2')),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  assignments_backup jsonb NOT NULL DEFAULT '[]'::jsonb,
  requirements_backup jsonb NOT NULL DEFAULT '[]'::jsonb,
  ns22_confirmation jsonb NOT NULL DEFAULT '{}'::jsonb,
  baseline_max_updated_at timestamptz NULL,
  baseline_state_hash text NULL,
  post_save_state_hash text NULL,
  saved_completed_at timestamptz NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  restored_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_roster_v2_snapshots_range
  ON public.roster_v2_snapshots(start_date, end_date, created_at DESC);

ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.shift_requirements
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.compute_roster_range_hash(
  p_start_date date,
  p_end_date date
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT md5(
    COALESCE((
      SELECT string_agg(id::text || ':' || to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), ',' ORDER BY id)
      FROM public.shift_assignments
      WHERE date BETWEEN p_start_date AND p_end_date
    ), '')
    || '|' ||
    COALESCE((
      SELECT string_agg(id::text || ':' || to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), ',' ORDER BY id)
      FROM public.shift_requirements
      WHERE date BETWEEN p_start_date AND p_end_date
    ), '')
  );
$$;

-- Transacción atómica para guardado v2 con detección de ediciones o eliminaciones concurrentes
CREATE OR REPLACE FUNCTION public.save_v2_schedule_tx(
  p_start_date date,
  p_end_date date,
  p_filters jsonb,
  p_ns22_confirmation jsonb,
  p_expected_baseline_at timestamptz,
  p_expected_baseline_hash text,
  p_delete_assignment_ids uuid[],
  p_insert_assignments jsonb,
  p_upsert_extra_requirements jsonb,
  p_delete_requirement_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_snapshot_id uuid;
  v_assignments_backup jsonb;
  v_requirements_backup jsonb;
  v_max_updated_at timestamptz;
  v_current_hash text;
  v_post_save_hash text;
  v_saved_completed_at timestamptz;
  v_item jsonb;
BEGIN
  -- Serializar transacciones concurrentes sobre el guardado/recuperación v2
  PERFORM pg_advisory_xact_lock(hashtext('roster_v2_tx'));

  -- 1. Verificar cambios o eliminaciones concurrentes posteriores al baseline leído por el supervisor
  SELECT GREATEST(
    COALESCE((SELECT MAX(updated_at) FROM public.shift_assignments WHERE date BETWEEN p_start_date AND p_end_date), '-infinity'::timestamptz),
    COALESCE((SELECT MAX(updated_at) FROM public.shift_requirements WHERE date BETWEEN p_start_date AND p_end_date), '-infinity'::timestamptz)
  ) INTO v_max_updated_at;

  v_current_hash := public.compute_roster_range_hash(p_start_date, p_end_date);

  IF (p_expected_baseline_at IS NOT NULL AND v_max_updated_at > p_expected_baseline_at)
     OR (p_expected_baseline_hash IS NOT NULL AND v_current_hash IS DISTINCT FROM p_expected_baseline_hash) THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION: Otro supervisor editó o eliminó registros en el rango %..% después de cargar la vista previa.', p_start_date, p_end_date;
  END IF;

  -- 2. Capturar respaldo completo del rango antes de escribir
  SELECT COALESCE(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
  INTO v_assignments_backup
  FROM public.shift_assignments a
  WHERE a.date BETWEEN p_start_date AND p_end_date;

  SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
  INTO v_requirements_backup
  FROM public.shift_requirements r
  WHERE r.date BETWEEN p_start_date AND p_end_date;

  INSERT INTO public.roster_v2_snapshots (
    start_date, end_date, engine, filters,
    assignments_backup, requirements_backup, ns22_confirmation,
    baseline_max_updated_at, baseline_state_hash
  )
  VALUES (
    p_start_date, p_end_date, 'v2', COALESCE(p_filters, '{}'::jsonb),
    v_assignments_backup, v_requirements_backup, COALESCE(p_ns22_confirmation, '{}'::jsonb),
    NULLIF(v_max_updated_at, '-infinity'::timestamptz), v_current_hash
  )
  RETURNING id INTO v_snapshot_id;

  -- 3. Borrar asignaciones ordinarias reemplazables en alcance
  IF p_delete_assignment_ids IS NOT NULL AND array_length(p_delete_assignment_ids, 1) > 0 THEN
    DELETE FROM public.shift_assignments
    WHERE id = ANY(p_delete_assignment_ids);
  END IF;

  -- 4. Insertar/actualizar asignaciones v2
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_insert_assignments, '[]'::jsonb))
  LOOP
    INSERT INTO public.shift_assignments (
      personnel_id, shift_id, date, area_id, position_id,
      status, is_locked, is_manual, is_confirmed, is_validated, is_published,
      frozen_by_rule, original_shift_id, is_extra, extra_target, linked_requirement_id, updated_at
    )
    VALUES (
      (v_item->>'personnel_id')::uuid,
      (v_item->>'shift_id')::uuid,
      (v_item->>'date')::date,
      (v_item->>'area_id')::uuid,
      (v_item->>'position_id')::uuid,
      COALESCE(v_item->>'status', 'scheduled'),
      COALESCE((v_item->>'is_locked')::boolean, false),
      COALESCE((v_item->>'is_manual')::boolean, false),
      COALESCE((v_item->>'is_confirmed')::boolean, false),
      COALESCE((v_item->>'is_validated')::boolean, false),
      COALESCE((v_item->>'is_published')::boolean, false),
      COALESCE((v_item->>'frozen_by_rule')::boolean, false),
      NULLIF(v_item->>'original_shift_id', '')::uuid,
      COALESCE((v_item->>'is_extra')::boolean, false),
      NULLIF(v_item->>'extra_target', ''),
      NULLIF(v_item->>'linked_requirement_id', '')::uuid,
      now()
    )
    ON CONFLICT (personnel_id, date, shift_id, is_extra) DO UPDATE SET
      area_id = EXCLUDED.area_id,
      position_id = EXCLUDED.position_id,
      status = EXCLUDED.status,
      is_confirmed = EXCLUDED.is_confirmed,
      is_validated = EXCLUDED.is_validated,
      is_published = EXCLUDED.is_published,
      updated_at = now();
  END LOOP;

  -- 5. Reconciliar requerimientos extra vinculados
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_upsert_extra_requirements, '[]'::jsonb))
  LOOP
    INSERT INTO public.shift_requirements (
      date, area_id, position_id, shift_id, is_extra,
      required_count, manual_extra_count, auto_vacancy_count, linked_requirement_id, updated_at
    )
    VALUES (
      (v_item->>'date')::date,
      (v_item->>'area_id')::uuid,
      (v_item->>'position_id')::uuid,
      (v_item->>'shift_id')::uuid,
      true,
      (v_item->>'required_count')::integer,
      COALESCE((v_item->>'manual_count')::integer, 0),
      COALESCE((v_item->>'auto_vacancy_count')::integer, 0),
      NULLIF(v_item->>'linked_requirement_id', '')::uuid,
      now()
    )
    ON CONFLICT (area_id, position_id, shift_id, date, is_extra) DO UPDATE SET
      required_count = EXCLUDED.required_count,
      manual_extra_count = EXCLUDED.manual_extra_count,
      auto_vacancy_count = EXCLUDED.auto_vacancy_count,
      linked_requirement_id = EXCLUDED.linked_requirement_id,
      updated_at = now();
  END LOOP;

  IF p_delete_requirement_ids IS NOT NULL AND array_length(p_delete_requirement_ids, 1) > 0 THEN
    DELETE FROM public.shift_requirements
    WHERE id = ANY(p_delete_requirement_ids) AND is_extra = true;
  END IF;

  v_saved_completed_at := clock_timestamp();
  v_post_save_hash := public.compute_roster_range_hash(p_start_date, p_end_date);
  UPDATE public.roster_v2_snapshots
  SET saved_completed_at = v_saved_completed_at,
      post_save_state_hash = v_post_save_hash
  WHERE id = v_snapshot_id;

  RETURN jsonb_build_object(
    'success', true,
    'snapshot_id', v_snapshot_id,
    'saved_completed_at', v_saved_completed_at,
    'post_save_state_hash', v_post_save_hash
  );
END;
$$;

-- Transacción atómica para recuperación de respaldo sin sobrescribir cambios posteriores de otro supervisor
CREATE OR REPLACE FUNCTION public.recover_v2_snapshot_tx(
  p_snapshot_id uuid,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_snap public.roster_v2_snapshots%ROWTYPE;
  v_current_max timestamptz;
  v_current_hash text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('roster_v2_tx'));

  SELECT * INTO v_snap
  FROM public.roster_v2_snapshots
  WHERE id = p_snapshot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SNAPSHOT_NOT_FOUND: %', p_snapshot_id;
  END IF;

  SELECT GREATEST(
    COALESCE((SELECT MAX(updated_at) FROM public.shift_assignments WHERE date BETWEEN v_snap.start_date AND v_snap.end_date), '-infinity'::timestamptz),
    COALESCE((SELECT MAX(updated_at) FROM public.shift_requirements WHERE date BETWEEN v_snap.start_date AND v_snap.end_date), '-infinity'::timestamptz)
  ) INTO v_current_max;

  v_current_hash := public.compute_roster_range_hash(v_snap.start_date, v_snap.end_date);

  IF NOT p_force AND (
    (v_snap.saved_completed_at IS NOT NULL AND v_current_max > v_snap.saved_completed_at)
    OR (v_snap.post_save_state_hash IS NOT NULL AND v_current_hash IS DISTINCT FROM v_snap.post_save_state_hash)
  ) THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION: Existen ediciones o eliminaciones posteriores realizadas por otro supervisor después del guardado %.', v_snap.saved_completed_at;
  END IF;

  DELETE FROM public.shift_assignments
  WHERE date BETWEEN v_snap.start_date AND v_snap.end_date;

  INSERT INTO public.shift_assignments
  SELECT * FROM jsonb_populate_recordset(NULL::public.shift_assignments, v_snap.assignments_backup);

  DELETE FROM public.shift_requirements
  WHERE date BETWEEN v_snap.start_date AND v_snap.end_date;

  INSERT INTO public.shift_requirements
  SELECT * FROM jsonb_populate_recordset(NULL::public.shift_requirements, v_snap.requirements_backup);

  UPDATE public.roster_v2_snapshots
  SET restored_at = clock_timestamp()
  WHERE id = p_snapshot_id;

  RETURN jsonb_build_object(
    'success', true,
    'snapshot_id', p_snapshot_id
  );
END;
$$;

-- Restringir tabla de snapshots y ejecución de RPC únicamente al rol autorizado de servidor (service_role)
ALTER TABLE public.roster_v2_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public.compute_roster_range_hash(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_roster_range_hash(date, date) TO service_role;

REVOKE ALL ON FUNCTION public.save_v2_schedule_tx(
  date, date, jsonb, jsonb, timestamptz, text, uuid[], jsonb, jsonb, uuid[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_v2_schedule_tx(
  date, date, jsonb, jsonb, timestamptz, text, uuid[], jsonb, jsonb, uuid[]
) TO service_role;

REVOKE ALL ON FUNCTION public.recover_v2_snapshot_tx(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_v2_snapshot_tx(uuid, boolean) TO service_role;
