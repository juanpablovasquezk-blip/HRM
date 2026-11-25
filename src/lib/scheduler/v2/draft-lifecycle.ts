import type {
  CrossAreaAssignment,
  CrossAreaScheduleResult,
  EnginePreviewMetrics,
  PersonnelScheduleProfile,
  RawExistingAssignment,
  RawLeaveRecord,
  V2PreviewAssignment,
} from './types';
import {
  computeRangeStateHash,
  saveV2Schedule,
  type Ns22OperationalConfirmation,
  type PersistedAssignmentRow,
  type PersistedV2DraftRow,
  type RosterPersistenceAdapter,
  type SaveV2ScheduleResult,
} from './save-recover';
import {
  applyV2DraftAdjustment,
  applyV2DraftSwap,
  recomputeV2MetricsFromAssignments,
  type V2DraftAdjustmentInput,
  type V2DraftAdjustmentResult,
} from './preview-draft';

export type V2DraftApprovalStatus = 'pending_review' | 'approved' | 'published';

export interface V2SavedDraftState {
  draft_id: string;
  start_date: string;
  end_date: string;
  area_id: string | null;
  personnel_ids: string[];
  position_ids: string[];
  baseline_range_hash: string;
  persisted_range_hash: string;
  draft_version_hash: string;
  approval_status: V2DraftApprovalStatus;
  approved_version_hash: string | null;
  approved_at: string | null;
  approved_by: string | null;
  published_at: string | null;
  snapshot_id: string | null;
  v2_metrics: EnginePreviewMetrics;
}

export interface V2PublishConfirmationSummary {
  ready: boolean;
  blocked_reason?: string;
  start_date: string;
  end_date: string;
  shifts_to_publish_count: number;
  ordinary_covered: number;
  ordinary_required: number;
  open_vacancies_count: number;
  open_vacancies_by_priority: Record<string, number>;
  reinforcements_count: number;
  draft_version_hash: string;
}

/**
 * Deterministic version hash of the exact draft assignments + range + scope.
 */
export function computeV2DraftVersionHash(params: {
  startDate: string;
  endDate: string;
  areaId?: string | null;
  personnelIds?: string[];
  positionIds?: string[];
  assignments: V2PreviewAssignment[];
}): string {
  const scope = [
    params.startDate,
    params.endDate,
    params.areaId || '',
    [...(params.personnelIds || [])].sort().join(','),
    [...(params.positionIds || [])].sort().join(','),
  ].join('|');

  const rows = [...(params.assignments || [])]
    .map(
      (a) =>
        `${a.date}:${a.personnel_id}:${a.area_id}:${a.position_id}:${a.shift_id}:${a.assignment_kind}:${a.is_extra ? 1 : 0}:${a.is_protected ? 1 : 0}`
    )
    .sort()
    .join(';');

  return `${scope}#${rows}`;
}

/**
 * Step 1: Save the exact preview proposal as an unpublished draft (`is_published: false`).
 * Never publishes shifts and never sends notifications.
 * Rejects with `conflictDetected: true` if underlying DB records changed since preview load.
 */
export async function saveV2PreviewAsDraft(
  adapter: RosterPersistenceAdapter,
  input: {
    startDate: string;
    endDate: string;
    areaId?: string | null;
    personnelIds?: string[];
    positionIds?: string[];
    expectedBaselineHash: string;
    ns22Config: Ns22OperationalConfirmation;
    previewMetrics: EnginePreviewMetrics;
    shiftDurationById?: Map<string, number>;
    nowIso?: string;
  }
): Promise<{
  success: boolean;
  conflictDetected?: boolean;
  error?: string;
  saveResult?: SaveV2ScheduleResult;
  draftState?: V2SavedDraftState;
}> {
  const nowIso = input.nowIso || new Date().toISOString();
  const assignments = input.previewMetrics.assignments || [];

  const toCrossArea = (a: V2PreviewAssignment): CrossAreaAssignment => ({
    date: a.date,
    personnel_id: a.personnel_id,
    shift_id: a.shift_id,
    area_id: a.area_id,
    position_id: a.position_id,
    shift_start: a.shift_start,
    shift_end: a.shift_end,
    duration_hours: input.shiftDurationById?.get(a.shift_id) ?? 8,
    slot_key: `${a.date}|${a.area_id}|${a.position_id}|${a.shift_id}`,
    assignment_kind: a.assignment_kind === 'protected' ? 'ordinary' : a.assignment_kind,
    match_type: a.match_type,
    priority_rank: 0,
    is_extra: false,
    is_locked: Boolean(a.is_protected),
    frozen_by_rule: false,
  });

  const nonProtectedCross = assignments.filter((a) => !a.is_protected).map(toCrossArea);
  const ordinaryCross = nonProtectedCross.filter((a) => a.assignment_kind !== 'reinforcement');
  const reinforcementCross = nonProtectedCross.filter((a) => a.assignment_kind === 'reinforcement');

  const v2Result: CrossAreaScheduleResult = {
    assignments: nonProtectedCross,
    ordinary_assignments: ordinaryCross,
    reinforcements: reinforcementCross,
    coverage: {
      ordinary: {
        total_required: input.previewMetrics.total_required,
        total_covered: input.previewMetrics.total_covered,
        total_vacancies: input.previewMetrics.total_vacancies,
        coverage_percent: input.previewMetrics.coverage_percent,
        by_priority: input.previewMetrics.coverage_by_priority,
        slots: [],
      },
      extra: {
        total_required: 0,
        total_covered: 0,
        total_vacancies: 0,
        coverage_percent: 100,
        by_priority: {},
        slots: [],
      },
      unmatched_protected_ordinary: 0,
      unmatched_protected_extra: 0,
    },
    remaining_vacancies: (input.previewMetrics.vacancies || []).map((v) => ({
      date: v.date,
      area_id: v.area_id,
      position_id: v.position_id,
      shift_id: v.shift_id,
      slot_key: `${v.date}|${v.area_id}|${v.position_id}|${v.shift_id}`,
      priority: v.priority,
      missing_count: Math.max(0, v.vacancy_count ?? (v.required_count - v.covered_count)),
    })) as any[],
    audit_violations: [],
    holiday_warnings: [],
    ns22_result: null,
    permission_cases: [],
    stats: {
      ordinary_assigned: ordinaryCross.length,
      reinforcements_assigned: reinforcementCross.length,
      vacancies_count: input.previewMetrics.total_vacancies,
      runtime_ms: 0,
    } as any,
  };

  const saveResult = await saveV2Schedule(adapter, {
    startDate: input.startDate,
    endDate: input.endDate,
    areaId: input.areaId ?? null,
    personnelIds: input.personnelIds ?? [],
    positionIds: input.positionIds ?? [],
    expectedBaselineHash: input.expectedBaselineHash,
    ns22Config: input.ns22Config,
    v2Result,
    shouldValidate: false,
  });

  if (!saveResult.success) {
    return {
      success: false,
      conflictDetected: saveResult.conflictDetected,
      error: saveResult.error || 'No se pudo guardar el borrador v2.',
      saveResult,
    };
  }

  const afterState = await adapter.loadRangeState(input.startDate, input.endDate);
  const persistedRangeHash = computeRangeStateHash(afterState.assignments, afterState.requirements);
  const draftVersionHash = computeV2DraftVersionHash({
    startDate: input.startDate,
    endDate: input.endDate,
    areaId: input.areaId ?? null,
    personnelIds: input.personnelIds ?? [],
    positionIds: input.positionIds ?? [],
    assignments,
  });

  const draftState: V2SavedDraftState = {
    draft_id: saveResult.snapshotId || `v2-draft-${input.startDate}-${input.endDate}`,
    start_date: input.startDate,
    end_date: input.endDate,
    area_id: input.areaId ?? null,
    personnel_ids: [...(input.personnelIds || [])],
    position_ids: [...(input.positionIds || [])],
    baseline_range_hash: input.expectedBaselineHash,
    persisted_range_hash: persistedRangeHash,
    draft_version_hash: draftVersionHash,
    approval_status: 'pending_review',
    approved_version_hash: null,
    approved_at: null,
    approved_by: null,
    published_at: null,
    snapshot_id: saveResult.snapshotId,
    v2_metrics: input.previewMetrics,
  };

  if (adapter.saveDraftState) {
    await adapter.saveDraftState({
      id: draftState.draft_id,
      start_date: draftState.start_date,
      end_date: draftState.end_date,
      area_id: draftState.area_id,
      personnel_ids: draftState.personnel_ids,
      position_ids: draftState.position_ids,
      baseline_range_hash: draftState.baseline_range_hash,
      persisted_range_hash: draftState.persisted_range_hash,
      draft_version_hash: draftState.draft_version_hash,
      approval_status: draftState.approval_status,
      approved_version_hash: draftState.approved_version_hash,
      approved_at: draftState.approved_at,
      approved_by: draftState.approved_by,
      published_at: draftState.published_at,
      snapshot_id: draftState.snapshot_id,
      v2_metrics: draftState.v2_metrics,
      updated_at: nowIso,
    });
  }

  return {
    success: true,
    saveResult,
    draftState,
  };
}

export async function persistV2DraftState(
  adapter: RosterPersistenceAdapter,
  draftState: V2SavedDraftState,
  nowIso: string = new Date().toISOString()
): Promise<void> {
  if (!adapter.saveDraftState) return;
  await adapter.saveDraftState({
    id: draftState.draft_id,
    start_date: draftState.start_date,
    end_date: draftState.end_date,
    area_id: draftState.area_id,
    personnel_ids: draftState.personnel_ids,
    position_ids: draftState.position_ids,
    baseline_range_hash: draftState.baseline_range_hash,
    persisted_range_hash: draftState.persisted_range_hash,
    draft_version_hash: draftState.draft_version_hash,
    approval_status: draftState.approval_status,
    approved_version_hash: draftState.approved_version_hash,
    approved_at: draftState.approved_at,
    approved_by: draftState.approved_by,
    published_at: draftState.published_at,
    snapshot_id: draftState.snapshot_id,
    v2_metrics: draftState.v2_metrics,
    updated_at: nowIso,
  });
}

/**
 * Step 2A: Reopen a saved draft from persistence (by `draftId` or `V2SavedDraftState`),
 * reconstructing exact assignments & approval state in a new session.
 */
export async function reopenV2SavedDraft(
  adapter: RosterPersistenceAdapter,
  savedDraftOrId: V2SavedDraftState | string,
  catalogLookup: {
    shiftMetaById?: Map<string, { name: string; start_time: string; end_time: string }>;
    areaNameById?: Map<string, string>;
    positionNameById?: Map<string, string>;
  } = {}
): Promise<{
  ok: boolean;
  concurrentChangeDetected: boolean;
  error?: string;
  draftState: V2SavedDraftState;
}> {
  const persistedRow: PersistedV2DraftRow | null =
    typeof savedDraftOrId === 'string'
      ? (adapter.loadDraftState ? await adapter.loadDraftState(savedDraftOrId) : null)
      : (adapter.loadDraftState ? await adapter.loadDraftState(savedDraftOrId.draft_id) : null);

  if (typeof savedDraftOrId === 'string' && !persistedRow) {
    throw new Error(`No se encontró el borrador v2 persistido (${savedDraftOrId}).`);
  }

  const savedDraft: V2SavedDraftState = persistedRow
    ? {
        draft_id: persistedRow.id,
        start_date: persistedRow.start_date,
        end_date: persistedRow.end_date,
        area_id: persistedRow.area_id,
        personnel_ids: persistedRow.personnel_ids || [],
        position_ids: persistedRow.position_ids || [],
        baseline_range_hash: persistedRow.baseline_range_hash,
        persisted_range_hash: persistedRow.persisted_range_hash,
        draft_version_hash: persistedRow.draft_version_hash,
        approval_status: persistedRow.approval_status,
        approved_version_hash: persistedRow.approved_version_hash,
        approved_at: persistedRow.approved_at,
        approved_by: persistedRow.approved_by,
        published_at: persistedRow.published_at,
        snapshot_id: persistedRow.snapshot_id,
        v2_metrics: persistedRow.v2_metrics,
      }
    : (savedDraftOrId as V2SavedDraftState);
  const currentState = await adapter.loadRangeState(savedDraft.start_date, savedDraft.end_date);
  const currentRangeHash = computeRangeStateHash(currentState.assignments, currentState.requirements);
  const concurrentChangeDetected = currentRangeHash !== savedDraft.persisted_range_hash;

  // Map persisted active rows back to V2PreviewAssignment preserving exact saved state
  const existingMeta = new Map<string, V2PreviewAssignment>();
  for (const a of savedDraft.v2_metrics.assignments || []) {
    existingMeta.set(`${a.date}|${a.personnel_id}|${a.shift_id}|${a.area_id}|${a.position_id}`, a);
  }

  const persistedActive = currentState.assignments.filter(
    (a: PersistedAssignmentRow) => a.status !== 'cancelled'
  );

  const reopenedAssignments: V2PreviewAssignment[] = persistedActive.map((row) => {
    const meta = existingMeta.get(
      `${row.date}|${row.personnel_id}|${row.shift_id}|${row.area_id}|${row.position_id}`
    );
    const sMeta = catalogLookup.shiftMetaById?.get(row.shift_id);
    const isProtected = Boolean(row.is_locked || row.frozen_by_rule || row.is_published || row.is_validated);
    return {
      date: String(row.date).split('T')[0],
      personnel_id: row.personnel_id,
      shift_id: row.shift_id,
      shift_name: meta?.shift_name || sMeta?.name || row.shift_id,
      shift_start: meta?.shift_start || sMeta?.start_time || '08:00',
      shift_end: meta?.shift_end || sMeta?.end_time || '16:00',
      area_id: row.area_id,
      area_name: meta?.area_name || catalogLookup.areaNameById?.get(row.area_id) || row.area_id,
      position_id: row.position_id,
      position_name:
        meta?.position_name || catalogLookup.positionNameById?.get(row.position_id) || row.position_id,
      assignment_kind: meta?.assignment_kind || 'ordinary',
      match_type: meta?.match_type || 'primary',
      is_protected: meta?.is_protected ?? isProtected,
      is_extra: Boolean(row.is_extra),
    };
  });

  const nextMetrics = recomputeV2MetricsFromAssignments(savedDraft.v2_metrics, reopenedAssignments);
  const nextVersionHash = computeV2DraftVersionHash({
    startDate: savedDraft.start_date,
    endDate: savedDraft.end_date,
    areaId: savedDraft.area_id,
    personnelIds: savedDraft.personnel_ids,
    positionIds: savedDraft.position_ids,
    assignments: reopenedAssignments,
  });

  const approvalStillValid =
    !concurrentChangeDetected &&
    savedDraft.approval_status === 'approved' &&
    savedDraft.approved_version_hash === nextVersionHash;

  return {
    ok: !concurrentChangeDetected,
    concurrentChangeDetected,
    error: concurrentChangeDetected
      ? 'El calendario persistido cambió fuera de este borrador desde que se guardó; revisa y aprueba nuevamente.'
      : undefined,
    draftState: {
      ...savedDraft,
      persisted_range_hash: currentRangeHash,
      draft_version_hash: nextVersionHash,
      approval_status: approvalStillValid ? 'approved' : 'pending_review',
      approved_version_hash: approvalStillValid ? savedDraft.approved_version_hash : null,
      approved_at: approvalStillValid ? savedDraft.approved_at : null,
      approved_by: approvalStillValid ? savedDraft.approved_by : null,
      v2_metrics: nextMetrics,
    },
  };
}

/**
 * Step 2B & 3: Apply a validated draft adjustment (add/replace/remove) and invalidate prior approval.
 */
export function applyEditToSavedDraft(params: {
  draftState: V2SavedDraftState;
  adjustment: V2DraftAdjustmentInput;
  person: PersonnelScheduleProfile;
  existingOutOfRangeOrProtected?: RawExistingAssignment[];
  approvedLeaves?: RawLeaveRecord[];
  shiftDurationById?: Map<string, number>;
}): { result: V2DraftAdjustmentResult; nextDraftState: V2SavedDraftState } {
  const result = applyV2DraftAdjustment({
    currentV2: params.draftState.v2_metrics,
    adjustment: params.adjustment,
    person: params.person,
    existingOutOfRangeOrProtected: params.existingOutOfRangeOrProtected,
    approvedLeaves: params.approvedLeaves,
    shiftDurationById: params.shiftDurationById,
  });

  if (!result.valid) {
    return { result, nextDraftState: params.draftState };
  }

  return {
    result,
    nextDraftState: updateDraftMetricsAndResetApproval(params.draftState, result.nextV2),
  };
}

/**
 * Step 2C & 3: Apply a validated 2-person swap in the draft and invalidate prior approval.
 */
export function applySwapToSavedDraft(params: {
  draftState: V2SavedDraftState;
  personA: PersonnelScheduleProfile;
  dateA: string;
  personB: PersonnelScheduleProfile;
  dateB: string;
  existingOutOfRangeOrProtected?: RawExistingAssignment[];
  approvedLeaves?: RawLeaveRecord[];
  shiftDurationById?: Map<string, number>;
}): { result: V2DraftAdjustmentResult; nextDraftState: V2SavedDraftState } {
  const result = applyV2DraftSwap({
    currentV2: params.draftState.v2_metrics,
    personA: params.personA,
    dateA: params.dateA,
    personB: params.personB,
    dateB: params.dateB,
    existingOutOfRangeOrProtected: params.existingOutOfRangeOrProtected,
    approvedLeaves: params.approvedLeaves,
    shiftDurationById: params.shiftDurationById,
  });

  if (!result.valid) {
    return { result, nextDraftState: params.draftState };
  }

  return {
    result,
    nextDraftState: updateDraftMetricsAndResetApproval(params.draftState, result.nextV2),
  };
}

/**
 * Invalidates prior approval whenever the draft is edited or undone after approval.
 */
export function updateDraftMetricsAndResetApproval(
  draftState: V2SavedDraftState,
  nextMetrics: EnginePreviewMetrics
): V2SavedDraftState {
  const nextHash = computeV2DraftVersionHash({
    startDate: draftState.start_date,
    endDate: draftState.end_date,
    areaId: draftState.area_id,
    personnelIds: draftState.personnel_ids,
    positionIds: draftState.position_ids,
    assignments: nextMetrics.assignments || [],
  });

  return {
    ...draftState,
    draft_version_hash: nextHash,
    approval_status: 'pending_review',
    approved_version_hash: null,
    approved_at: null,
    approved_by: null,
    v2_metrics: nextMetrics,
  };
}

/**
 * Step 3: Approve the current reviewed draft version.
 */
export function approveV2Draft(
  draftState: V2SavedDraftState,
  approvedBy: string,
  nowIso: string = new Date().toISOString()
): V2SavedDraftState {
  const currentHash = computeV2DraftVersionHash({
    startDate: draftState.start_date,
    endDate: draftState.end_date,
    areaId: draftState.area_id,
    personnelIds: draftState.personnel_ids,
    positionIds: draftState.position_ids,
    assignments: draftState.v2_metrics.assignments || [],
  });

  return {
    ...draftState,
    draft_version_hash: currentHash,
    approval_status: 'approved',
    approved_version_hash: currentHash,
    approved_at: nowIso,
    approved_by: approvedBy,
  };
}

export async function approveV2DraftPersisted(
  adapter: RosterPersistenceAdapter,
  draftState: V2SavedDraftState,
  approvedBy: string,
  nowIso: string = new Date().toISOString()
): Promise<V2SavedDraftState> {
  const approved = approveV2Draft(draftState, approvedBy, nowIso);
  await persistV2DraftState(adapter, approved, nowIso);
  return approved;
}

export async function updateDraftAndPersistReset(
  adapter: RosterPersistenceAdapter,
  draftState: V2SavedDraftState,
  nextMetrics: EnginePreviewMetrics,
  nowIso: string = new Date().toISOString()
): Promise<V2SavedDraftState> {
  const reset = updateDraftMetricsAndResetApproval(draftState, nextMetrics);
  await persistV2DraftState(adapter, reset, nowIso);
  return reset;
}

/**
 * Step 4A: Build explicit confirmation summary before publishing.
 * Blocks publication unless the current draft version is approved.
 */
export function buildV2PublishConfirmationSummary(
  draftState: V2SavedDraftState
): V2PublishConfirmationSummary {
  const currentHash = computeV2DraftVersionHash({
    startDate: draftState.start_date,
    endDate: draftState.end_date,
    areaId: draftState.area_id,
    personnelIds: draftState.personnel_ids,
    positionIds: draftState.position_ids,
    assignments: draftState.v2_metrics.assignments || [],
  });

  const isApprovedCurrent =
    draftState.approval_status === 'approved' &&
    draftState.approved_version_hash === currentHash;

  const openByPrio: Record<string, number> = {};
  for (const v of draftState.v2_metrics.vacancies || []) {
    const miss = Math.max(0, v.vacancy_count ?? (v.required_count - v.covered_count));
    if (miss > 0) {
      openByPrio[v.priority] = (openByPrio[v.priority] || 0) + miss;
    }
  }

  const shiftsToPublishCount = (draftState.v2_metrics.assignments || []).filter(
    (a) => !a.is_protected
  ).length;

  return {
    ready: isApprovedCurrent,
    blocked_reason: isApprovedCurrent
      ? undefined
      : 'El borrador tiene cambios pendientes de revisión y aprobación antes de publicar.',
    start_date: draftState.start_date,
    end_date: draftState.end_date,
    shifts_to_publish_count: shiftsToPublishCount,
    ordinary_covered: draftState.v2_metrics.total_covered,
    ordinary_required: draftState.v2_metrics.total_required,
    open_vacancies_count: draftState.v2_metrics.total_vacancies,
    open_vacancies_by_priority: openByPrio,
    reinforcements_count: (draftState.v2_metrics.assignments || []).filter(
      (a) => a.assignment_kind === 'reinforcement'
    ).length,
    draft_version_hash: currentHash,
  };
}

/**
 * Step 4B: Publish ONLY the current approved draft version, after re-validating that
 * the persisted calendar has not been modified concurrently since the draft was saved.
 */
export async function publishV2ApprovedDraft(
  adapter: RosterPersistenceAdapter,
  draftState: V2SavedDraftState,
  executePublish: (summary: V2PublishConfirmationSummary) => Promise<{
    success: boolean;
    publishedCount?: number;
    error?: string;
  }>,
  nowIso: string = new Date().toISOString()
): Promise<{
  success: boolean;
  conflictDetected?: boolean;
  error?: string;
  publishedCount?: number;
  summary: V2PublishConfirmationSummary;
  nextDraftState?: V2SavedDraftState;
}> {
  const summary = buildV2PublishConfirmationSummary(draftState);
  if (!summary.ready) {
    return {
      success: false,
      error: summary.blocked_reason,
      summary,
    };
  }

  // Revalidate persisted draft state so edits/undos from another open tab block stale approval
  if (adapter.loadDraftState) {
    const persistedDraft = await adapter.loadDraftState(draftState.draft_id);
    if (
      !persistedDraft ||
      persistedDraft.approval_status !== 'approved' ||
      persistedDraft.draft_version_hash !== summary.draft_version_hash ||
      persistedDraft.approved_version_hash !== summary.draft_version_hash
    ) {
      return {
        success: false,
        conflictDetected: true,
        error:
          'STALE_APPROVAL: El borrador fue editado o deshecho en otra sesión/pestaña después de aprobarse; revisa y aprueba la versión vigente antes de publicar.',
        summary: {
          ...summary,
          ready: false,
          blocked_reason: 'Versión aprobada desactualizada.',
        },
      };
    }
  }

  if (adapter.executePublishTx) {
    const txRes = await adapter.executePublishTx({
      draftId: draftState.draft_id,
      startDate: draftState.start_date,
      endDate: draftState.end_date,
      areaId: draftState.area_id,
      expectedPersistedRangeHash: draftState.persisted_range_hash,
      expectedDraftVersionHash: summary.draft_version_hash,
      expectedApprovedVersionHash: summary.draft_version_hash,
      nowIso,
    });
    if (!txRes.success) {
      return {
        success: false,
        conflictDetected: txRes.conflictDetected,
        error: txRes.error || 'Conflicto transaccional al publicar borrador v2.',
        summary: {
          ...summary,
          ready: false,
          blocked_reason: txRes.error,
        },
      };
    }
    return {
      success: true,
      publishedCount: txRes.publishedCount ?? summary.shifts_to_publish_count,
      summary,
      nextDraftState: {
        ...draftState,
        approval_status: 'published',
        published_at: nowIso,
      },
    };
  }

  const runPub = async () => {
    const liveState = await adapter.loadRangeState(draftState.start_date, draftState.end_date);
    const liveHash = computeRangeStateHash(liveState.assignments, liveState.requirements);
    if (liveHash !== draftState.persisted_range_hash) {
      return {
        success: false,
        conflictDetected: true,
        error:
          'CONCURRENT_MODIFICATION: El calendario o las vacantes del rango cambiaron en la base de datos después de guardar/aprobar este borrador. Publicación detenida para evitar publicar una versión desactualizada.',
        summary: {
          ...summary,
          ready: false,
          blocked_reason: 'Conflicto de concurrencia en el rango.',
        },
      };
    }

    const pubRes = await executePublish(summary);
    if (!pubRes.success) {
      return {
        success: false,
        error: pubRes.error || 'Error al publicar los turnos del borrador v2.',
        summary,
      };
    }

    const nextDraftState: V2SavedDraftState = {
      ...draftState,
      approval_status: 'published',
      published_at: nowIso,
    };
    await persistV2DraftState(adapter, nextDraftState, nowIso);

    return {
      success: true,
      publishedCount: pubRes.publishedCount ?? summary.shifts_to_publish_count,
      summary,
      nextDraftState,
    };
  };

  if (adapter.runInTransaction) {
    return adapter.runInTransaction(runPub);
  }
  return runPub();
}
