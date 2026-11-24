import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareDotacionSlots } from './dotacion';
import { checkMinRestBetweenShifts, getShiftOccupiedDates } from './jornada';
import { scheduleAirportNs22 } from './aeropuerto-ns22';
import type {
  Ns22ShiftDefinition,
  Ns22TitularConfig,
  PersonnelScheduleProfile,
  RawExistingAssignment,
  RawLeaveRecord,
  RawShiftRequirement,
  ScheduledShiftInterval,
} from './types';

const ns22Shift: Ns22ShiftDefinition = {
  shift_id: 'shift-ns22',
  area_id: 'area-aero',
  position_id: 'pos-aero',
  shift_start: '22:00',
  shift_end: '07:00',
  duration_hours: 9,
};

const titulares: Ns22TitularConfig[] = [
  {
    personnel_id: 'titular-a',
    first_name: 'Titular A',
    anchor_date: '2026-10-29',
    cycle_offset: 0,
    confirmed_4x4_regime: true,
  },
  {
    personnel_id: 'titular-b',
    first_name: 'Titular B',
    anchor_date: '2026-10-29',
    cycle_offset: 4,
    confirmed_4x4_regime: true,
  },
];

const airportReplacements: PersonnelScheduleProfile[] = [
  {
    personnel_id: 'op-aero-1',
    first_name: 'Operador Aero 1',
    main_position: 'pos-aero',
    main_position_name: 'Operador Aeropuerto',
    rotation_pattern: '5x2',
  },
  {
    personnel_id: 'op-aero-2',
    first_name: 'Operador Aero 2',
    main_position: 'pos-aero',
    main_position_name: 'Operador Aeropuerto',
    rotation_pattern: '5x2',
  },
];

test('ROSTER-04: cruce de mes conserva ciclo 4x4 continuo, desfase 22:00-07:00 y día saliente', () => {
  const result = scheduleAirportNs22({
    startDate: '2026-10-29',
    endDate: '2026-11-05',
    titulares,
    shiftDef: ns22Shift,
    replacementCandidates: airportReplacements,
  });

  assert.equal(result.vacancies.length, 0);
  assert.equal(result.assignments.length, 8);

  const aNights = result.assignments
    .filter((a) => a.personnel_id === 'titular-a')
    .map((a) => a.date);
  const bNights = result.assignments
    .filter((a) => a.personnel_id === 'titular-b')
    .map((a) => a.date);

  assert.deepEqual(aNights, ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  assert.deepEqual(bNights, ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);

  // Verifica horario 22:00-07:00 y día saliente en occupied_dates (ej. 2026-10-31 -> 2026-11-01)
  const oct31 = result.assignments.find((a) => a.date === '2026-10-31')!;
  assert.equal(oct31.shift_start, '22:00');
  assert.equal(oct31.shift_end, '07:00');
  assert.deepEqual(oct31.occupied_dates, ['2026-10-31', '2026-11-01']);
});

test('ROSTER-04: ausencia de una noche se cubre sin mover el ciclo ni el ancla del titular', () => {
  const oneNightLeave: RawLeaveRecord[] = [
    {
      personnel_id: 'titular-b',
      type: 'personal',
      start_date: '2026-11-02',
      end_date: '2026-11-02',
      status: 'approved',
    },
  ];

  // Evaluamos dos ciclos completos hasta 2026-11-13 para verificar que el ancla del titular B no se mueve
  const result = scheduleAirportNs22({
    startDate: '2026-10-29',
    endDate: '2026-11-13',
    titulares,
    shiftDef: ns22Shift,
    replacementCandidates: airportReplacements,
    approvedLeaves: oneNightLeave,
  });

  assert.equal(result.vacancies.length, 0);

  const nov02 = result.assignments.find((a) => a.date === '2026-11-02')!;
  assert.equal(nov02.role, 'replacement');
  assert.equal(nov02.replaces_titular_id, 'titular-b');

  // Titular B mantiene sus noches restantes y su siguiente ciclo (10..13 nov) intactos
  const bNights = result.assignments
    .filter((a) => a.personnel_id === 'titular-b')
    .map((a) => a.date);
  assert.deepEqual(bNights, [
    '2026-11-03',
    '2026-11-04',
    '2026-11-05',
    '2026-11-10',
    '2026-11-11',
    '2026-11-12',
    '2026-11-13',
  ]);
});

test('ROSTER-04: ausencia de cuatro noches prefiere bloque de cuatro con un mismo operador habilitado', () => {
  const fourNightSickLeave: RawLeaveRecord[] = [
    {
      personnel_id: 'titular-b',
      type: 'sick',
      start_date: '2026-11-02',
      end_date: '2026-11-05',
      status: 'approved',
    },
  ];

  // op-aero-1 ya tiene 1 turno el domingo 01, así que solo puede tomar un bloque compatible si no rompe reglas.
  // Aquí op-aero-2 está completamente libre y op-aero-1 también, así que el bloque de 4 debe ir completo a un solo operador.
  const result = scheduleAirportNs22({
    startDate: '2026-10-29',
    endDate: '2026-11-13',
    titulares,
    shiftDef: ns22Shift,
    replacementCandidates: airportReplacements,
    approvedLeaves: fourNightSickLeave,
  });

  assert.equal(result.vacancies.length, 0);

  const replacements = result.assignments.filter((a) => a.role === 'replacement');
  assert.equal(replacements.length, 4);
  const uniqueReplacers = new Set(replacements.map((r) => r.personnel_id));
  assert.equal(uniqueReplacers.size, 1);

  // Siguiente ciclo de Titular B (10..13 nov) sigue intacto en su ancla original
  const bSecondCycle = result.assignments
    .filter((a) => a.personnel_id === 'titular-b')
    .map((a) => a.date);
  assert.deepEqual(bSecondCycle, ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
});

test('ROSTER-04: reemplazo rechazado por descanso insuficiente (<12h) reporta vacante', () => {
  const oneNightLeave: RawLeaveRecord[] = [
    {
      personnel_id: 'titular-b',
      type: 'vacation',
      start_date: '2026-11-02',
      end_date: '2026-11-02',
      status: 'approved',
    },
  ];

  // Único candidato habilitado tiene un turno el 2026-11-02 de 08:00 a 16:00 (solo 6h antes de las 22:00 -> <12h)
  const existingShiftsByPerson = new Map<string, ScheduledShiftInterval[]>([
    [
      'op-aero-1',
      [{ date: '2026-11-02', shift_start: '08:00', shift_end: '16:00', duration_hours: 8 }],
    ],
  ]);

  const result = scheduleAirportNs22({
    startDate: '2026-11-02',
    endDate: '2026-11-05',
    titulares: [
      { ...titulares[0], confirmed_4x4_regime: false }, // también verifica aviso de régimen
      titulares[1],
    ],
    shiftDef: ns22Shift,
    replacementCandidates: [airportReplacements[0]],
    existingShiftsByPerson,
    approvedLeaves: oneNightLeave,
  });

  assert.equal(result.vacancies.length, 1);
  assert.equal(result.vacancies[0].date, '2026-11-02');
  assert.equal(result.vacancies[0].missing_titular_id, 'titular-b');
  assert.equal(result.vacancies[0].rejected_candidates.length, 1);
  assert.match(result.vacancies[0].rejected_candidates[0].reasons[0], /Descanso insuficiente/);

  // Aviso de régimen 4x4 pendiente de confirmar para titular-a
  assert.ok(result.verification_notices.some((n) => n.includes('Titular A')));
});

function buildNs22Reqs(dates: string[]): RawShiftRequirement[] {
  return dates.map((d, idx) => ({
    id: `req-ns22-${idx}`,
    date: d,
    area_id: ns22Shift.area_id,
    position_id: ns22Shift.position_id,
    shift_id: ns22Shift.shift_id,
    required_count: 1,
    priority: 'HIGH',
    is_extra: false,
    shift: {
      name: 'NS 22',
      start_time: '22:00',
      end_time: '07:00',
      duration_hours: 9,
    },
  }));
}

test('ROSTER-04: titular con NS22 protegido conserva su asignación sin duplicar y noche sin requerimiento no genera nada', () => {
  // Requerimientos solo para 02, 03, 04 nov; el 05 nov NO tiene requerimiento
  const reqs = buildNs22Reqs(['2026-11-02', '2026-11-03', '2026-11-04']);
  const protectedAssignments: RawExistingAssignment[] = [
    {
      id: 'prot-titular-02',
      personnel_id: 'titular-b',
      date: '2026-11-02',
      area_id: ns22Shift.area_id,
      position_id: ns22Shift.position_id,
      shift_id: ns22Shift.shift_id,
      is_manual: true,
      is_extra: false,
    },
  ];

  const prepared = prepareDotacionSlots(reqs, protectedAssignments, {
    referenceDate: new Date('2026-10-20T12:00:00Z'),
  });

  const result = scheduleAirportNs22({
    startDate: '2026-11-02',
    endDate: '2026-11-05',
    titulares,
    shiftDef: ns22Shift,
    replacementCandidates: airportReplacements,
    ns22Slots: prepared.ordinarySlots,
    protectedAssignments: prepared.protectedOrdinaryAssignments,
  });

  // 02 nov conservado como protegido (no duplicado en assignments)
  assert.equal(result.preserved_protected.length, 1);
  assert.equal(result.preserved_protected[0].date, '2026-11-02');
  assert.equal(result.preserved_protected[0].role, 'titular');

  // Solo 03 y 04 nov generados; 05 nov sin requerimiento no genera ni asignación ni vacante
  assert.deepEqual(
    result.assignments.map((a) => a.date),
    ['2026-11-03', '2026-11-04']
  );
  assert.equal(result.vacancies.length, 0);
});

test('ROSTER-04: ausencia ya cubierta por reemplazo protegido solo genera reemplazos para los cupos restantes', () => {
  const reqs = buildNs22Reqs(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
  const fourNightLeave: RawLeaveRecord[] = [
    {
      personnel_id: 'titular-b',
      type: 'sick',
      start_date: '2026-11-02',
      end_date: '2026-11-05',
      status: 'approved',
    },
  ];
  const protectedReplacement: RawExistingAssignment[] = [
    {
      id: 'prot-repl-03',
      personnel_id: 'op-aero-2',
      date: '2026-11-03',
      area_id: ns22Shift.area_id,
      position_id: ns22Shift.position_id,
      shift_id: ns22Shift.shift_id,
      is_locked: true,
      is_extra: false,
    },
  ];

  const prepared = prepareDotacionSlots(reqs, protectedReplacement, {
    referenceDate: new Date('2026-10-20T12:00:00Z'),
  });

  const result = scheduleAirportNs22({
    startDate: '2026-11-02',
    endDate: '2026-11-05',
    titulares,
    shiftDef: ns22Shift,
    replacementCandidates: airportReplacements,
    ns22Slots: prepared.ordinarySlots,
    protectedAssignments: prepared.protectedOrdinaryAssignments,
    approvedLeaves: fourNightLeave,
  });

  assert.equal(result.preserved_protected.length, 1);
  assert.equal(result.preserved_protected[0].date, '2026-11-03');
  assert.equal(result.preserved_protected[0].role, 'replacement');

  // Solo genera reemplazos para 02, 04 y 05 nov (los 3 cupos que seguían vacantes)
  assert.deepEqual(
    result.assignments.map((a) => a.date),
    ['2026-11-02', '2026-11-04', '2026-11-05']
  );
  assert.equal(result.vacancies.length, 0);
});

test('ROSTER-04: turno protegido del titular en conflicto con NS22 se conserva, informa conflicto y no mueve el ancla', () => {
  const reqs = buildNs22Reqs([
    '2026-11-02',
    '2026-11-03',
    '2026-11-04',
    '2026-11-05',
    '2026-11-10',
    '2026-11-11',
    '2026-11-12',
    '2026-11-13',
  ]);
  const conflictingProtected: RawExistingAssignment[] = [
    {
      id: 'prot-conflict',
      personnel_id: 'titular-b',
      date: '2026-11-02',
      area_id: 'area-otra',
      position_id: 'pos-otro',
      shift_id: 'shift-am08',
      shift_start: '08:00',
      shift_end: '16:00',
      duration_hours: 8,
      is_manual: true,
      is_extra: false,
    },
  ];

  const prepared = prepareDotacionSlots(reqs, conflictingProtected, {
    referenceDate: new Date('2026-10-20T12:00:00Z'),
  });

  const result = scheduleAirportNs22({
    startDate: '2026-11-02',
    endDate: '2026-11-13',
    titulares,
    shiftDef: ns22Shift,
    replacementCandidates: airportReplacements,
    ns22Slots: prepared.ordinarySlots,
    protectedAssignments: prepared.protectedOrdinaryAssignments,
  });

  // Conflicto informado para 2026-11-02
  assert.equal(result.titular_conflicts.length, 1);
  assert.equal(result.titular_conflicts[0].date, '2026-11-02');
  assert.equal(result.titular_conflicts[0].personnel_id, 'titular-b');

  // El 02 nov se cubre con reemplazo y el ciclo siguiente del titular (10..13 nov) conserva su ancla
  const nov02 = result.assignments.find((a) => a.date === '2026-11-02')!;
  assert.equal(nov02.role, 'replacement');

  const bNights = result.assignments
    .filter((a) => a.personnel_id === 'titular-b')
    .map((a) => a.date);
  assert.deepEqual(bNights, [
    '2026-11-03',
    '2026-11-04',
    '2026-11-05',
    '2026-11-10',
    '2026-11-11',
    '2026-11-12',
    '2026-11-13',
  ]);
});

test('ROSTER-07: NS22 sin duration_hours computa 8h (22:00-07:00 con 1h colación) y conserva salida 07:00 para 11h vs 12h de descanso', () => {
  const ns22WithoutDuration: Ns22ShiftDefinition = {
    shift_id: 'shift-ns22',
    area_id: 'area-aero',
    position_id: 'pos-op',
    shift_start: '22:00',
    shift_end: '07:00',
  };

  const titulares: Ns22TitularConfig[] = [
    {
      personnel_id: 'titular-a',
      first_name: 'Titular A',
      anchor_date: '2026-11-01',
      confirmed_4x4_regime: true,
    },
    {
      personnel_id: 'titular-b',
      first_name: 'Titular B',
      anchor_date: '2026-11-05',
      confirmed_4x4_regime: true,
    },
  ];

  const result = scheduleAirportNs22({
    startDate: '2026-11-01',
    endDate: '2026-11-02',
    shiftDef: ns22WithoutDuration,
    titulares,
    replacementCandidates: [],
    approvedLeaves: [],
    protectedAssignments: [],
  });

  assert.equal(result.assignments.length, 2);
  for (const a of result.assignments) {
    assert.equal(a.duration_hours, 8);
    assert.equal(a.shift_start, '22:00');
    assert.equal(a.shift_end, '07:00');
  }

  const ns22Interval: ScheduledShiftInterval = {
    date: result.assignments[0].date,
    shift_start: result.assignments[0].shift_start,
    shift_end: result.assignments[0].shift_end,
    duration_hours: result.assignments[0].duration_hours,
  };
  assert.deepEqual(getShiftOccupiedDates(ns22Interval), ['2026-11-01', '2026-11-02']);

  const titularProfile: PersonnelScheduleProfile = {
    personnel_id: 'titular-a',
    main_position: 'pos-op',
  };
  const rest11h = checkMinRestBetweenShifts(
    titularProfile,
    {
      date: '2026-11-02',
      shift_start: '18:00',
      shift_end: '22:00',
      duration_hours: 4,
    },
    [ns22Interval]
  );
  assert.ok(rest11h !== null);

  const rest12h = checkMinRestBetweenShifts(
    titularProfile,
    {
      date: '2026-11-02',
      shift_start: '19:00',
      shift_end: '23:00',
      duration_hours: 4,
    },
    [ns22Interval]
  );
  assert.equal(rest12h, null);
});

test('NS22 titular disponible con reemplazante libre: asigna al titular y no desplaza por ancla provisional', () => {
  const shiftDef: Ns22ShiftDefinition = {
    shift_id: 'shift-ns22',
    area_id: 'area-aero',
    position_id: 'pos-op',
    shift_start: '22:00',
    shift_end: '07:00',
    duration_hours: 8,
  };

  const titulares: Ns22TitularConfig[] = [
    {
      personnel_id: 'titular-marcelo',
      first_name: 'Marcelo',
      anchor_date: '2026-11-01',
      confirmed_4x4_regime: false,
    },
    {
      personnel_id: 'titular-javier',
      first_name: 'Javier',
      anchor_date: '2026-11-05',
      confirmed_4x4_regime: false,
    },
  ];

  const freeReplacement: PersonnelScheduleProfile = {
    personnel_id: 'rep-marco',
    full_name: 'Marco Antonio',
    main_position: 'pos-op',
    secondary_positions: [],
    rotation_pattern: '5X2',
  };

  const result = scheduleAirportNs22({
    startDate: '2026-11-01',
    endDate: '2026-11-01',
    shiftDef,
    titulares,
    replacementCandidates: [freeReplacement],
    approvedLeaves: [],
    protectedAssignments: [],
  });

  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].personnel_id, 'titular-marcelo');
  assert.equal(result.assignments[0].role, 'titular');
  assert.equal(result.vacancies.length, 0);
});

test('NS22 titular ausente con reemplazante libre: cubre reemplazante sin desplazar el ciclo 4x4', () => {
  const shiftDef: Ns22ShiftDefinition = {
    shift_id: 'shift-ns22',
    area_id: 'area-aero',
    position_id: 'pos-op',
    shift_start: '22:00',
    shift_end: '07:00',
    duration_hours: 8,
  };

  const titulares: Ns22TitularConfig[] = [
    {
      personnel_id: 'titular-marcelo',
      first_name: 'Marcelo',
      anchor_date: '2026-11-01',
      confirmed_4x4_regime: true,
    },
    {
      personnel_id: 'titular-javier',
      first_name: 'Javier',
      anchor_date: '2026-11-05',
      confirmed_4x4_regime: true,
    },
  ];

  const freeReplacement: PersonnelScheduleProfile = {
    personnel_id: 'rep-marco',
    full_name: 'Marco Antonio',
    main_position: 'pos-op',
    secondary_positions: [],
    rotation_pattern: '5X2',
  };

  const result = scheduleAirportNs22({
    startDate: '2026-11-01',
    endDate: '2026-11-05',
    shiftDef,
    titulares,
    replacementCandidates: [freeReplacement],
    approvedLeaves: [
      {
        personnel_id: 'titular-marcelo',
        start_date: '2026-11-03',
        end_date: '2026-11-03',
        status: 'approved',
        type: 'administrative',
      },
    ],
    protectedAssignments: [],
  });

  const byDate = new Map(result.assignments.map((a) => [a.date, a]));
  assert.equal(byDate.get('2026-11-01')?.personnel_id, 'titular-marcelo');
  assert.equal(byDate.get('2026-11-01')?.role, 'titular');
  assert.equal(byDate.get('2026-11-02')?.personnel_id, 'rep-marco');
  assert.equal(byDate.get('2026-11-02')?.role, 'replacement');
  assert.equal(byDate.get('2026-11-02')?.replaces_titular_id, 'titular-marcelo');
  assert.equal(byDate.get('2026-11-03')?.personnel_id, 'rep-marco');
  assert.equal(byDate.get('2026-11-03')?.role, 'replacement');
  assert.equal(byDate.get('2026-11-03')?.replaces_titular_id, 'titular-marcelo');
  assert.equal(byDate.get('2026-11-04')?.personnel_id, 'titular-marcelo');
  assert.equal(byDate.get('2026-11-04')?.role, 'titular');
  assert.equal(byDate.get('2026-11-05')?.personnel_id, 'titular-javier');
  assert.equal(byDate.get('2026-11-05')?.role, 'titular');
});
