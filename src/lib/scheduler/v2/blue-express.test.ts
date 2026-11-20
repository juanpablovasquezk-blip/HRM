import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBlueExpressApplyPlan,
  calculateBlueExpressNightStaffingProposal,
  getTwoMonthHistoryWindow,
  validateApprovedTrucksByWeekday,
  type BlueExpressHistoryAssignment,
  type BlueExpressHistoryRequirement,
  type BlueExpressIdentifiers,
} from './index';

const IDS: BlueExpressIdentifiers = {
  areaId: 'area-blue',
  areaName: 'BlueExpress',
  shiftId: 'sh-am00',
  shiftName: 'AM 00',
  conductorPositionId: 'pos-cond',
  conductorPositionName: 'Conductor Camion',
  ayudantePositionId: 'pos-ayud',
  ayudantePositionName: 'Ayudante',
};

function makeDupla(
  date: string,
  index: number,
  opts?: { isExtra?: boolean; cancelled?: boolean; absent?: boolean; attendance?: string | null }
): BlueExpressHistoryAssignment[] {
  const status = opts?.cancelled ? 'cancelled' : 'scheduled';
  const attendance_status = opts?.absent ? 'absent' : opts?.attendance ?? null;
  return [
    {
      id: `c-${date}-${index}`,
      date,
      area_id: IDS.areaId,
      position_id: IDS.conductorPositionId,
      shift_id: IDS.shiftId,
      personnel_id: `cond-${index}`,
      status,
      is_extra: opts?.isExtra ?? false,
      attendance_status,
    },
    {
      id: `a-${date}-${index}`,
      date,
      area_id: IDS.areaId,
      position_id: IDS.ayudantePositionId,
      shift_id: IDS.shiftId,
      personnel_id: `ayud-${index}`,
      status,
      is_extra: opts?.isExtra ?? false,
      attendance_status,
    },
  ];
}

test('ROSTER-09: ventana histórica de 2 meses previos acotada a noches transcurridas', () => {
  const w = getTwoMonthHistoryWindow('2026-12-07', '2026-11-20');
  assert.equal(w.historyStartDate, '2026-10-01');
  assert.equal(w.historyEndDate, '2026-11-30');
  assert.equal(w.elapsedEndDate, '2026-11-19');
});

test('ROSTER-09: tendencia 1 a 3 camiones, día sin historial, extra vigente, turno cancelado y diff en dotación ya generada', () => {
  const historyAssignments: BlueExpressHistoryAssignment[] = [
    // Lunes: últimas 3 ocurrencias con datos coinciden en 3 camiones (2026-11-02, 2026-11-09, 2026-11-16)
    ...makeDupla('2026-10-19', 1),
    ...makeDupla('2026-10-26', 1),
    ...makeDupla('2026-10-26', 2),
    ...makeDupla('2026-11-02', 1),
    ...makeDupla('2026-11-02', 2),
    ...makeDupla('2026-11-02', 3),
    ...makeDupla('2026-11-09', 1),
    ...makeDupla('2026-11-09', 2),
    ...makeDupla('2026-11-09', 3),
    ...makeDupla('2026-11-16', 1),
    ...makeDupla('2026-11-16', 2),
    // En 2026-11-16 el 3er camión viene por extra vigente -> debe contar 3 duplas
    ...makeDupla('2026-11-16', 3, { isExtra: true }),

    // Martes: mezcladas (1, 2, 1, 2) -> empate entre 1 y 2 camiones, elige menor (1)
    ...makeDupla('2026-10-27', 1),
    ...makeDupla('2026-11-03', 1),
    ...makeDupla('2026-11-03', 2),
    ...makeDupla('2026-11-10', 1),
    ...makeDupla('2026-11-17', 1),
    ...makeDupla('2026-11-17', 2),

    // Miércoles: 2 duplas vigentes + 1 turno cancelado (no suma dupla, se reporta separado) + 1 conductor suelto (dupla incompleta)
    ...makeDupla('2026-11-18', 1),
    ...makeDupla('2026-11-18', 2),
    ...makeDupla('2026-11-18', 3, { cancelled: true }),
    {
      id: 'c-incomp',
      date: '2026-11-18',
      area_id: IDS.areaId,
      position_id: IDS.conductorPositionId,
      shift_id: IDS.shiftId,
      personnel_id: 'cond-suelto',
      status: 'scheduled',
      is_extra: false,
      attendance_status: null,
    },

    // Jueves: solo ausencia/cancelación sobre requerimiento existente -> 0 confirmados (propone mínimo 1)
    ...makeDupla('2026-11-19', 1, { cancelled: true }),

    // Noche futura (2026-11-20 = referenceDate): NO debe incluirse por no haber transcurrido
    ...makeDupla('2026-11-20', 1),
    ...makeDupla('2026-11-20', 2),
    ...makeDupla('2026-11-20', 3),
    // Viernes, Sábado y Domingo: sin historial -> mínimo 1 camión
  ];

  const historyRequirements: BlueExpressHistoryRequirement[] = [
    {
      id: 'req-thu',
      date: '2026-11-19',
      area_id: IDS.areaId,
      position_id: IDS.conductorPositionId,
      shift_id: IDS.shiftId,
      required_count: 1,
      is_extra: false,
    },
  ];

  // Dotación ya generada para 2026-12-07 (Lunes) con 1 conductor y 1 ayudante -> debe sugerir actualizar a 3
  const targetExistingRequirements: BlueExpressHistoryRequirement[] = [
    {
      id: 't-cond',
      date: '2026-12-07',
      area_id: IDS.areaId,
      position_id: IDS.conductorPositionId,
      shift_id: IDS.shiftId,
      required_count: 1,
      is_extra: false,
    },
    {
      id: 't-ayud',
      date: '2026-12-07',
      area_id: IDS.areaId,
      position_id: IDS.ayudantePositionId,
      shift_id: IDS.shiftId,
      required_count: 1,
      is_extra: false,
    },
  ];

  const proposal = calculateBlueExpressNightStaffingProposal({
    identifiers: IDS,
    targetStartDate: '2026-12-07',
    targetEndDate: '2027-01-03',
    referenceDate: '2026-11-20',
    historyAssignments,
    historyRequirements,
    targetExistingRequirements,
  });

  assert.equal(proposal.read_only, true);
  assert.equal(proposal.source_mode, 'roster_duplas_estimate');
  assert.ok(proposal.estimate_notice);

  const lunes = proposal.weekdays.find((w) => w.isoWeekday === 1)!;
  assert.equal(lunes.trend_method, 'last_three_match');
  assert.equal(lunes.recommended_trucks, 3);
  assert.equal(lunes.proposed_conductores, 3);
  assert.equal(lunes.proposed_ayudantes, 3);

  const martes = proposal.weekdays.find((w) => w.isoWeekday === 2)!;
  assert.equal(martes.trend_method, 'two_month_mode_min_tie');
  assert.equal(martes.recommended_trucks, 1);

  const miercoles = proposal.weekdays.find((w) => w.isoWeekday === 3)!;
  assert.equal(miercoles.recommended_trucks, 2);
  assert.equal(miercoles.cancellations_total, 2);
  assert.equal(miercoles.incomplete_duplas_total, 1);

  const jueves = proposal.weekdays.find((w) => w.isoWeekday === 4)!;
  assert.equal(jueves.nights_zero_confirmed, 1);
  assert.equal(jueves.recommended_trucks, 1);

  const domingo = proposal.weekdays.find((w) => w.isoWeekday === 7)!;
  assert.equal(domingo.nights_with_data, 0);
  assert.equal(domingo.trend_method, 'no_history_default_min');
  assert.equal(domingo.recommended_trucks, 1);

  assert.equal(proposal.totals.active_extras_included, 2);
  assert.ok(proposal.totals.unconfirmed_attendance > 0);
  assert.equal(proposal.target_range_already_generated, true);
  const dec07Updates = proposal.target_range_updates.filter((u) => u.date === '2026-12-07');
  assert.equal(dec07Updates.length, 2);
  assert.equal(dec07Updates[0].current_required_count, 1);
  assert.equal(dec07Updates[0].proposed_required_count, 3);
});

test('ROSTER-09: aplicar dotación nocturna AM 00 deja 1 conductor y 1 ayudante el jueves 10 de diciembre conservando 4 cupos diurnos', () => {
  const proposal = calculateBlueExpressNightStaffingProposal({
    identifiers: IDS,
    targetStartDate: '2026-12-07',
    targetEndDate: '2027-01-03',
    referenceDate: '2026-11-20',
    historyAssignments: [
      ...makeDupla('2026-11-05', 1),
      ...makeDupla('2026-11-12', 1),
      ...makeDupla('2026-11-19', 1),
    ],
    historyRequirements: [],
    targetExistingRequirements: [],
  });

  // Simular tabla shift_requirements con 4 cupos diurnos existentes el jueves 2026-12-10
  const store: Array<{
    date: string;
    area_id: string;
    position_id: string;
    shift_id: string;
    required_count: number;
    is_extra: boolean;
  }> = [
    { date: '2026-12-10', area_id: IDS.areaId, position_id: IDS.conductorPositionId, shift_id: 'sh-am08', required_count: 2, is_extra: false },
    { date: '2026-12-10', area_id: IDS.areaId, position_id: IDS.ayudantePositionId, shift_id: 'sh-am08', required_count: 2, is_extra: false },
    { date: '2026-12-10', area_id: IDS.areaId, position_id: IDS.conductorPositionId, shift_id: 'sh-pm14', required_count: 1, is_extra: false },
    { date: '2026-12-10', area_id: IDS.areaId, position_id: IDS.ayudantePositionId, shift_id: 'sh-pm14', required_count: 1, is_extra: false },
    // Cupo nocturno previo desactualizado (ej. 2) que debe quedar en 1
    { date: '2026-12-10', area_id: IDS.areaId, position_id: IDS.conductorPositionId, shift_id: IDS.shiftId, required_count: 2, is_extra: false },
  ];

  const upserts = buildBlueExpressApplyPlan(proposal);
  for (const row of upserts) {
    const idx = store.findIndex(
      (r) =>
        r.date === row.date &&
        r.area_id === row.area_id &&
        r.position_id === row.position_id &&
        r.shift_id === row.shift_id &&
        r.is_extra === row.is_extra
    );
    if (idx >= 0) store[idx] = { ...row };
    else store.push({ ...row });
  }

  const dec10Day = store.filter((r) => r.date === '2026-12-10' && r.shift_id !== IDS.shiftId);
  assert.equal(dec10Day.length, 4);

  const dec10NightCond = store.find(
    (r) => r.date === '2026-12-10' && r.shift_id === IDS.shiftId && r.position_id === IDS.conductorPositionId
  );
  const dec10NightAyud = store.find(
    (r) => r.date === '2026-12-10' && r.shift_id === IDS.shiftId && r.position_id === IDS.ayudantePositionId
  );
  assert.equal(dec10NightCond?.required_count, 1);
  assert.equal(dec10NightAyud?.required_count, 1);
});

test('ROSTER-09: historial recomienda 3 los martes y usuario aprueba 2 -> 48 conductor / 48 ayudante, jueves 10 con 1 y conserva diurnos y extras', () => {
  const proposal = calculateBlueExpressNightStaffingProposal({
    identifiers: IDS,
    targetStartDate: '2026-12-07',
    targetEndDate: '2027-01-03',
    referenceDate: '2026-11-20',
    historyAssignments: [
      // Martes: últimas 3 ocurrencias recomiendan 3 camiones
      ...makeDupla('2026-11-03', 1),
      ...makeDupla('2026-11-03', 2),
      ...makeDupla('2026-11-03', 3),
      ...makeDupla('2026-11-10', 1),
      ...makeDupla('2026-11-10', 2),
      ...makeDupla('2026-11-10', 3),
      ...makeDupla('2026-11-17', 1),
      ...makeDupla('2026-11-17', 2),
      ...makeDupla('2026-11-17', 3),
    ],
    historyRequirements: [],
    targetExistingRequirements: [],
  });

  const martes = proposal.weekdays.find((w) => w.isoWeekday === 2)!;
  assert.equal(martes.recommended_trucks, 3);

  // Pauta aprobada: Lunes 3, Martes 2, Miércoles 2, Jueves 1, Viernes 2, Sábado 1, Domingo 1
  const approvedByWeekday: Record<number, number> = {
    1: 3,
    2: 2,
    3: 2,
    4: 1,
    5: 2,
    6: 1,
    7: 1,
  };
  const validation = validateApprovedTrucksByWeekday(approvedByWeekday);
  assert.equal(validation.ok, true);
  assert.equal(validateApprovedTrucksByWeekday({ ...approvedByWeekday, 2: 0 }).ok, false);
  assert.equal(validateApprovedTrucksByWeekday({ ...approvedByWeekday, 2: 4 }).ok, false);

  const upserts = buildBlueExpressApplyPlan(proposal, approvedByWeekday);
  const store: Array<{
    date: string;
    area_id: string;
    position_id: string;
    shift_id: string;
    required_count: number;
    is_extra: boolean;
  }> = [
    { date: '2026-12-10', area_id: IDS.areaId, position_id: IDS.conductorPositionId, shift_id: 'sh-am08', required_count: 2, is_extra: false },
    { date: '2026-12-10', area_id: IDS.areaId, position_id: IDS.ayudantePositionId, shift_id: 'sh-am08', required_count: 2, is_extra: false },
    { date: '2026-12-10', area_id: IDS.areaId, position_id: IDS.conductorPositionId, shift_id: 'sh-pm14', required_count: 1, is_extra: false },
    { date: '2026-12-10', area_id: IDS.areaId, position_id: IDS.ayudantePositionId, shift_id: 'sh-pm14', required_count: 1, is_extra: false },
    { date: '2026-12-10', area_id: IDS.areaId, position_id: IDS.conductorPositionId, shift_id: IDS.shiftId, required_count: 1, is_extra: true },
  ];

  for (const row of upserts) {
    const idx = store.findIndex(
      (r) =>
        r.date === row.date &&
        r.area_id === row.area_id &&
        r.position_id === row.position_id &&
        r.shift_id === row.shift_id &&
        r.is_extra === row.is_extra
    );
    if (idx >= 0) store[idx] = { ...row };
    else store.push({ ...row });
  }

  const nightCondTotal = store
    .filter((r) => r.shift_id === IDS.shiftId && !r.is_extra && r.position_id === IDS.conductorPositionId)
    .reduce((sum, r) => sum + r.required_count, 0);
  const nightAyudTotal = store
    .filter((r) => r.shift_id === IDS.shiftId && !r.is_extra && r.position_id === IDS.ayudantePositionId)
    .reduce((sum, r) => sum + r.required_count, 0);

  assert.equal(nightCondTotal, 48);
  assert.equal(nightAyudTotal, 48);

  const dec10Cond = store.find(
    (r) => r.date === '2026-12-10' && r.shift_id === IDS.shiftId && !r.is_extra && r.position_id === IDS.conductorPositionId
  );
  const dec10Ayud = store.find(
    (r) => r.date === '2026-12-10' && r.shift_id === IDS.shiftId && !r.is_extra && r.position_id === IDS.ayudantePositionId
  );
  assert.equal(dec10Cond?.required_count, 1);
  assert.equal(dec10Ayud?.required_count, 1);

  // Diurnos y extras conservados
  assert.equal(store.filter((r) => r.date === '2026-12-10' && r.shift_id !== IDS.shiftId && !r.is_extra).length, 4);
  assert.equal(store.filter((r) => r.date === '2026-12-10' && r.shift_id === IDS.shiftId && r.is_extra).length, 1);
});
