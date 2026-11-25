import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDotacionSlotKey,
  evaluateDailyPlanningVacancies,
  getDefaultSchedulerEngine,
  isV2SaveEnabled,
  recoverRosterFromSnapshot,
  saveV2Schedule,
  validateNs22OperationalConfig,
} from './index';
import type {
  CrossAreaAssignment,
  CrossAreaScheduleResult,
  ExtraRequirementState,
  Ns22OperationalConfirmation,
  PersistedAssignmentRow,
  PersistedRequirementRow,
  RosterPersistenceAdapter,
  RosterV2Snapshot,
  SlotCoverageDetail,
} from './index';

/**
 * Entorno aislado en memoria que replica las tablas y restricciones únicas
 * de Postgres/Supabase (incluyendo las migraciones de ROSTER-07 y ROSTER-08)
 * sin tocar jamás la base operativa.
 */
class IsolatedTestRosterDb implements RosterPersistenceAdapter {
  assignments: PersistedAssignmentRow[] = [];
  requirements: PersistedRequirementRow[] = [];
  snapshots = new Map<string, RosterV2Snapshot>();
  private seq = 1;
  failOnStep: 'deleteAssignments' | 'upsertAssignments' | 'upsertExtras' | null = null;

  private nextId(prefix: string): string {
    return `${prefix}-${this.seq++}`;
  }

  seed(assignments: PersistedAssignmentRow[], requirements: PersistedRequirementRow[]) {
    this.assignments = assignments.map((a) => ({ ...a }));
    this.requirements = requirements.map((r) => ({ ...r }));
  }

  async loadRangeState(startDate: string, endDate: string) {
    return {
      assignments: this.assignments
        .filter((a) => a.date >= startDate && a.date <= endDate)
        .map((a) => ({ ...a })),
      requirements: this.requirements
        .filter((r) => r.date >= startDate && r.date <= endDate)
        .map((r) => ({ ...r })),
    };
  }

  async saveSnapshot(snapshot: Omit<RosterV2Snapshot, 'id'>) {
    const id = this.nextId('snap');
    this.snapshots.set(id, {
      ...snapshot,
      id,
      assignments: snapshot.assignments.map((a) => ({ ...a })),
      requirements: snapshot.requirements.map((r) => ({ ...r })),
    });
    return { snapshotId: id };
  }

  async loadSnapshot(snapshotId: string) {
    const found = this.snapshots.get(snapshotId);
    if (!found) return null;
    return {
      ...found,
      assignments: found.assignments.map((a) => ({ ...a })),
      requirements: found.requirements.map((r) => ({ ...r })),
    };
  }

  async markSnapshotRestored(snapshotId: string, restoredAt: string) {
    const found = this.snapshots.get(snapshotId);
    if (found) found.restoredAt = restoredAt;
  }

  async deleteAssignmentsByIds(ids: string[]) {
    if (this.failOnStep === 'deleteAssignments') {
      throw new Error('Fallo simulado en deleteAssignmentsByIds');
    }
    const idSet = new Set(ids);
    this.assignments = this.assignments.filter((a) => !idSet.has(a.id));
  }

  async upsertAssignments(rows: Omit<PersistedAssignmentRow, 'id'>[]) {
    if (this.failOnStep === 'upsertAssignments') {
      throw new Error('Fallo simulado en upsertAssignments');
    }
    for (const row of rows) {
      if (row.extra_target && row.extra_target !== 'manual' && row.extra_target !== 'v2_vacancy') {
        throw new Error(`Violación CHECK extra_target: ${row.extra_target}`);
      }
      const existingIdx = this.assignments.findIndex(
        (a) =>
          a.personnel_id === row.personnel_id &&
          a.date === row.date &&
          a.shift_id === row.shift_id &&
          a.is_extra === row.is_extra
      );
      if (existingIdx >= 0) {
        this.assignments[existingIdx] = { ...this.assignments[existingIdx], ...row };
      } else {
        this.assignments.push({ ...row, id: this.nextId('asg') });
      }
    }
  }

  async upsertExtraRequirements(rows: ExtraRequirementState[]) {
    if (this.failOnStep === 'upsertExtras') {
      throw new Error('Fallo simulado en upsertExtraRequirements');
    }
    for (const row of rows) {
      const existingIdx = this.requirements.findIndex(
        (r) =>
          r.date === row.date &&
          r.area_id === row.area_id &&
          r.position_id === row.position_id &&
          r.shift_id === row.shift_id &&
          r.is_extra === true
      );
      const nextRow: PersistedRequirementRow = {
        id: existingIdx >= 0 ? this.requirements[existingIdx].id : this.nextId('req-extra'),
        date: row.date,
        area_id: row.area_id,
        position_id: row.position_id,
        shift_id: row.shift_id,
        required_count: row.required_count,
        is_extra: true,
        manual_extra_count: row.manual_count,
        auto_vacancy_count: row.auto_vacancy_count,
        linked_requirement_id: row.linked_requirement_id ?? null,
      };
      if (existingIdx >= 0) {
        this.requirements[existingIdx] = nextRow;
      } else {
        this.requirements.push(nextRow);
      }
    }
  }

  async deleteRequirementsByIds(ids: string[]) {
    const idSet = new Set(ids);
    this.requirements = this.requirements.filter((r) => !idSet.has(r.id));
  }

  async restoreRangeState(
    startDate: string,
    endDate: string,
    assignments: PersistedAssignmentRow[],
    requirements: PersistedRequirementRow[]
  ) {
    this.assignments = [
      ...this.assignments.filter((a) => a.date < startDate || a.date > endDate),
      ...assignments.map((a) => ({ ...a })),
    ];
    this.requirements = [
      ...this.requirements.filter((r) => r.date < startDate || r.date > endDate),
      ...requirements.map((r) => ({ ...r })),
    ];
  }

  /**
   * Simula assignExtraPersonnel con ROSTER_V2_EXTRA_LINKS=true en el entorno de prueba.
   */
  assignExtraInTestEnv(params: {
    date: string;
    shiftId: string;
    areaId: string;
    positionId: string;
    personnelId: string;
    extraTarget: 'manual' | 'v2_vacancy';
    linkedRequirementId: string | null;
  }): { success: boolean; error?: string } {
    const existing = this.assignments.find(
      (a) =>
        a.date === params.date &&
        a.shift_id === params.shiftId &&
        a.personnel_id === params.personnelId &&
        a.is_extra === true
    );

    if (existing) {
      if (existing.status === 'cancelled') {
        existing.status = 'scheduled';
        existing.area_id = params.areaId;
        existing.position_id = params.positionId;
        existing.is_manual = true;
        existing.extra_target = params.extraTarget;
        existing.linked_requirement_id = params.linkedRequirementId;
        return { success: true };
      }
      const sameSlot =
        existing.area_id === params.areaId &&
        existing.position_id === params.positionId &&
        (existing.extra_target ?? null) === params.extraTarget &&
        (existing.linked_requirement_id ?? null) === params.linkedRequirementId;
      if (!sameSlot) {
        return {
          success: false,
          error:
            'El trabajador ya tiene un turno extra activo en otro cupo para esta fecha y horario; su vínculo original se conserva.',
        };
      }
      return { success: true };
    }

    this.assignments.push({
      id: this.nextId('asg'),
      personnel_id: params.personnelId,
      shift_id: params.shiftId,
      date: params.date,
      area_id: params.areaId,
      position_id: params.positionId,
      status: 'scheduled',
      is_locked: false,
      is_manual: true,
      is_confirmed: false,
      is_validated: false,
      is_published: false,
      frozen_by_rule: false,
      original_shift_id: params.shiftId,
      is_extra: true,
      extra_target: params.extraTarget,
      linked_requirement_id: params.linkedRequirementId,
      attendance_status: null,
      paid_month: null,
    });
    return { success: true };
  }

  /** Simula consulta de rol ordinario del trabajador ((worker)/actions.ts:242) */
  queryWorkerOrdinaryRoster(personnelId: string): PersistedAssignmentRow[] {
    return this.assignments.filter(
      (a) => a.personnel_id === personnelId && a.is_extra === false && a.status !== 'cancelled'
    );
  }

  /** Simula consulta del reporte de bonos (reports/bonos/actions.ts:23-39) */
  queryBonosExtraReport(from: string, to: string): PersistedAssignmentRow[] {
    return this.assignments.filter(
      (a) =>
        a.is_extra === true &&
        a.status !== 'cancelled' &&
        (a.attendance_status === null || a.attendance_status === undefined || a.attendance_status !== 'absent') &&
        a.date >= from &&
        a.date <= to
    );
  }
}

const CONFIRMED_NS22: Ns22OperationalConfirmation = {
  confirmed: true,
  scheduleConfirmed: true,
  regimeConfirmed: true,
  titulares: [
    {
      personnelId: 'tit-1',
      name: 'Titular 1',
      anchorStatus: 'confirmed',
      confirmedAnchorDate: '2026-11-01',
    },
    {
      personnelId: 'tit-2',
      name: 'Titular 2',
      anchorStatus: 'confirmed',
      confirmedAnchorDate: '2026-11-05',
    },
  ],
};

function makeAssignment(
  personnelId: string,
  date: string,
  areaId: string,
  positionId: string,
  shiftId: string
): CrossAreaAssignment {
  return {
    date,
    personnel_id: personnelId,
    shift_id: shiftId,
    area_id: areaId,
    position_id: positionId,
    shift_start: '08:00',
    shift_end: '17:00',
    duration_hours: 9,
    slot_key: buildDotacionSlotKey({ date, area_id: areaId, position_id: positionId, shift_id: shiftId }),
    assignment_kind: 'ordinary',
    match_type: 'primary',
    priority_rank: 3,
    is_extra: false,
    is_locked: false,
    frozen_by_rule: false,
  };
}

function makeVacancy(
  date: string,
  areaId: string,
  positionId: string,
  shiftId: string,
  requiredCount: number,
  assignedCount: number
): SlotCoverageDetail {
  return {
    slot_key: buildDotacionSlotKey({ date, area_id: areaId, position_id: positionId, shift_id: shiftId }),
    date,
    area_id: areaId,
    position_id: positionId,
    shift_id: shiftId,
    is_extra: false,
    priority: 'NORMAL',
    priority_rank: 3,
    required_count: requiredCount,
    protected_filled_count: 0,
    assigned_count: assignedCount,
    covered_count: assignedCount,
    vacancy_count: Math.max(0, requiredCount - assignedCount),
    over_allocated_count: 0,
  };
}

function makeEmptyV2Result(overrides?: Partial<CrossAreaScheduleResult>): CrossAreaScheduleResult {
  return {
    assignments: [],
    ordinary_assignments: [],
    reinforcements: [],
    coverage: {
      ordinary: {
        total_required: 0,
        total_covered: 0,
        total_vacancies: 0,
        coverage_percent: 100,
        slots: [],
      },
      extra: {
        total_required: 0,
        total_covered: 0,
        total_vacancies: 0,
        coverage_percent: 100,
        slots: [],
      },
      unmatched_protected_ordinary: 0,
      unmatched_protected_extra: 0,
    },
    remaining_vacancies: [],
    audit_violations: [],
    holiday_warnings: [],
    ns22_result: {
      assignments: [],
      vacancies: [],
      preserved_protected: [],
      titular_conflicts: [],
      titular_cycles: [],
      verification_notices: [],
    },
    permission_cases: [],
    stats: {
      total_required: 0,
      total_covered: 0,
      total_vacancies: 0,
      coverage_percent: 100,
      covered_primary_count: 0,
      covered_secondary_count: 0,
      reinforcement_count: 0,
    },
    ...overrides,
  };
}

test('ROSTER-07: guardado v2 por rango y filtros conserva protegidos, extras manuales y fuera de alcance', async () => {
  const db = new IsolatedTestRosterDb();
  db.seed(
    [
      // En rango y filtro, borrador reemplazable -> debe reemplazarse
      {
        id: 'old-draft',
        personnel_id: 'p-1',
        shift_id: 'sh-am',
        date: '2026-11-10',
        area_id: 'area-base',
        position_id: 'pos-op',
        status: 'scheduled',
        is_locked: false,
        is_manual: false,
        is_confirmed: false,
        is_validated: false,
        is_published: false,
        frozen_by_rule: false,
        original_shift_id: 'sh-am',
        is_extra: false,
      },
      // En rango y filtro, protegido -> debe conservarse
      {
        id: 'prot-1',
        personnel_id: 'p-2',
        shift_id: 'sh-am',
        date: '2026-11-10',
        area_id: 'area-base',
        position_id: 'pos-op',
        status: 'scheduled',
        is_locked: true,
        is_manual: false,
        is_confirmed: true,
        is_validated: false,
        is_published: false,
        frozen_by_rule: false,
        original_shift_id: 'sh-am',
        is_extra: false,
      },
      // Extra manual en rango -> debe conservarse
      {
        id: 'extra-man-1',
        personnel_id: 'p-3',
        shift_id: 'sh-am',
        date: '2026-11-10',
        area_id: 'area-base',
        position_id: 'pos-op',
        status: 'scheduled',
        is_locked: false,
        is_manual: true,
        is_confirmed: false,
        is_validated: false,
        is_published: false,
        frozen_by_rule: false,
        original_shift_id: 'sh-am',
        is_extra: true,
        extra_target: 'manual',
      },
      // Fuera de filtro (otra área) -> debe conservarse
      {
        id: 'out-area',
        personnel_id: 'p-4',
        shift_id: 'sh-am',
        date: '2026-11-10',
        area_id: 'area-aero',
        position_id: 'pos-op',
        status: 'scheduled',
        is_locked: false,
        is_manual: false,
        is_confirmed: false,
        is_validated: false,
        is_published: false,
        frozen_by_rule: false,
        original_shift_id: 'sh-am',
        is_extra: false,
      },
    ],
    [
      {
        id: 'req-ord-1',
        date: '2026-11-10',
        area_id: 'area-base',
        position_id: 'pos-op',
        shift_id: 'sh-am',
        required_count: 2,
        is_extra: false,
      },
    ]
  );

  const v2Result = makeEmptyV2Result({
    assignments: [makeAssignment('p-5', '2026-11-10', 'area-base', 'pos-op', 'sh-am')],
  });

  const res = await saveV2Schedule(db, {
    startDate: '2026-11-10',
    endDate: '2026-11-10',
    areaId: 'area-base',
    positionIds: ['pos-op'],
    ns22Config: CONFIRMED_NS22,
    v2Result,
  });

  assert.equal(res.success, true);
  assert.equal(res.deletedCount, 1);
  assert.equal(res.insertedCount, 1);
  assert.equal(res.preservedProtectedCount, 1);
  assert.equal(res.preservedExtraCount, 1);
  assert.equal(res.preservedOutOfScopeCount, 1);
  assert.ok(db.assignments.some((a) => a.id === 'prot-1'));
  assert.ok(db.assignments.some((a) => a.id === 'extra-man-1'));
  assert.ok(db.assignments.some((a) => a.id === 'out-area'));
  assert.ok(db.assignments.some((a) => a.personnel_id === 'p-5' && !a.is_extra));
  assert.ok(!db.assignments.some((a) => a.id === 'old-draft'));
});

test('ROSTER-07: fallo durante guardado deja roster previo íntegro y repetir guardado no duplica turnos ni pendientes', async () => {
  const db = new IsolatedTestRosterDb();
  const initialAssignments: PersistedAssignmentRow[] = [
    {
      id: 'prev-1',
      personnel_id: 'p-1',
      shift_id: 'sh-am',
      date: '2026-11-11',
      area_id: 'area-base',
      position_id: 'pos-op',
      status: 'scheduled',
      is_locked: false,
      is_manual: false,
      is_confirmed: false,
      is_validated: false,
      is_published: false,
      frozen_by_rule: false,
      original_shift_id: 'sh-am',
      is_extra: false,
    },
  ];
  const initialReqs: PersistedRequirementRow[] = [
    {
      id: 'req-ord-1',
      date: '2026-11-11',
      area_id: 'area-base',
      position_id: 'pos-op',
      shift_id: 'sh-am',
      required_count: 3,
      is_extra: false,
    },
  ];
  db.seed(initialAssignments, initialReqs);

  const slotKey = buildDotacionSlotKey({
    date: '2026-11-11',
    area_id: 'area-base',
    position_id: 'pos-op',
    shift_id: 'sh-am',
  });
  const v2Result = makeEmptyV2Result({
    assignments: [makeAssignment('p-2', '2026-11-11', 'area-base', 'pos-op', 'sh-am')],
    remaining_vacancies: [makeVacancy('2026-11-11', 'area-base', 'pos-op', 'sh-am', 3, 2)],
  });

  // 1. Inyectar fallo a mitad de guardado (después de borrar y reinsertar asignaciones)
  db.failOnStep = 'upsertExtras';
  const failedSave = await saveV2Schedule(db, {
    startDate: '2026-11-11',
    endDate: '2026-11-11',
    areaId: 'area-base',
    ns22Config: CONFIRMED_NS22,
    v2Result,
  });

  assert.equal(failedSave.success, false);
  assert.equal(failedSave.rolledBack, true);
  assert.deepEqual(db.assignments, initialAssignments);
  assert.deepEqual(db.requirements, initialReqs);

  // 2. Ejecutar guardado limpio dos veces seguidas -> sin duplicados
  db.failOnStep = null;
  const ok1 = await saveV2Schedule(db, {
    startDate: '2026-11-11',
    endDate: '2026-11-11',
    areaId: 'area-base',
    ns22Config: CONFIRMED_NS22,
    v2Result,
  });
  assert.equal(ok1.success, true);

  const ok2 = await saveV2Schedule(db, {
    startDate: '2026-11-11',
    endDate: '2026-11-11',
    areaId: 'area-base',
    ns22Config: CONFIRMED_NS22,
    v2Result,
  });
  assert.equal(ok2.success, true);
  assert.equal(db.assignments.filter((a) => !a.is_extra).length, 1);
  const extraReqs = db.requirements.filter((r) => r.is_extra);
  assert.equal(extraReqs.length, 1);
  assert.equal(extraReqs[0].auto_vacancy_count, 1);
  assert.equal(extraReqs[0].linked_requirement_id, 'req-ord-1');
});

test('ROSTER-07: v1 sigue predeterminado y recoverRosterFromSnapshot restaura el roster anterior a v2', async () => {
  assert.equal(getDefaultSchedulerEngine(), 'v1');
  assert.equal(isV2SaveEnabled(), false);

  const db = new IsolatedTestRosterDb();
  const prevRow: PersistedAssignmentRow = {
    id: 'v1-prev',
    personnel_id: 'p-v1',
    shift_id: 'sh-am',
    date: '2026-11-12',
    area_id: 'area-base',
    position_id: 'pos-op',
    status: 'scheduled',
    is_locked: false,
    is_manual: false,
    is_confirmed: false,
    is_validated: false,
    is_published: false,
    frozen_by_rule: false,
    original_shift_id: 'sh-am',
    is_extra: false,
  };
  db.seed([prevRow], []);

  const saveRes = await saveV2Schedule(db, {
    startDate: '2026-11-12',
    endDate: '2026-11-12',
    ns22Config: CONFIRMED_NS22,
    v2Result: makeEmptyV2Result({
      assignments: [makeAssignment('p-v2', '2026-11-12', 'area-base', 'pos-op', 'sh-am')],
    }),
  });
  assert.equal(saveRes.success, true);
  assert.ok(saveRes.snapshotId);
  assert.equal(db.assignments[0].personnel_id, 'p-v2');

  const recoverRes = await recoverRosterFromSnapshot(db, saveRes.snapshotId!);
  assert.equal(recoverRes.success, true);
  assert.equal(db.assignments.length, 1);
  assert.equal(db.assignments[0].id, 'v1-prev');
  assert.equal(db.assignments[0].personnel_id, 'p-v1');
});

test('ROSTER-07: Dotación Extra en entorno de prueba (crear, reactivar cancelado, recargar, extra activo en otro cupo, rol trabajador y bonos)', async () => {
  const db = new IsolatedTestRosterDb();
  const slotA = buildDotacionSlotKey({
    date: '2026-11-13',
    area_id: 'area-base',
    position_id: 'pos-op',
    shift_id: 'sh-am',
  });
  const slotB = buildDotacionSlotKey({
    date: '2026-11-13',
    area_id: 'area-bodega',
    position_id: 'pos-bod',
    shift_id: 'sh-am',
  });

  db.seed(
    [
      // 2 asignados ordinarios en area-base (requiere 3 -> 1 vacante)
      {
        id: 'ord-1',
        personnel_id: 'p-1',
        shift_id: 'sh-am',
        date: '2026-11-13',
        area_id: 'area-base',
        position_id: 'pos-op',
        status: 'scheduled',
        is_locked: true,
        is_manual: false,
        is_confirmed: true,
        is_validated: false,
        is_published: false,
        frozen_by_rule: false,
        original_shift_id: 'sh-am',
        is_extra: false,
      },
      {
        id: 'ord-2',
        personnel_id: 'p-2',
        shift_id: 'sh-am',
        date: '2026-11-13',
        area_id: 'area-base',
        position_id: 'pos-op',
        status: 'scheduled',
        is_locked: true,
        is_manual: false,
        is_confirmed: true,
        is_validated: false,
        is_published: false,
        frozen_by_rule: false,
        original_shift_id: 'sh-am',
        is_extra: false,
      },
      // Extra cancelado previo de p-cancel en manual
      {
        id: 'extra-cancelled',
        personnel_id: 'p-cancel',
        shift_id: 'sh-am',
        date: '2026-11-13',
        area_id: 'area-base',
        position_id: 'pos-op',
        status: 'cancelled',
        is_locked: false,
        is_manual: true,
        is_confirmed: false,
        is_validated: false,
        is_published: false,
        frozen_by_rule: false,
        original_shift_id: 'sh-am',
        is_extra: true,
        extra_target: 'manual',
        linked_requirement_id: null,
      },
      // Extra activo de p-other en slotB (otro cupo)
      {
        id: 'extra-active-other',
        personnel_id: 'p-other',
        shift_id: 'sh-am',
        date: '2026-11-13',
        area_id: 'area-bodega',
        position_id: 'pos-bod',
        status: 'scheduled',
        is_locked: false,
        is_manual: true,
        is_confirmed: false,
        is_validated: false,
        is_published: false,
        frozen_by_rule: false,
        original_shift_id: 'sh-am',
        is_extra: true,
        extra_target: 'v2_vacancy',
        linked_requirement_id: 'req-ord-b',
      },
    ],
    [
      {
        id: 'req-ord-a',
        date: '2026-11-13',
        area_id: 'area-base',
        position_id: 'pos-op',
        shift_id: 'sh-am',
        required_count: 3,
        is_extra: false,
      },
      {
        id: 'req-ord-b',
        date: '2026-11-13',
        area_id: 'area-bodega',
        position_id: 'pos-bod',
        shift_id: 'sh-am',
        required_count: 1,
        is_extra: false,
      },
    ]
  );

  // Guardar v2 con la vacante de area-base
  const saveRes = await saveV2Schedule(db, {
    startDate: '2026-11-13',
    endDate: '2026-11-13',
    ns22Config: CONFIRMED_NS22,
    v2Result: makeEmptyV2Result({
      remaining_vacancies: [
        makeVacancy('2026-11-13', 'area-base', 'pos-op', 'sh-am', 3, 2),
        makeVacancy('2026-11-13', 'area-bodega', 'pos-bod', 'sh-am', 1, 0),
      ],
    }),
  });
  assert.equal(saveRes.success, true);

  // 1. Intentar asignar a p-other (extra activo en slotB) hacia slotA -> debe rechazarse y conservar su vínculo original
  const conflictAttempt = db.assignExtraInTestEnv({
    date: '2026-11-13',
    shiftId: 'sh-am',
    areaId: 'area-base',
    positionId: 'pos-op',
    personnelId: 'p-other',
    extraTarget: 'v2_vacancy',
    linkedRequirementId: 'req-ord-a',
  });
  assert.equal(conflictAttempt.success, false);
  const pOtherRow = db.assignments.find((a) => a.id === 'extra-active-other')!;
  assert.equal(pOtherRow.linked_requirement_id, 'req-ord-b');
  assert.equal(pOtherRow.area_id, 'area-bodega');

  // 2. Reactivar el extra cancelado de p-cancel para cubrir la vacante de req-ord-a
  const reactivateRes = db.assignExtraInTestEnv({
    date: '2026-11-13',
    shiftId: 'sh-am',
    areaId: 'area-base',
    positionId: 'pos-op',
    personnelId: 'p-cancel',
    extraTarget: 'v2_vacancy',
    linkedRequirementId: 'req-ord-a',
  });
  assert.equal(reactivateRes.success, true);

  // 3. Recargar Planificación Diaria -> req-ord-a cerrada, is_extra = true, fuera del rol ordinario, 1 vez en Bonos
  const dailySummary = evaluateDailyPlanningVacancies({
    date: '2026-11-13',
    ordinaryRequirements: db.requirements.filter((r) => !r.is_extra),
    extraRequirements: db.requirements
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
      })),
    assignments: db.assignments.filter((a) => a.status !== 'cancelled'),
  });

  const slotAStatus = dailySummary.slots.find((s) => s.slot_key === slotA)!;
  assert.equal(slotAStatus.open_falta_count, 0);
  const slotBStatus = dailySummary.slots.find((s) => s.slot_key === slotB)!;
  assert.equal(slotBStatus.open_falta_count, 0); // p-other ya cubría req-ord-b y conservó su vínculo
  assert.equal(dailySummary.total_open_faltas, 0);

  // Rol del trabajador: no debe incluir el turno extra
  assert.equal(db.queryWorkerOrdinaryRoster('p-cancel').length, 0);

  // Reporte de bonos: debe aparecer una sola vez para p-cancel (y una vez para p-other)
  const bonosRows = db.queryBonosExtraReport('2026-11-13', '2026-11-13');
  const pCancelBonos = bonosRows.filter((b) => b.personnel_id === 'p-cancel');
  assert.equal(pCancelBonos.length, 1);
  assert.equal(pCancelBonos[0].is_extra, true);
  assert.equal(pCancelBonos[0].linked_requirement_id, 'req-ord-a');
});

test('ROSTER-07: guardado operativo v2 bloqueado si horario, anclas o régimen NS22 no están confirmados', async () => {
  const unconfirmed: Ns22OperationalConfirmation = {
    confirmed: true,
    scheduleConfirmed: true,
    regimeConfirmed: true,
    titulares: [
      {
        personnelId: 'tit-1',
        name: 'Titular 1',
        anchorStatus: 'provisional',
        confirmedAnchorDate: null,
      },
      {
        personnelId: 'tit-2',
        name: 'Titular 2',
        anchorStatus: 'confirmed',
        confirmedAnchorDate: '2026-11-05',
      },
    ],
  };

  const gate = validateNs22OperationalConfig(unconfirmed);
  assert.equal(gate.ok, false);
  assert.ok(gate.unconfirmedReasons.length >= 1);

  const db = new IsolatedTestRosterDb();
  const res = await saveV2Schedule(db, {
    startDate: '2026-11-14',
    endDate: '2026-11-14',
    ns22Config: unconfirmed,
    v2Result: makeEmptyV2Result(),
  });
  assert.equal(res.success, false);
  assert.equal(res.rolledBack, false);
  assert.equal(res.snapshotId, null);
  assert.equal(db.snapshots.size, 0);
});

test('ROSTER-07: exención de domingos pendiente (regimeConfirmed=false) permite guardar con anclas NS22 confirmadas y mantiene validación de domingos', async () => {
  const withPendingSundayExemption: Ns22OperationalConfirmation = {
    confirmed: true,
    scheduleConfirmed: true,
    regimeConfirmed: false,
    titulares: [
      {
        personnelId: '1e2cc199-7a29-417f-86d3-58143d448654',
        name: 'Marcelo Jara',
        anchorStatus: 'confirmed',
        confirmedAnchorDate: '2026-12-14',
      },
      {
        personnelId: 'dafef0b7-cbab-4eaa-8aec-88ae7b4848d3',
        name: 'Javier López',
        anchorStatus: 'confirmed',
        confirmedAnchorDate: '2026-12-10',
      },
    ],
  };

  const gate = validateNs22OperationalConfig(withPendingSundayExemption);
  assert.equal(gate.ok, true);
  assert.equal(gate.sundayExemptionPending, true);

  const db = new IsolatedTestRosterDb();
  const res = await saveV2Schedule(db, {
    startDate: '2026-12-07',
    endDate: '2026-12-07',
    ns22Config: withPendingSundayExemption,
    v2Result: makeEmptyV2Result(),
  });
  assert.equal(res.success, true);
});
