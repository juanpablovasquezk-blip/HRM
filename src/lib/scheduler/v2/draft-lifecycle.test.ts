import test from 'node:test';
import assert from 'node:assert/strict';
import { compareEnginesPreview, buildV2DailyPlanningRows } from './preview-compare';
import { applyV2DraftAdjustment, applyV2DraftSwap, resolveV2GridCellClick } from './preview-draft';
import {
  approveV2Draft,
  approveV2DraftPersisted,
  applyEditToSavedDraft,
  applySwapToSavedDraft,
  buildV2PublishConfirmationSummary,
  publishV2ApprovedDraft,
  reopenV2SavedDraft,
  saveV2PreviewAsDraft,
  updateDraftAndPersistReset,
  updateDraftMetricsAndResetApproval,
} from './draft-lifecycle';
import {
  buildNs22ConfirmationFromDbData,
  computeRangeStateHash,
  isAuthorizedV2Publisher,
  isV2SaveEnabled,
  type Ns22OperationalConfirmation,
  type PersistedAssignmentRow,
  type PersistedRequirementRow,
  type PersistedV2DraftRow,
  type RosterPersistenceAdapter,
  type RosterV2Snapshot,
} from './save-recover';
import type {
  PersonnelScheduleProfile,
  RawExistingAssignment,
  RawShiftRequirement,
} from './types';

function createIsolatedMemoryAdapter(initial: {
  assignments: PersistedAssignmentRow[];
  requirements: PersistedRequirementRow[];
}): RosterPersistenceAdapter & { state: { assignments: PersistedAssignmentRow[]; requirements: PersistedRequirementRow[] } } {
  const state = {
    assignments: initial.assignments.map((a) => ({ ...a })),
    requirements: initial.requirements.map((r) => ({ ...r })),
    snapshots: new Map<string, RosterV2Snapshot>(),
    drafts: new Map<string, PersistedV2DraftRow>(),
    extras: new Map<string, any>(),
    notificationsSent: 0,
  };

  return {
    state: state as any,
    async loadRangeState(startDate, endDate) {
      return {
        assignments: state.assignments.filter((a) => a.date >= startDate && a.date <= endDate),
        requirements: state.requirements.filter((r) => r.date >= startDate && r.date <= endDate),
      };
    },
    async saveSnapshot(snapshot) {
      const id = `snap-${state.snapshots.size + 1}`;
      state.snapshots.set(id, { ...snapshot, id });
      return { snapshotId: id };
    },
    async loadSnapshot(id) {
      return state.snapshots.get(id) || null;
    },
    async markSnapshotRestored(id, restoredAt) {
      const snap = state.snapshots.get(id);
      if (snap) snap.restoredAt = restoredAt;
    },
    async deleteAssignmentsByIds(ids) {
      const idSet = new Set(ids);
      state.assignments = state.assignments.filter((a) => !idSet.has(a.id));
    },
    async upsertAssignments(rows) {
      for (const r of rows) {
        state.assignments.push({ ...r, id: `asgn-${state.assignments.length + 1}` });
      }
    },
    async upsertExtraRequirements() {
      // no-op in isolated test
    },
    async deleteRequirementsByIds(ids) {
      const idSet = new Set(ids);
      state.requirements = state.requirements.filter((r) => !idSet.has(r.id));
    },
    async restoreRangeState(startDate, endDate, assignments, requirements) {
      state.assignments = [
        ...state.assignments.filter((a) => a.date < startDate || a.date > endDate),
        ...assignments.map((a) => ({ ...a })),
      ];
      state.requirements = [
        ...state.requirements.filter((r) => r.date < startDate || r.date > endDate),
        ...requirements.map((r) => ({ ...r })),
      ];
    },
    async saveDraftState(draft) {
      state.drafts.set(draft.id, { ...draft });
    },
    async loadDraftState(draftId) {
      const d = state.drafts.get(draftId);
      return d ? { ...d } : null;
    },
    async executePublishTx(params) {
      // Atomic validation inside single transaction
      const draft = state.drafts.get(params.draftId);
      if (
        !draft ||
        draft.approval_status !== 'approved' ||
        draft.draft_version_hash !== params.expectedDraftVersionHash ||
        draft.approved_version_hash !== params.expectedApprovedVersionHash
      ) {
        return {
          success: false,
          conflictDetected: true,
          error: 'STALE_APPROVAL: La versión aprobada ya no está vigente en BD.',
        };
      }
      const rangeAsgns = state.assignments.filter(
        (a) => a.date >= params.startDate && a.date <= params.endDate
      );
      const rangeReqs = state.requirements.filter(
        (r) => r.date >= params.startDate && r.date <= params.endDate
      );
      const liveHash = computeRangeStateHash(rangeAsgns, rangeReqs);
      if (liveHash !== params.expectedPersistedRangeHash) {
        return {
          success: false,
          conflictDetected: true,
          error: 'CONCURRENT_MODIFICATION: El calendario cambió entre confirmación y escritura.',
        };
      }
      let publishedCount = 0;
      for (const a of state.assignments) {
        if (a.date >= params.startDate && a.date <= params.endDate && a.status !== 'cancelled' && !a.is_published) {
          a.is_published = true;
          a.is_validated = true;
          publishedCount++;
        }
      }
      draft.approval_status = 'published';
      draft.published_at = params.nowIso;
      return { success: true, publishedCount };
    },
  };
}

test('Ciclo completo borrador v2 (2026-12-07..2027-01-03 sin Carlos Tobar): guardar, reabrir, editar/intercambiar/deshacer, aprobar, invalidar y publicar con concurrencia', async () => {
  const opA: PersonnelScheduleProfile = {
    personnel_id: 'op-a',
    full_name: 'Operador Alfa',
    birth_date: '1990-02-10',
    main_position: 'pos-dhl',
    area_id: 'area-bod',
    rotation_pattern: '5X2',
  };
  const opB: PersonnelScheduleProfile = {
    personnel_id: 'op-b',
    full_name: 'Operador Beta',
    birth_date: '1991-04-12',
    main_position: 'pos-dhl',
    area_id: 'area-bod',
    rotation_pattern: '5X2',
  };
  const carlos: PersonnelScheduleProfile = {
    personnel_id: 'carlos-tobar',
    full_name: 'Carlos Christian Tobar',
    birth_date: '1980-01-05',
    main_position: 'pos-sup',
    area_id: 'area-base',
    rotation_pattern: '5X2',
  };

  // Rango 2026-12-07..2027-01-03 con Carlos excluido del conjunto de candidatos
  const reqs: RawShiftRequirement[] = [
    {
      id: 'req-dec08-dhl',
      date: '2026-12-08',
      area_id: 'area-bod',
      position_id: 'pos-dhl',
      shift_id: 'sh-am05',
      required_count: 1,
      priority: 'CRITICAL',
      shift: { name: 'AM 05', start_time: '05:00', end_time: '14:00', duration_hours: 8 },
    },
    {
      id: 'req-dec09-dhl',
      date: '2026-12-09',
      area_id: 'area-bod',
      position_id: 'pos-dhl',
      shift_id: 'sh-am08',
      required_count: 1,
      priority: 'HIGH',
      shift: { name: 'AM 08', start_time: '08:00', end_time: '17:00', duration_hours: 8 },
    },
    {
      id: 'req-dec15-dhl',
      date: '2026-12-15',
      area_id: 'area-bod',
      position_id: 'pos-dhl',
      shift_id: 'sh-am04',
      required_count: 1,
      priority: 'NORMAL',
      shift: { name: 'AM 04', start_time: '04:00', end_time: '13:00', duration_hours: 8 },
    },
  ];

  // Turno protegido existente el 2026-12-14 AM 11 (termina 20:00) para opB -> bloquea AM 04 el 15-12 (<12h descanso)
  const existingProtected: RawExistingAssignment[] = [
    {
      date: '2026-12-14',
      personnel_id: 'op-b',
      area_id: 'area-bod',
      position_id: 'pos-dhl',
      shift_id: 'sh-am11',
      status: 'CONFIRMED',
      is_locked: true,
      is_extra: false,
      shift_start: '11:00',
      shift_end: '20:00',
      duration_hours: 8,
    },
  ];

  const preview = compareEnginesPreview({
    startDate: '2026-12-07',
    endDate: '2027-01-03',
    rawRequirements: reqs,
    existingAssignments: existingProtected,
    personnel: [opA, opB], // Carlos Tobar excluido
    approvedLeaves: [],
    areaNameById: new Map([['area-bod', 'Bodegas'], ['area-base', 'Base Minerquim']]),
    positionNameById: new Map([['pos-dhl', 'Operador DHL'], ['pos-sup', 'Supervisor Base']]),
    referenceDate: new Date('2026-12-01T12:00:00Z'),
  });

  // Carlos Tobar recibe 0 asignaciones nuevas
  assert.equal(
    (preview.v2.assignments || []).filter((a) => a.personnel_id === carlos.personnel_id).length,
    0
  );

  const initialPersistedAssignments: PersistedAssignmentRow[] = [
    {
      id: 'prot-14',
      date: '2026-12-14',
      personnel_id: 'op-b',
      area_id: 'area-bod',
      position_id: 'pos-dhl',
      shift_id: 'sh-am11',
      status: 'confirmed',
      is_locked: true,
      frozen_by_rule: false,
      is_extra: false,
      is_manual: true,
      is_confirmed: true,
      original_shift_id: null,
      is_published: false,
      is_validated: false,
      updated_at: '2026-12-01T10:00:00Z',
    },
  ];
  const persistedReqs: PersistedRequirementRow[] = reqs.map((r) => ({
    id: r.id,
    date: r.date,
    area_id: r.area_id,
    position_id: r.position_id,
    shift_id: r.shift_id,
    required_count: r.required_count,
    is_extra: false,
    updated_at: '2026-12-01T10:00:00Z',
  }));

  const adapter = createIsolatedMemoryAdapter({
    assignments: initialPersistedAssignments,
    requirements: persistedReqs,
  });
  const baselineHash = computeRangeStateHash(initialPersistedAssignments, persistedReqs);
  const ns22Conf: Ns22OperationalConfirmation = {
    confirmed: true,
    scheduleConfirmed: true,
    regimeConfirmed: true,
    titulares: [
      { personnelId: 'marcelo-jara', anchorStatus: 'confirmed', confirmedAnchorDate: '2026-01-04' },
      { personnelId: 'javier-lopez', anchorStatus: 'confirmed', confirmedAnchorDate: '2026-01-08' },
    ],
  };

  // 1. Guardar propuesta como borrador (nunca publica ni notifica)
  const savedRes = await saveV2PreviewAsDraft(adapter, {
    startDate: '2026-12-07',
    endDate: '2027-01-03',
    personnelIds: ['op-a', 'op-b'],
    expectedBaselineHash: baselineHash,
    ns22Config: ns22Conf,
    previewMetrics: preview.v2,
  });
  assert.equal(savedRes.success, true);
  assert.ok(savedRes.draftState);
  assert.equal(savedRes.draftState.approval_status, 'pending_review');
  assert.equal(adapter.state.assignments.some((a) => a.is_published), false);

  // 2. Reabrir el borrador desde una sesión nueva por draft_id coincide con la propuesta inicial y conserva protegido
  const reopened = await reopenV2SavedDraft(adapter, savedRes.draftState.draft_id, {
    areaNameById: new Map([['area-bod', 'Bodegas']]),
    positionNameById: new Map([['pos-dhl', 'Operador DHL']]),
    shiftMetaById: new Map([
      ['sh-am05', { name: 'AM 05', start_time: '05:00', end_time: '14:00' }],
      ['sh-am08', { name: 'AM 08', start_time: '08:00', end_time: '17:00' }],
      ['sh-am04', { name: 'AM 04', start_time: '04:00', end_time: '13:00' }],
      ['sh-am11', { name: 'AM 11', start_time: '11:00', end_time: '20:00' }],
    ]),
  });
  assert.equal(reopened.ok, true);
  assert.equal(reopened.draftState.draft_version_hash, savedRes.draftState.draft_version_hash);
  assert.equal(reopened.draftState.approval_status, 'pending_review');
  assert.ok(reopened.draftState.v2_metrics.assignments?.some((a) => a.date === '2026-12-14' && a.is_protected));

  // 3. Ajuste inválido (opB el 15-12 AM 04 choca por <12h descanso con protegido del 14-12 20:00) se bloquea
  const invalidEdit = applyEditToSavedDraft({
    draftState: reopened.draftState,
    adjustment: {
      action: 'add',
      date: '2026-12-15',
      personnel_id: 'op-b',
      shift_id: 'sh-am04',
      shift_name: 'AM 04',
      shift_start: '04:00',
      shift_end: '13:00',
      duration_hours: 8,
      area_id: 'area-bod',
      area_name: 'Bodegas',
      position_id: 'pos-dhl',
      position_name: 'Operador DHL',
    },
    person: opB,
  });
  assert.equal(invalidEdit.result.valid, false);
  assert.ok(invalidEdit.result.errors.some((e) => e.includes('Descanso insuficiente')));

  // 4. Agregar turno válido al otro operador el 10-12 e intercambiar con 08-12 -> actualiza grilla, resumen, hoja diaria y horas
  const dec08Asgn = reopened.draftState.v2_metrics.assignments!.find((a) => a.date === '2026-12-08')!;
  const person08 = dec08Asgn.personnel_id === 'op-a' ? opA : opB;
  const otherPerson = dec08Asgn.personnel_id === 'op-a' ? opB : opA;

  const addedRes = applyEditToSavedDraft({
    draftState: reopened.draftState,
    adjustment: {
      action: 'add',
      date: '2026-12-10',
      personnel_id: otherPerson.personnel_id,
      shift_id: 'sh-am08',
      shift_name: 'AM 08',
      shift_start: '08:00',
      shift_end: '17:00',
      duration_hours: 8,
      area_id: 'area-bod',
      area_name: 'Bodegas',
      position_id: 'pos-dhl',
      position_name: 'Operador DHL',
    },
    person: otherPerson,
  });
  assert.equal(addedRes.result.valid, true);

  const swapRes = applySwapToSavedDraft({
    draftState: addedRes.nextDraftState,
    personA: person08,
    dateA: '2026-12-08',
    personB: otherPerson,
    dateB: '2026-12-10',
  });
  assert.equal(swapRes.result.valid, true);
  assert.ok((swapRes.result.impact.hours_impact?.length || 0) === 2);
  const dailyAfterSwap = buildV2DailyPlanningRows(
    '2026-12-08',
    swapRes.nextDraftState.v2_metrics,
    new Map([['op-a', 'Operador Alfa'], ['op-b', 'Operador Beta']])
  );
  assert.equal(dailyAfterSwap[0].ordinary_workers[0].personnel_id, otherPerson.personnel_id);

  // 5. Persistir la edición en borrador, aprobar en BD (pestaña A), reabrir en sesión nueva y luego deshacer en pestaña B
  const savedEdited = await saveV2PreviewAsDraft(adapter, {
    startDate: '2026-12-07',
    endDate: '2027-01-03',
    personnelIds: ['op-a', 'op-b'],
    expectedBaselineHash: reopened.draftState.persisted_range_hash,
    ns22Config: ns22Conf,
    previewMetrics: swapRes.nextDraftState.v2_metrics,
  });
  assert.equal(savedEdited.success, true);
  const tabAApproved = await approveV2DraftPersisted(adapter, savedEdited.draftState!, 'supervisor-test');
  assert.equal(tabAApproved.approval_status, 'approved');
  assert.equal(buildV2PublishConfirmationSummary(tabAApproved).ready, true);

  // Sesión nueva reabre y ve el estado aprobado persistido y las mismas asignaciones editadas
  const reopenedApproved = await reopenV2SavedDraft(adapter, tabAApproved.draft_id);
  assert.equal(reopenedApproved.ok, true);
  assert.equal(reopenedApproved.draftState.approval_status, 'approved');
  assert.equal(reopenedApproved.draftState.approved_version_hash, tabAApproved.approved_version_hash);

  // Pestaña B deshace ajuste y persiste invalidación -> Pestaña A (que aún tiene tabAApproved en memoria) NO puede publicar
  const tabBAfterUndo = await updateDraftAndPersistReset(adapter, tabAApproved, reopened.draftState.v2_metrics);
  assert.equal(tabBAfterUndo.approval_status, 'pending_review');
  assert.equal(buildV2PublishConfirmationSummary(tabBAfterUndo).ready, false);

  const staleTabAPub = await publishV2ApprovedDraft(adapter, tabAApproved, async () => ({ success: true }));
  assert.equal(staleTabAPub.success, false);
  assert.equal(staleTabAPub.conflictDetected, true);
  assert.equal(adapter.state.assignments.some((a) => a.is_published), false);

  // Re-aprobar versión vigente en BD para probar publicación transaccional
  const reapproved = await approveV2DraftPersisted(adapter, tabBAfterUndo, 'supervisor-test');
  assert.equal((adapter.state as any).notificationsSent, 0);

  // 6A. Cambio concurrente entre confirmación y escritura impide publicar sin parcialidades
  adapter.state.assignments[0].updated_at = '2026-12-02T12:00:00Z';
  const blockedPub = await publishV2ApprovedDraft(adapter, reapproved, async () => ({ success: true }));
  assert.equal(blockedPub.success, false);
  assert.equal(blockedPub.conflictDetected, true);
  assert.equal(adapter.state.assignments.some((a) => a.is_published), false);

  // 6B. Cambio concurrente también impide guardar nueva propuesta sobre baseline viejo
  const blockedSave = await saveV2PreviewAsDraft(adapter, {
    startDate: '2026-12-07',
    endDate: '2027-01-03',
    personnelIds: ['op-a', 'op-b'],
    expectedBaselineHash: baselineHash,
    ns22Config: ns22Conf,
    previewMetrics: preview.v2,
  });
  assert.equal(blockedSave.success, false);
  assert.equal(blockedSave.conflictDetected, true);

  // 6C. Con versión vigente sin conflicto, publicación transaccional publica atómicamente todos los turnos del borrador
  reapproved.persisted_range_hash = computeRangeStateHash(
    (await adapter.loadRangeState('2026-12-07', '2027-01-03')).assignments,
    (await adapter.loadRangeState('2026-12-07', '2027-01-03')).requirements
  );
  const okPub = await publishV2ApprovedDraft(adapter, reapproved, async () => ({ success: true }));
  assert.equal(okPub.success, true);
  assert.ok((okPub.publishedCount || 0) > 0);
  assert.equal(okPub.nextDraftState?.approval_status, 'published');
  assert.equal(adapter.state.assignments.every((a) => a.is_published === true), true);
});

test('Autorización de publicación v2: exige ROSTER_V2_PUBLISH_USER_ID y rol ADMIN; falta de config y otro ADMIN son rechazados', () => {
  const prevEnv = process.env.ROSTER_V2_PUBLISH_USER_ID;
  const configuredUserId = '7858b9ae-2664-4d4f-8925-91d8704af86b';
  try {
    // 1. Sin ROSTER_V2_PUBLISH_USER_ID -> bloqueado incluso para ADMIN
    delete process.env.ROSTER_V2_PUBLISH_USER_ID;
    const missingEnv = isAuthorizedV2Publisher({
      ok: true,
      userId: configuredUserId,
      role: 'ADMIN',
    });
    assert.equal(missingEnv.ok, false);
    assert.match(missingEnv.error || '', /ROSTER_V2_PUBLISH_USER_ID/i);

    process.env.ROSTER_V2_PUBLISH_USER_ID = '   ';
    const blankEnv = isAuthorizedV2Publisher({
      ok: true,
      userId: configuredUserId,
      role: 'ADMIN',
    });
    assert.equal(blankEnv.ok, false);
    assert.match(blankEnv.error || '', /ROSTER_V2_PUBLISH_USER_ID/i);

    // 2. Con ROSTER_V2_PUBLISH_USER_ID configurado -> solo esa cuenta ADMIN pasa
    process.env.ROSTER_V2_PUBLISH_USER_ID = configuredUserId;
    const allowed = isAuthorizedV2Publisher({
      ok: true,
      userId: configuredUserId,
      role: 'ADMIN',
    });
    assert.equal(allowed.ok, true);

    // 3. Otro ADMIN con distinto userId -> rechazado
    const otherAdmin = isAuthorizedV2Publisher({
      ok: true,
      userId: '11111111-1111-4111-8111-111111111111',
      role: 'ADMIN',
    });
    assert.equal(otherAdmin.ok, false);
    assert.match(otherAdmin.error || '', /no autorizada/i);

    // 4. Usuario sin rol ADMIN (p. ej. SUPERVISOR) incluso con el mismo userId -> rechazado
    const nonAdmin = isAuthorizedV2Publisher({
      ok: true,
      userId: configuredUserId,
      role: 'SUPERVISOR',
    });
    assert.equal(nonAdmin.ok, false);
    assert.match(nonAdmin.error || '', /ADMIN/i);

    // 5. Sesión no autenticada -> rechazada
    const unauth = isAuthorizedV2Publisher({ ok: false });
    assert.equal(unauth.ok, false);
  } finally {
    if (prevEnv === undefined) {
      delete process.env.ROSTER_V2_PUBLISH_USER_ID;
    } else {
      process.env.ROSTER_V2_PUBLISH_USER_ID = prevEnv;
    }
  }
});

test('Editar propuesta v2 en memoria con ROSTER_V2_SAVE_ENABLED=false: agregar, cambiar, quitar, intercambiar y deshacer sin escribir en DB ni publicar', () => {
  const prevSaveFlag = process.env.ROSTER_V2_SAVE_ENABLED;
  process.env.ROSTER_V2_SAVE_ENABLED = 'false';
  try {
    assert.equal(isV2SaveEnabled(), false);

    const p1: PersonnelScheduleProfile = {
      personnel_id: 'p-1',
      full_name: 'OPERADOR UNO',
      main_position: 'pos-op',
      secondary_positions: [],
      rotation_pattern: '5X2',
    };
    const p2: PersonnelScheduleProfile = {
      personnel_id: 'p-2',
      full_name: 'OPERADOR DOS',
      main_position: 'pos-op',
      secondary_positions: [],
      rotation_pattern: '5X2',
    };

    const reqs: RawShiftRequirement[] = [
      {
        id: 'req-1',
        date: '2026-12-10',
        area_id: 'area-bodega',
        position_id: 'pos-op',
        shift_id: 'sh-am08',
        shift: { name: 'AM 08', start_time: '08:00', end_time: '17:00', duration_hours: 8 },
        required_count: 1,
        priority: 'CRITICAL',
      } as RawShiftRequirement,
      {
        id: 'req-2',
        date: '2026-12-11',
        area_id: 'area-bodega',
        position_id: 'pos-op',
        shift_id: 'sh-am08',
        shift: { name: 'AM 08', start_time: '08:00', end_time: '17:00', duration_hours: 8 },
        required_count: 1,
        priority: 'HIGH',
      } as RawShiftRequirement,
    ];

    const preview = compareEnginesPreview({
      startDate: '2026-12-10',
      endDate: '2026-12-11',
      personnel: [p1, p2],
      rawRequirements: reqs,
      existingAssignments: [],
      approvedLeaves: [],
      areaNameById: new Map([['area-bodega', 'Bodega']]),
      positionNameById: new Map([['pos-op', 'Operador']]),
      referenceDate: new Date('2026-12-01T12:00:00Z'),
    });

    const undoStack: typeof preview.v2[] = [];
    let currentV2 = preview.v2;

    // 0. Clic en turno propuesto y en celda OFF con «Editar propuesta» activo: abre editor sin activar selección operativa
    const asg10 = (currentV2.assignments || []).find((a) => a.date === '2026-12-10')!;
    const offPersonId = asg10.personnel_id === 'p-1' ? 'p-2' : 'p-1';
    const clickBeforeEditMode = resolveV2GridCellClick({
      isV2GridPreviewActive: true,
      isV2ProposalEditing: false,
      hasSavedDraft: false,
      previewV2: currentV2,
      personId: asg10.personnel_id,
      mainPositionId: 'pos-op',
      dateStr: '2026-12-10',
      positions: [{ id: 'pos-op', area_id: 'area-bodega' }],
      areas: [{ id: 'area-bodega' }],
      shifts: [{ id: 'sh-am08' }],
    });
    assert.equal(clickBeforeEditMode.mode, 'blocked_enable_edit');

    const clickProposedShift = resolveV2GridCellClick({
      isV2GridPreviewActive: true,
      isV2ProposalEditing: true,
      hasSavedDraft: false,
      previewV2: currentV2,
      personId: asg10.personnel_id,
      mainPositionId: 'pos-op',
      dateStr: '2026-12-10',
      positions: [{ id: 'pos-op', area_id: 'area-bodega' }],
      areas: [{ id: 'area-bodega' }],
      shifts: [{ id: 'sh-am08' }],
    });
    assert.equal(clickProposedShift.mode, 'open_editor');
    if (clickProposedShift.mode === 'open_editor') {
      assert.equal(clickProposedShift.action, 'replace');
    }

    const clickOffCell = resolveV2GridCellClick({
      isV2GridPreviewActive: true,
      isV2ProposalEditing: true,
      hasSavedDraft: false,
      previewV2: currentV2,
      personId: offPersonId,
      mainPositionId: 'pos-op',
      dateStr: '2026-12-10',
      positions: [{ id: 'pos-op', area_id: 'area-bodega' }],
      areas: [{ id: 'area-bodega' }],
      shifts: [{ id: 'sh-am08' }],
    });
    assert.equal(clickOffCell.mode, 'open_editor');
    if (clickOffCell.mode === 'open_editor') {
      assert.equal(clickOffCell.action, 'add');
    }

    // 1. Quitar turno del 11-12 y verificar que grilla, resumen y Programación Operativa reflejen la vacante
    const asg11 = (currentV2.assignments || []).find((a) => a.date === '2026-12-11')!;
    const personFor11 = asg11.personnel_id === 'p-1' ? p1 : p2;
    const remRes = applyV2DraftAdjustment({
      currentV2,
      adjustment: {
        action: 'remove',
        date: '2026-12-11',
        personnel_id: asg11.personnel_id,
        shift_id: 'sh-am08',
        shift_name: 'AM 08',
        shift_start: '08:00',
        shift_end: '17:00',
        duration_hours: 8,
        area_id: 'area-bodega',
        area_name: 'Bodega',
        position_id: 'pos-op',
        position_name: 'Operador',
      },
      person: personFor11,
      existingOutOfRangeOrProtected: [],
      approvedLeaves: [],
      shiftDurationById: new Map([['sh-am08', 8]]),
    });
    assert.equal(remRes.valid, true);
    undoStack.push(currentV2);
    currentV2 = remRes.nextV2!;
    assert.equal(currentV2.total_covered, 1);
    assert.equal(currentV2.total_vacancies, 1);

    const opRowsAfterRemove = buildV2DailyPlanningRows(
      '2026-12-11',
      currentV2,
      new Map([['p-1', 'OPERADOR UNO'], ['p-2', 'OPERADOR DOS']])
    );
    assert.equal(opRowsAfterRemove[0].missing_count, 1);

    // 2. Volver a agregar turno en 2026-12-11 para otro operador
    const otherPerson = asg11.personnel_id === 'p-1' ? p2 : p1;
    const addRes = applyV2DraftAdjustment({
      currentV2,
      adjustment: {
        action: 'add',
        date: '2026-12-11',
        personnel_id: otherPerson.personnel_id,
        shift_id: 'sh-am08',
        shift_name: 'AM 08',
        shift_start: '08:00',
        shift_end: '17:00',
        duration_hours: 8,
        area_id: 'area-bodega',
        area_name: 'Bodega',
        position_id: 'pos-op',
        position_name: 'Operador',
      },
      person: otherPerson,
      existingOutOfRangeOrProtected: [],
      approvedLeaves: [],
      shiftDurationById: new Map([['sh-am08', 8]]),
    });
    assert.equal(addRes.valid, true, JSON.stringify(addRes.errors));
    undoStack.push(currentV2);
    currentV2 = addRes.nextV2!;
    assert.equal(currentV2.total_covered, 2);

    // 3. Intercambiar turnos entre p1 y p2
    const pOn10 = (currentV2.assignments || []).find((a) => a.date === '2026-12-10')!;
    const pOn11 = (currentV2.assignments || []).find((a) => a.date === '2026-12-11')!;
    if (pOn10.personnel_id !== pOn11.personnel_id) {
      const swapRes = applyV2DraftSwap({
        currentV2,
        personA: pOn10.personnel_id === 'p-1' ? p1 : p2,
        dateA: '2026-12-10',
        personB: pOn11.personnel_id === 'p-1' ? p1 : p2,
        dateB: '2026-12-11',
        existingOutOfRangeOrProtected: [],
        approvedLeaves: [],
        shiftDurationById: new Map([['sh-am08', 8]]),
      });
      assert.equal(swapRes.valid, true);
      undoStack.push(currentV2);
      currentV2 = swapRes.nextV2!;
      assert.equal(currentV2.total_covered, 2);
    }

    // 4. Deshacer todos los ajustes en memoria -> vuelve al estado inicial sin tocar DB ni publicar
    while (undoStack.length > 0) {
      currentV2 = undoStack.pop()!;
    }
    assert.equal(currentV2.total_covered, preview.v2.total_covered);
    assert.equal((currentV2.assignments || []).length, (preview.v2.assignments || []).length);
  } finally {
    if (prevSaveFlag === undefined) {
      delete process.env.ROSTER_V2_SAVE_ENABLED;
    } else {
      process.env.ROSTER_V2_SAVE_ENABLED = prevSaveFlag;
    }
  }
});

test('saveV2DraftAction / buildNs22ConfirmationFromDbData: construye NS22 desde Supabase sin ns22Confirmation del botón, guarda propuesta editada y bloquea si falta ancla o horario', async () => {
  const shiftsCatalog = [
    { id: 'sh-ns22', name: 'NS 22', start_time: '22:00:00', end_time: '07:00:00', duration_hours: 8 },
  ];
  const positionsCatalog = [
    { id: 'pos-op-aero', name: 'Operador Aeropuerto', area_id: 'area-aero' },
  ];
  const personnelCatalog = [
    {
      id: '1e2cc199-7a29-417f-86d3-58143d448654',
      first_name: 'MARCELO ANDRES',
      last_name_father: 'JARA',
      main_position: 'pos-op-aero',
      rotation_pattern: '4x4_noche',
      ns22_anchor_date: '2026-12-14',
      is_active: true,
    },
    {
      id: 'dafef0b7-cbab-4eaa-8aec-88ae7b4848d3',
      first_name: 'JAVIER IGNACIO',
      last_name_father: 'LOPEZ',
      main_position: 'pos-op-aero',
      rotation_pattern: '4x4_noche',
      ns22_anchor_date: '2026-12-10',
      is_active: true,
    },
  ];

  // 1. Caso válido: ambas anclas registradas (2026-12-14 y 2026-12-10), 22:00-07:00, exención pendiente
  const builtOk = buildNs22ConfirmationFromDbData({
    shifts: shiftsCatalog,
    positions: positionsCatalog,
    personnel: personnelCatalog,
  });
  assert.equal(builtOk.ok, true);
  assert.equal(builtOk.confirmation?.confirmed, true);
  assert.equal(builtOk.confirmation?.scheduleConfirmed, true);
  assert.equal(builtOk.confirmation?.regimeConfirmed, false);
  assert.equal(builtOk.confirmation?.titulares.length, 2);
  assert.equal(builtOk.confirmation?.titulares[0].confirmedAnchorDate, '2026-12-14');
  assert.equal(builtOk.confirmation?.titulares[1].confirmedAnchorDate, '2026-12-10');

  // Simular guardado y reapertura exacta de propuesta editada vía adapter sin enviar ns22Confirmation en el botón
  const adapter = createIsolatedMemoryAdapter({ assignments: [], requirements: [] });
  const editedPreview = {
    engine: 'v2' as const,
    label: 'v2',
    elapsed_ms: 10,
    execution_time_ms: 10,
    total_required: 1,
    total_covered: 1,
    total_vacancies: 0,
    coverage_percent: 100,
    coverage_by_priority: { CRITICAL: { required: 1, covered: 1, vacancies: 0 } },
    covered_primary_count: 1,
    covered_secondary_count: 0,
    reinforcement_count: 0,
    conflicts_count: 0,
    jornada_conflicts_count: 0,
    conflicts: [],
    holiday_warnings: [],
    vacancies: [],
    start_date: '2026-12-07',
    end_date: '2027-01-03',
    assignments: [
      {
        date: '2026-12-10',
        personnel_id: 'dafef0b7-cbab-4eaa-8aec-88ae7b4848d3',
        shift_id: 'sh-ns22',
        shift_name: 'NS 22',
        shift_start: '22:00',
        shift_end: '07:00',
        area_id: 'area-aero',
        area_name: 'Aeropuerto',
        position_id: 'pos-op-aero',
        position_name: 'Operador Aeropuerto',
        assignment_kind: 'ns22_titular' as const,
        match_type: 'primary' as const,
        is_extra: false,
        is_protected: false,
      },
    ],
  };

  const saved = await saveV2PreviewAsDraft(adapter, {
    startDate: '2026-12-07',
    endDate: '2027-01-03',
    expectedBaselineHash: '',
    ns22Config: builtOk.confirmation!,
    previewMetrics: editedPreview,
    shiftDurationById: new Map([['sh-ns22', 8]]),
  });
  assert.equal(saved.success, true);
  assert.equal(saved.draftState?.approval_status, 'pending_review');
  assert.equal(adapter.state.assignments.every((a) => a.is_published === false), true);

  const reopened = await reopenV2SavedDraft(adapter, saved.draftState!.draft_id);
  assert.equal(reopened.ok, true);
  assert.equal(reopened.draftState?.v2_metrics.assignments?.length, 1);
  assert.equal(
    reopened.draftState?.v2_metrics.assignments?.[0].personnel_id,
    'dafef0b7-cbab-4eaa-8aec-88ae7b4848d3'
  );

  // 2. Caso ancla faltante -> bloquea e indica el dato exacto que falta
  const missingAnchor = buildNs22ConfirmationFromDbData({
    shifts: shiftsCatalog,
    positions: positionsCatalog,
    personnel: [
      personnelCatalog[0],
      { ...personnelCatalog[1], ns22_anchor_date: null },
    ],
  });
  assert.equal(missingAnchor.ok, false);
  assert.match(missingAnchor.error || '', /ns22_anchor_date.*JAVIER IGNACIO LOPEZ/i);

  // 3. Caso horario NS22 distinto de 22:00 a 07:00 -> bloquea e indica el horario esperado
  const wrongSchedule = buildNs22ConfirmationFromDbData({
    shifts: [{ id: 'sh-ns22', name: 'NS 22', start_time: '22:00:00', end_time: '08:00:00' }],
    positions: positionsCatalog,
    personnel: personnelCatalog,
  });
  assert.equal(wrongSchedule.ok, false);
  assert.match(wrongSchedule.error || '', /22:00 a 07:00/i);
});
