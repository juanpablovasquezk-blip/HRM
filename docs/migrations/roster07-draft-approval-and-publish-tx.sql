-- ROSTER-07: Persistencia de borrador v2, control de aprobación por versión y publicación transaccional
-- NO ejecutar en la base operativa hasta la autorización expresa de habilitar v2 en producción.
-- Requiere haber aplicado previamente docs/migrations/roster07-activation-and-snapshots.sql.

CREATE TABLE IF NOT EXISTS public.roster_v2_drafts (
  id text PRIMARY KEY,
  start_date date NOT NULL,
  end_date date NOT NULL,
  area_id uuid NULL,
  personnel_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  position_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  baseline_range_hash text NOT NULL,
  persisted_range_hash text NOT NULL,
  draft_version_hash text NOT NULL,
  approval_status text NOT NULL DEFAULT 'pending_review'
    CHECK (approval_status IN ('pending_review', 'approved', 'published')),
  approved_version_hash text NULL,
  approved_at timestamptz NULL,
  approved_by text NULL,
  published_at timestamptz NULL,
  snapshot_id text NULL,
  v2_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roster_v2_drafts_range
  ON public.roster_v2_drafts(start_date, end_date, updated_at DESC);

ALTER TABLE public.roster_v2_drafts ENABLE ROW LEVEL SECURITY;

-- Transacción atómica:
-- 1) Bloquea fila de borrador y asignaciones del rango (serializa/invalida frente a concurrencia)
-- 2) Valida aprobación vigente de la versión exacta y hash del calendario
-- 3) Publica ÚNICAMENTE las asignaciones exactas de la versión aprobada (sin parcialidades)
CREATE OR REPLACE FUNCTION public.publish_v2_approved_draft_tx(
  p_draft_id text,
  p_start_date date,
  p_end_date date,
  p_area_id uuid,
  p_expected_range_hash text,
  p_expected_draft_version_hash text,
  p_expected_approved_version_hash text,
  p_now_iso timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draft public.roster_v2_drafts%ROWTYPE;
  v_live_hash text;
  v_published_count integer := 0;
BEGIN
  SELECT * INTO v_draft
  FROM public.roster_v2_drafts
  WHERE id = p_draft_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STALE_APPROVAL: No existe el borrador v2 %.', p_draft_id;
  END IF;

  IF v_draft.approval_status <> 'approved'
     OR v_draft.draft_version_hash <> p_expected_draft_version_hash
     OR v_draft.approved_version_hash IS DISTINCT FROM p_expected_approved_version_hash THEN
    RAISE EXCEPTION 'STALE_APPROVAL: El borrador fue editado o deshecho después de aprobarse; requiere nueva revisión.';
  END IF;

  -- Serializar contra ediciones concurrentes en shift_assignments del rango
  PERFORM 1
  FROM public.shift_assignments
  WHERE date BETWEEN p_start_date AND p_end_date
  FOR UPDATE;

  v_live_hash := public.compute_roster_range_hash(p_start_date, p_end_date);
  IF v_live_hash IS DISTINCT FROM p_expected_range_hash THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION: El calendario del rango cambió antes de confirmar la publicación.';
  END IF;

  WITH approved_items AS (
    SELECT DISTINCT
      (item->>'date')::date AS date,
      (item->>'personnel_id')::uuid AS personnel_id,
      (item->>'area_id')::uuid AS area_id,
      (item->>'position_id')::uuid AS position_id,
      (item->>'shift_id')::uuid AS shift_id
    FROM jsonb_array_elements(COALESCE(v_draft.v2_metrics->'assignments', '[]'::jsonb)) AS item
    WHERE COALESCE((item->>'is_protected')::boolean, false) = false
  )
  UPDATE public.shift_assignments sa
  SET is_published = true,
      is_validated = true,
      updated_at = p_now_iso
  FROM approved_items ai
  WHERE sa.date = ai.date
    AND sa.personnel_id = ai.personnel_id
    AND sa.area_id = ai.area_id
    AND sa.position_id = ai.position_id
    AND sa.shift_id = ai.shift_id
    AND sa.date BETWEEN p_start_date AND p_end_date
    AND sa.status <> 'cancelled'
    AND (p_area_id IS NULL OR sa.area_id = p_area_id)
    AND sa.is_published = false;

  GET DIAGNOSTICS v_published_count = ROW_COUNT;

  UPDATE public.roster_v2_drafts
  SET approval_status = 'published',
      published_at = p_now_iso,
      updated_at = p_now_iso
  WHERE id = p_draft_id;

  RETURN jsonb_build_object(
    'draft_id', p_draft_id,
    'published_count', v_published_count
  );
END;
$$;

-- Restringir ejecución de la función SECURITY DEFINER únicamente al servidor autorizado (service_role)
REVOKE ALL ON FUNCTION public.publish_v2_approved_draft_tx(
  text, date, date, uuid, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_v2_approved_draft_tx(
  text, date, date, uuid, text, text, text, timestamptz
) TO service_role;
