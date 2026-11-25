import { buildDotacionSlotKey, normalizeIsoDate } from './dotacion';
import { reconcileVacancyExtraRequirements } from './vacantes-diaria';
import type { CrossAreaScheduleResult, ExtraRequirementState } from './types';

export type SchedulerEngineChoice = 'v1' | 'v2';

export interface Ns22TitularConfirmation {
  personnelId: string;
  name?: string;
  anchorStatus: 'confirmed' | 'provisional' | 'unverified';
  confirmedAnchorDate: string | null;
}

export interface Ns22OperationalConfirmation {
  confirmed: boolean;
  scheduleConfirmed: boolean; // Ej. 22:00 - 07:00 verificado
  regimeConfirmed: boolean;   // Ej. 4x4 confirmado
  titulares: Ns22TitularConfirmation[];
}

export interface PersistedAssignmentRow {
  id: string;
  personnel_id: string;
  shift_id: string;
  date: string;
  area_id: string;
  position_id: string;
  status: string;
  is_locked: boolean;
  is_manual: boolean;
  is_confirmed: boolean;
  is_validated: boolean;
  is_published: boolean;
  frozen_by_rule: boolean;
  original_shift_id: string | null;
  is_extra: boolean;
  extra_target?: 'manual' | 'v2_vacancy' | null;
  linked_requirement_id?: string | null;
  attendance_status?: string | null;
  paid_month?: string | null;
  updated_at?: string | null;
}

export interface PersistedRequirementRow {
  id: string;
  date: string;
  area_id: string;
  position_id: string;
  shift_id: string;
  required_count: number;
  is_extra: boolean;
  manual_extra_count?: number;
  auto_vacancy_count?: number;
  linked_requirement_id?: string | null;
  updated_at?: string | null;
}

export interface RosterV2Snapshot {
  id: string;
  startDate: string;
  endDate: string;
  engine: 'v2';
  filters: {
    areaId?: string | null;
    personnelIds?: string[];
    positionIds?: string[];
  };
  assignments: PersistedAssignmentRow[];
  requirements: PersistedRequirementRow[];
  ns22Confirmation: Ns22OperationalConfirmation;
  createdAt: string;
  savedCompletedAt?: string | null;
  postSaveStateHash?: string | null;
  restoredAt: string | null;
}

export interface SaveV2TxParams {
  startDate: string;
  endDate: string;
  filters: {
    areaId?: string | null;
    personnelIds?: string[];
    positionIds?: string[];
  };
  ns22Confirmation: Ns22OperationalConfirmation;
  expectedBaselineAt: string | null;
  expectedBaselineHash: string | null;
  deleteAssignmentIds: string[];
  insertAssignments: Omit<PersistedAssignmentRow, 'id'>[];
  upsertExtraRequirements: ExtraRequirementState[];
  deleteRequirementIds: string[];
}

export interface PersistedV2DraftRow {
  id: string;
  start_date: string;
  end_date: string;
  area_id: string | null;
  personnel_ids: string[];
  position_ids: string[];
  baseline_range_hash: string;
  persisted_range_hash: string;
  draft_version_hash: string;
  approval_status: 'pending_review' | 'approved' | 'published';
  approved_version_hash: string | null;
  approved_at: string | null;
  approved_by: string | null;
  published_at: string | null;
  snapshot_id: string | null;
  v2_metrics: any;
  updated_at: string;
}

export interface PublishV2TxParams {
  draftId: string;
  startDate: string;
  endDate: string;
  areaId?: string | null;
  expectedPersistedRangeHash: string;
  expectedDraftVersionHash: string;
  expectedApprovedVersionHash: string;
  nowIso: string;
}

export interface RosterPersistenceAdapter {
  loadRangeState(
    startDate: string,
    endDate: string
  ): Promise<{
    assignments: PersistedAssignmentRow[];
    requirements: PersistedRequirementRow[];
  }>;
  saveSnapshot(snapshot: Omit<RosterV2Snapshot, 'id'>): Promise<{ snapshotId: string }>;
  loadSnapshot(snapshotId: string): Promise<RosterV2Snapshot | null>;
  markSnapshotSavedCompleted?(
    snapshotId: string,
    savedCompletedAt: string,
    postSaveStateHash?: string | null
  ): Promise<void>;
  markSnapshotRestored(snapshotId: string, restoredAt: string): Promise<void>;
  deleteAssignmentsByIds(ids: string[]): Promise<void>;
  upsertAssignments(rows: Omit<PersistedAssignmentRow, 'id'>[]): Promise<void>;
  upsertExtraRequirements(rows: ExtraRequirementState[]): Promise<void>;
  deleteRequirementsByIds(ids: string[]): Promise<void>;
  restoreRangeState(
    startDate: string,
    endDate: string,
    assignments: PersistedAssignmentRow[],
    requirements: PersistedRequirementRow[]
  ): Promise<void>;
  runInTransaction?<T>(fn: () => Promise<T>): Promise<T>;
  executeSaveTx?(params: SaveV2TxParams): Promise<{
    snapshotId: string;
    savedCompletedAt: string | null;
    postSaveStateHash: string | null;
  }>;
  executeRecoverTx?(
    snapshotId: string,
    force?: boolean
  ): Promise<{
    snapshotId: string;
    restoredAssignmentsCount?: number;
    restoredRequirementsCount?: number;
  }>;
  saveDraftState?(draft: PersistedV2DraftRow): Promise<void>;
  loadDraftState?(draftId: string): Promise<PersistedV2DraftRow | null>;
  executePublishTx?(params: PublishV2TxParams): Promise<{
    success: boolean;
    conflictDetected?: boolean;
    publishedCount?: number;
    error?: string;
  }>;
}

export interface SaveV2ScheduleInput {
  startDate: string;
  endDate: string;
  areaId?: string | null;
  personnelIds?: string[];
  positionIds?: string[];
  ns22Config: Ns22OperationalConfirmation;
  v2Result: CrossAreaScheduleResult;
  shouldValidate?: boolean;
  expectedBaselineAt?: string | null;
  expectedBaselineHash?: string | null;
}

export interface SaveV2ScheduleResult {
  success: boolean;
  rolledBack: boolean;
  conflictDetected?: boolean;
  snapshotId: string | null;
  error?: string;
  unconfirmedReasons?: string[];
  deletedCount: number;
  insertedCount: number;
  preservedProtectedCount: number;
  preservedExtraCount: number;
  preservedOutOfScopeCount: number;
  vacancyExtraUpserts: number;
  vacancyExtraDeletes: number;
}

export interface RecoverSnapshotResult {
  success: boolean;
  conflictDetected?: boolean;
  snapshotId: string;
  error?: string;
  restoredAssignmentsCount: number;
  restoredRequirementsCount: number;
}

/**
 * Mantiene `v1` como motor predeterminado hasta que se apruebe explícitamente el cambio.
 */
export function getAuthorizedV2PublishUserId(): string | null {
  const configured = process.env.ROSTER_V2_PUBLISH_USER_ID?.trim();
  return configured ? configured : null;
}

export function isAuthorizedV2Publisher(auth: {
  ok: boolean;
  userId?: string | null;
  role?: string | null;
}): { ok: boolean; error?: string } {
  if (!auth.ok || !auth.userId) {
    return { ok: false, error: 'Usuario no autenticado para publicar borrador v2.' };
  }
  const normalizedRole = String(auth.role || '').toUpperCase().trim();
  if (normalizedRole !== 'ADMIN') {
    return {
      ok: false,
      error: 'Solo un administrador autorizado (rol ADMIN) puede publicar el borrador v2.',
    };
  }
  const allowedUserId = getAuthorizedV2PublishUserId();
  if (!allowedUserId) {
    return {
      ok: false,
      error: 'Publicación v2 bloqueada: falta configurar ROSTER_V2_PUBLISH_USER_ID en el servidor.',
    };
  }
  if (auth.userId !== allowedUserId) {
    return {
      ok: false,
      error: 'Cuenta ADMIN no autorizada para publicar el borrador v2 desde HRM.',
    };
  }
  return { ok: true };
}

export function getDefaultSchedulerEngine(): SchedulerEngineChoice {
  return process.env.ROSTER_V2_DEFAULT_ENABLED === 'true' ? 'v2' : 'v1';
}

export function isV2SaveEnabled(): boolean {
  return process.env.ROSTER_V2_SAVE_ENABLED === 'true';
}

export function isProtectedPersistedAssignment(row: PersistedAssignmentRow): boolean {
  return Boolean(
    row.is_locked ||
      row.is_confirmed ||
      row.is_validated ||
      row.is_published ||
      row.is_manual ||
      row.frozen_by_rule ||
      row.status !== 'scheduled'
  );
}

/**
 * Verifica que el ciclo operativo NS22 (horario y anclas de los titulares) esté confirmado
 * antes de permitir el guardado operativo con `v2`.
 * Separa esta confirmación de la exención de cuota de domingos libres (`regimeConfirmed`):
 * si `regimeConfirmed` sigue pendiente (`false`), el guardado se permite aplicando las
 * validaciones vigentes de domingos libres.
 */
export function validateNs22OperationalConfig(config?: Ns22OperationalConfirmation | null): {
  ok: boolean;
  unconfirmedReasons: string[];
  sundayExemptionPending?: boolean;
} {
  const reasons: string[] = [];
  if (!config || !config.confirmed) {
    reasons.push('La configuración operativa de NS22 aún no cuenta con confirmación explícita.');
  }
  if (!config?.scheduleConfirmed) {
    reasons.push('Falta confirmar el horario operativo de Aeropuerto NS22 (ej. 22:00-07:00).');
  }
  const titulares = config?.titulares || [];
  if (titulares.length < 2) {
    reasons.push('Se requieren al menos 2 titulares NS22 con ancla confirmada.');
  }
  for (const t of titulares) {
    if (t.anchorStatus !== 'confirmed' || !t.confirmedAnchorDate) {
      reasons.push(
        `El titular NS22 ${t.name || t.personnelId} tiene ancla ${t.anchorStatus} sin fecha confirmada.`
      );
    }
  }
  return {
    ok: reasons.length === 0,
    unconfirmedReasons: reasons,
    sundayExemptionPending: !config?.regimeConfirmed,
  };
}

function assignmentMatchesScope(
  row: PersistedAssignmentRow,
  startDate: string,
  endDate: string,
  areaId?: string | null,
  personnelIds?: string[],
  positionIds?: string[]
): boolean {
  if (row.date < startDate || row.date > endDate) return false;
  if (areaId && areaId !== 'all' && row.area_id !== areaId) return false;
  if (personnelIds && personnelIds.length > 0 && !personnelIds.includes(row.personnel_id)) {
    return false;
  }
  if (positionIds && positionIds.length > 0 && !positionIds.includes(row.position_id)) {
    return false;
  }
  return true;
}

export function computeRangeStateHash(
  assignments: PersistedAssignmentRow[],
  requirements: PersistedRequirementRow[]
): string {
  const aPart = [...assignments]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((a) => `${a.id}:${a.updated_at || ''}`)
    .join(',');
  const rPart = [...requirements]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => `${r.id}:${r.updated_at || ''}`)
    .join(',');
  return `${aPart}|${rPart}`;
}

function getMaxUpdatedAt(
  assignments: PersistedAssignmentRow[],
  requirements: PersistedRequirementRow[]
): string | null {
  let maxTs: string | null = null;
  for (const a of assignments) {
    if (a.updated_at && (!maxTs || a.updated_at > maxTs)) maxTs = a.updated_at;
  }
  for (const r of requirements) {
    if (r.updated_at && (!maxTs || r.updated_at > maxTs)) maxTs = r.updated_at;
  }
  return maxTs;
}

/**
 * Guarda la propuesta de `v2` sobre el rango y filtros elegidos:
 * - Exige configuración NS22 confirmada.
 * - Crea un respaldo previo (snapshot) antes de escribir.
 * - Conserva turnos protegidos, extras manuales y asignaciones fuera del alcance.
 * - Reconcilia pendientes vinculados en Dotación Extra sin duplicar al repetir.
 * - Si ocurre cualquier error durante la escritura, revierte al respaldo previo.
 */
export async function saveV2Schedule(
  adapter: RosterPersistenceAdapter,
  input: SaveV2ScheduleInput
): Promise<SaveV2ScheduleResult> {
  const gate = validateNs22OperationalConfig(input.ns22Config);
  if (!gate.ok) {
    return {
      success: false,
      rolledBack: false,
      snapshotId: null,
      error: `Guardado operativo v2 bloqueado: ${gate.unconfirmedReasons.join(' ')}`,
      unconfirmedReasons: gate.unconfirmedReasons,
      deletedCount: 0,
      insertedCount: 0,
      preservedProtectedCount: 0,
      preservedExtraCount: 0,
      preservedOutOfScopeCount: 0,
      vacancyExtraUpserts: 0,
      vacancyExtraDeletes: 0,
    };
  }

  const beforeState = await adapter.loadRangeState(input.startDate, input.endDate);
  const currentMaxUpdatedAt = getMaxUpdatedAt(beforeState.assignments, beforeState.requirements);
  const currentStateHash = computeRangeStateHash(beforeState.assignments, beforeState.requirements);
  if (
    (input.expectedBaselineAt && currentMaxUpdatedAt && currentMaxUpdatedAt > input.expectedBaselineAt) ||
    (input.expectedBaselineHash && currentStateHash !== input.expectedBaselineHash)
  ) {
    return {
      success: false,
      rolledBack: false,
      conflictDetected: true,
      snapshotId: null,
      error:
        'CONCURRENT_MODIFICATION: Otro supervisor editó o eliminó registros en este rango después de cargar la vista previa; no se sobrescribieron sus cambios.',
      deletedCount: 0,
      insertedCount: 0,
      preservedProtectedCount: 0,
      preservedExtraCount: 0,
      preservedOutOfScopeCount: 0,
      vacancyExtraUpserts: 0,
      vacancyExtraDeletes: 0,
    };
  }

  let snapshotId: string | null = null;
  if (!adapter.executeSaveTx) {
    const savedSnap = await adapter.saveSnapshot({
      startDate: input.startDate,
      endDate: input.endDate,
      engine: 'v2',
      filters: {
        areaId: input.areaId ?? null,
        personnelIds: input.personnelIds ?? [],
        positionIds: input.positionIds ?? [],
      },
      assignments: beforeState.assignments.map((a) => ({ ...a })),
      requirements: beforeState.requirements.map((r) => ({ ...r })),
      ns22Confirmation: input.ns22Config,
      createdAt: new Date().toISOString(),
      restoredAt: null,
    });
    snapshotId = savedSnap.snapshotId;
  }

  const replaceableIds: string[] = [];
  let preservedProtectedCount = 0;
  let preservedExtraCount = 0;
  let preservedOutOfScopeCount = 0;
  const preservedOrdinaryKeys = new Set<string>();

  for (const row of beforeState.assignments) {
    if (row.is_extra) {
      preservedExtraCount++;
      continue;
    }
    const inScope = assignmentMatchesScope(
      row,
      input.startDate,
      input.endDate,
      input.areaId,
      input.personnelIds,
      input.positionIds
    );
    if (!inScope) {
      preservedOutOfScopeCount++;
      preservedOrdinaryKeys.add(`${row.personnel_id}|${row.date}|${row.shift_id}|false`);
      continue;
    }
    if (isProtectedPersistedAssignment(row)) {
      preservedProtectedCount++;
      preservedOrdinaryKeys.add(`${row.personnel_id}|${row.date}|${row.shift_id}|false`);
      continue;
    }
    replaceableIds.push(row.id);
  }

  const seenNew = new Set<string>();
  const shouldValidate = Boolean(input.shouldValidate);
  const toInsert: Omit<PersistedAssignmentRow, 'id'>[] = [];
  for (const prop of input.v2Result.assignments) {
    const normDate = normalizeIsoDate(prop.date);
    if (normDate < input.startDate || normDate > input.endDate) continue;
    const key = `${prop.personnel_id}|${normDate}|${prop.shift_id}|false`;
    if (preservedOrdinaryKeys.has(key) || seenNew.has(key)) continue;
    seenNew.add(key);
    toInsert.push({
      personnel_id: prop.personnel_id,
      shift_id: prop.shift_id,
      date: normDate,
      area_id: prop.area_id,
      position_id: prop.position_id,
      status: 'scheduled',
      is_locked: false,
      is_manual: false,
      is_confirmed: shouldValidate,
      is_validated: shouldValidate,
      is_published: shouldValidate,
      frozen_by_rule: false,
      original_shift_id: prop.shift_id,
      is_extra: false,
      extra_target: null,
      linked_requirement_id: null,
    });
  }

  const existingExtraReqs = beforeState.requirements
    .filter((r) => r.is_extra)
    .map((r) => ({
      id: r.id,
      date: r.date,
      area_id: r.area_id,
      position_id: r.position_id,
      shift_id: r.shift_id,
      required_count: r.required_count,
      is_extra: true as const,
      manual_count: r.manual_extra_count,
      auto_vacancy_count: r.auto_vacancy_count,
      linked_requirement_id: r.linked_requirement_id ?? null,
    }));

  const reconciled = reconcileVacancyExtraRequirements({
    v2Result: input.v2Result,
    existingExtraRequirements: existingExtraReqs,
    rangeStart: input.startDate,
    rangeEnd: input.endDate,
    areaFilter: input.areaId && input.areaId !== 'all' ? input.areaId : null,
    positionFilter: input.positionIds && input.positionIds.length > 0 ? input.positionIds : null,
  });

  const ordinaryReqIdBySlotKey = new Map<string, string>();
  for (const r of beforeState.requirements) {
    if (r.is_extra) continue;
    const slotKey = buildDotacionSlotKey({
      date: normalizeIsoDate(r.date),
      area_id: r.area_id,
      position_id: r.position_id,
      shift_id: r.shift_id,
    });
    ordinaryReqIdBySlotKey.set(slotKey, r.id);
  }
  const enrichedUpserts: ExtraRequirementState[] = reconciled.upserts.map((u) => ({
    ...u,
    linked_requirement_id: u.linked_requirement_id ?? ordinaryReqIdBySlotKey.get(u.slot_key) ?? null,
  }));

  const deleteSlotSet = new Set(reconciled.deleted_slot_keys);
  const deleteIds = existingExtraReqs
    .filter((r) => {
      if (!r.id) return false;
      const slotKey = buildDotacionSlotKey({
        date: r.date,
        area_id: r.area_id,
        position_id: r.position_id,
        shift_id: r.shift_id,
      });
      return deleteSlotSet.has(slotKey);
    })
    .map((r) => r.id as string);

  if (adapter.executeSaveTx) {
    try {
      const txRes = await adapter.executeSaveTx({
        startDate: input.startDate,
        endDate: input.endDate,
        filters: {
          areaId: input.areaId ?? null,
          personnelIds: input.personnelIds ?? [],
          positionIds: input.positionIds ?? [],
        },
        ns22Confirmation: input.ns22Config,
        expectedBaselineAt: input.expectedBaselineAt ?? null,
        expectedBaselineHash: input.expectedBaselineHash ?? null,
        deleteAssignmentIds: replaceableIds,
        insertAssignments: toInsert,
        upsertExtraRequirements: enrichedUpserts,
        deleteRequirementIds: deleteIds,
      });
      return {
        success: true,
        rolledBack: false,
        snapshotId: txRes.snapshotId,
        deletedCount: replaceableIds.length,
        insertedCount: toInsert.length,
        preservedProtectedCount,
        preservedExtraCount,
        preservedOutOfScopeCount,
        vacancyExtraUpserts: reconciled.upserts.length,
        vacancyExtraDeletes: deleteIds.length,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error en transacción save_v2_schedule_tx';
      const isConflict = message.includes('CONCURRENT_MODIFICATION');
      return {
        success: false,
        rolledBack: !isConflict,
        conflictDetected: isConflict,
        snapshotId: null,
        error: message,
        deletedCount: 0,
        insertedCount: 0,
        preservedProtectedCount,
        preservedExtraCount,
        preservedOutOfScopeCount,
        vacancyExtraUpserts: 0,
        vacancyExtraDeletes: 0,
      };
    }
  }

  const runWrites = async () => {
    if (replaceableIds.length > 0) {
      await adapter.deleteAssignmentsByIds(replaceableIds);
    }
    if (toInsert.length > 0) {
      await adapter.upsertAssignments(toInsert);
    }
    if (enrichedUpserts.length > 0) {
      await adapter.upsertExtraRequirements(enrichedUpserts);
    }
    if (deleteIds.length > 0) {
      await adapter.deleteRequirementsByIds(deleteIds);
    }
    if (adapter.markSnapshotSavedCompleted && snapshotId) {
      const postState = await adapter.loadRangeState(input.startDate, input.endDate);
      const postHash = computeRangeStateHash(postState.assignments, postState.requirements);
      await adapter.markSnapshotSavedCompleted(snapshotId, new Date().toISOString(), postHash);
    }
  };

  try {
    if (adapter.runInTransaction) {
      await adapter.runInTransaction(runWrites);
    } else {
      await runWrites();
    }

    return {
      success: true,
      rolledBack: false,
      snapshotId,
      deletedCount: replaceableIds.length,
      insertedCount: toInsert.length,
      preservedProtectedCount,
      preservedExtraCount,
      preservedOutOfScopeCount,
      vacancyExtraUpserts: reconciled.upserts.length,
      vacancyExtraDeletes: deleteIds.length,
    };
  } catch (err) {
    await adapter.restoreRangeState(
      input.startDate,
      input.endDate,
      beforeState.assignments,
      beforeState.requirements
    );
    return {
      success: false,
      rolledBack: true,
      snapshotId,
      error: err instanceof Error ? err.message : 'Error guardando roster v2; se restauró el respaldo previo.',
      deletedCount: 0,
      insertedCount: 0,
      preservedProtectedCount,
      preservedExtraCount,
      preservedOutOfScopeCount,
      vacancyExtraUpserts: 0,
      vacancyExtraDeletes: 0,
    };
  }
}

/**
 * Recupera el roster previo guardado en un snapshot antes de ejecutar `v2`.
 * Protege ediciones o eliminaciones posteriores realizados por otro supervisor tras el guardado.
 */
export async function recoverRosterFromSnapshot(
  adapter: RosterPersistenceAdapter,
  snapshotId: string,
  options?: { force?: boolean }
): Promise<RecoverSnapshotResult> {
  if (adapter.executeRecoverTx) {
    try {
      const txRes = await adapter.executeRecoverTx(snapshotId, options?.force);
      return {
        success: true,
        snapshotId: txRes.snapshotId,
        restoredAssignmentsCount: txRes.restoredAssignmentsCount ?? 0,
        restoredRequirementsCount: txRes.restoredRequirementsCount ?? 0,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error en transacción recover_v2_snapshot_tx';
      const isConflict = message.includes('CONCURRENT_MODIFICATION');
      return {
        success: false,
        conflictDetected: isConflict,
        snapshotId,
        error: message,
        restoredAssignmentsCount: 0,
        restoredRequirementsCount: 0,
      };
    }
  }

  const snapshot = await adapter.loadSnapshot(snapshotId);
  if (!snapshot) {
    return {
      success: false,
      snapshotId,
      error: `No se encontró el respaldo ${snapshotId}.`,
      restoredAssignmentsCount: 0,
      restoredRequirementsCount: 0,
    };
  }

  if (!options?.force && (snapshot.savedCompletedAt || snapshot.postSaveStateHash)) {
    const currentState = await adapter.loadRangeState(snapshot.startDate, snapshot.endDate);
    const currentMax = getMaxUpdatedAt(currentState.assignments, currentState.requirements);
    const currentHash = computeRangeStateHash(currentState.assignments, currentState.requirements);
    if (
      (snapshot.savedCompletedAt && currentMax && currentMax > snapshot.savedCompletedAt) ||
      (snapshot.postSaveStateHash && currentHash !== snapshot.postSaveStateHash)
    ) {
      return {
        success: false,
        conflictDetected: true,
        snapshotId,
        error:
          'CONCURRENT_MODIFICATION: Existen ediciones o eliminaciones posteriores realizadas por otro supervisor después del guardado; recuperación cancelada para no sobrescribirlos.',
        restoredAssignmentsCount: 0,
        restoredRequirementsCount: 0,
      };
    }
  }

  const runRestore = async () => {
    await adapter.restoreRangeState(
      snapshot.startDate,
      snapshot.endDate,
      snapshot.assignments,
      snapshot.requirements
    );
    await adapter.markSnapshotRestored(snapshotId, new Date().toISOString());
  };

  if (adapter.runInTransaction) {
    await adapter.runInTransaction(runRestore);
  } else {
    await runRestore();
  }

  return {
    success: true,
    snapshotId,
    restoredAssignmentsCount: snapshot.assignments.length,
    restoredRequirementsCount: snapshot.requirements.length,
  };
}
