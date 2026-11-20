import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleCrossArea } from './cobertura';
import type {
  Ns22ShiftDefinition,
  Ns22TitularConfig,
  PersonnelScheduleProfile,
  RawExistingAssignment,
  RawLeaveRecord,
  RawShiftRequirement,
} from './types';

const REF_DATE = new Date('2026-11-01T12:00:00Z');

test('ROSTER-05: cupo crítico secundario desplaza cupo normal principal y etiquetas día/noche no excluyen', () => {
  const requirements: RawShiftRequirement[] = [
    {
      id: 'req-normal-main',
      date: '2026-11-10',
      area_id: 'area-base',
      position_id: 'pos-bodega',
      shift_id: 'shift-am08',
      required_count: 1,
      priority: 'NORMAL',
      is_extra: false,
      shift: { name: 'AM 08', start_time: '08:00', end_time: '16:00', duration_hours: 8 },
    },
    {
      id: 'req-crit-sec',
      date: '2026-11-10',
      area_id: 'area-atrex',
      position_id: 'pos-grua',
      shift_id: 'shift-ns22',
      required_count: 1,
      priority: 'CRITICAL',
      is_extra: false,
      shift: { name: 'NS 22', start_time: '22:00', end_time: '07:00', duration_hours: 9 },
    },
  ];

  const polyWorker: PersonnelScheduleProfile = {
    personnel_id: 'op-poly',
    first_name: 'Polivalente',
    main_position: 'pos-bodega',
    secondary_positions: ['pos-grua'],
    avoids_night: true, // Etiqueta noche no debe excluirlo
    rotation_pattern: '5x2',
  };

  const result = scheduleCrossArea({
    startDate: '2026-11-10',
    endDate: '2026-11-10',
    rawRequirements: requirements,
    existingAssignments: [],
    personnel: [polyWorker],
    referenceDate: REF_DATE,
  });

  assert.equal(result.ordinary_assignments.length, 1);
  assert.equal(result.ordinary_assignments[0].position_id, 'pos-grua');
  assert.equal(result.ordinary_assignments[0].match_type, 'secondary');
  assert.equal(result.stats.covered_secondary_count, 1);
  assert.equal(result.stats.total_vacancies, 1);
});

test('ROSTER-05: optimización conjunta aprovecha polivalencia para cubrir vacante adicional y favorece principal a igual prioridad', () => {
  const requirements: RawShiftRequirement[] = [
    {
      id: 'req-bodega',
      date: '2026-11-11',
      area_id: 'area-base',
      position_id: 'pos-bodega',
      shift_id: 'shift-am08',
      required_count: 1,
      priority: 'NORMAL',
      is_extra: false,
      shift: { name: 'AM 08', start_time: '08:00', end_time: '16:00', duration_hours: 8 },
    },
    {
      id: 'req-grua',
      date: '2026-11-11',
      area_id: 'area-atrex',
      position_id: 'pos-grua',
      shift_id: 'shift-am08',
      required_count: 1,
      priority: 'NORMAL',
      is_extra: false,
      shift: { name: 'AM 08', start_time: '08:00', end_time: '16:00', duration_hours: 8 },
    },
  ];

  const personnel: PersonnelScheduleProfile[] = [
    {
      personnel_id: 'op-poly',
      first_name: 'Polivalente',
      main_position: 'pos-bodega',
      secondary_positions: ['pos-grua'],
      rotation_pattern: '5x2',
    },
    {
      personnel_id: 'op-spec',
      first_name: 'Especialista Bodega',
      main_position: 'pos-bodega',
      secondary_positions: [],
      rotation_pattern: '5x2',
    },
  ];

  const result = scheduleCrossArea({
    startDate: '2026-11-11',
    endDate: '2026-11-11',
    rawRequirements: requirements,
    existingAssignments: [],
    personnel,
    referenceDate: REF_DATE,
  });

  // Ambos cupos cubiertos (2/2) aprovechando la polivalencia de op-poly para pos-grua
  assert.equal(result.stats.total_required, 2);
  assert.equal(result.stats.total_covered, 2);
  assert.equal(result.stats.total_vacancies, 0);

  const gruaAss = result.ordinary_assignments.find((a) => a.position_id === 'pos-grua')!;
  const bodegaAss = result.ordinary_assignments.find((a) => a.position_id === 'pos-bodega')!;
  assert.equal(gruaAss.personnel_id, 'op-poly');
  assert.equal(bodegaAss.personnel_id, 'op-spec');
  assert.equal(bodegaAss.match_type, 'primary');
});

test('ROSTER-05: filtro incluye secundarios, respeta compromisos protegidos fuera del filtro y ejecuta refuerzos después', () => {
  const requirements: RawShiftRequirement[] = [
    {
      id: 'req-grua-12',
      date: '2026-11-12',
      area_id: 'area-atrex',
      position_id: 'pos-grua',
      shift_id: 'shift-am07',
      required_count: 1,
      priority: 'HIGH',
      is_extra: false,
      shift: { name: 'AM 07', start_time: '07:00', end_time: '15:00', duration_hours: 8 },
    },
    {
      id: 'req-grua-13',
      date: '2026-11-13',
      area_id: 'area-atrex',
      position_id: 'pos-grua',
      shift_id: 'shift-am07',
      required_count: 1,
      priority: 'HIGH',
      is_extra: false,
      shift: { name: 'AM 07', start_time: '07:00', end_time: '15:00', duration_hours: 8 },
    },
  ];

  // Compromiso protegido de op-poly en area-base / pos-bodega el 2026-11-12 (fuera del filtro)
  const existing: RawExistingAssignment[] = [
    {
      id: 'prot-outside',
      personnel_id: 'op-poly',
      date: '2026-11-12',
      area_id: 'area-base',
      position_id: 'pos-bodega',
      shift_id: 'shift-am08',
      shift_start: '08:00',
      shift_end: '16:00',
      duration_hours: 8,
      is_manual: true,
      is_extra: false,
    },
  ];

  const polyWorker: PersonnelScheduleProfile = {
    personnel_id: 'op-poly',
    first_name: 'Polivalente',
    main_position: 'pos-bodega',
    secondary_positions: ['pos-grua'],
    area_id: 'area-base',
    rotation_pattern: '5x2',
  };

  const result = scheduleCrossArea({
    startDate: '2026-11-12',
    endDate: '2026-11-14',
    rawRequirements: requirements,
    existingAssignments: existing,
    personnel: [polyWorker],
    areaFilter: 'area-atrex',
    positionFilter: ['pos-grua'],
    reinforcementConfig: {
      'pos-grua': {
        shift_id: 'shift-am07',
        shift_start: '07:00',
        shift_end: '15:00',
        duration_hours: 8,
        area_id: 'area-atrex',
      },
    },
    referenceDate: REF_DATE,
  });

  // El 12 nov NO lo asigna por su turno protegido fuera del filtro; el 13 nov sí cubre pos-grua por cargo secundario
  assert.equal(result.ordinary_assignments.length, 1);
  assert.equal(result.ordinary_assignments[0].date, '2026-11-13');
  assert.equal(result.ordinary_assignments[0].match_type, 'secondary');

  // El refuerzo corre después y solo puede llenar el 14 nov (no el 12 ni el 13 ya ocupados)
  assert.equal(result.reinforcements.length, 1);
  assert.equal(result.reinforcements[0].date, '2026-11-14');
});

test('ROSTER-05: integra NS22, cuenta cada cupo una vez y no confirma dos solicitudes mensuales con un mismo turno', () => {
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
      anchor_date: '2026-11-02',
      cycle_offset: 0,
      confirmed_4x4_regime: true,
    },
    {
      personnel_id: 'titular-b',
      first_name: 'Titular B',
      anchor_date: '2026-11-02',
      cycle_offset: 4,
      confirmed_4x4_regime: true,
    },
  ];

  // Requerimientos: NS22 del 02 al 05 nov + un turno diurno el sábado 07 nov en Aeropuerto
  const requirements: RawShiftRequirement[] = [
    ...['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((d, i) => ({
      id: `req-ns22-${i}`,
      date: d,
      area_id: 'area-aero',
      position_id: 'pos-aero',
      shift_id: 'shift-ns22',
      required_count: 1,
      priority: 'HIGH',
      is_extra: false,
      shift: { name: 'NS 22', start_time: '22:00', end_time: '07:00', duration_hours: 9 },
    })),
    {
      id: 'req-day-sat',
      date: '2026-11-07',
      area_id: 'area-aero',
      position_id: 'pos-aero',
      shift_id: 'shift-am07',
      required_count: 1,
      priority: 'NORMAL',
      is_extra: false,
      shift: { name: 'AM 07', start_time: '07:00', end_time: '15:00', duration_hours: 8 },
    },
  ];

  const opAero: PersonnelScheduleProfile = {
    personnel_id: 'op-aero',
    first_name: 'Operador Aero',
    main_position: 'pos-aero',
    rotation_pattern: '5x2',
  };

  // op-aero tiene DOS solicitudes mensuales de libre elección (mié 04 y jue 05) en su calendario base L-V,
  // y en el roster resultante solo se genera UN turno en día no-base (sábado 07).
  const leaves: RawLeaveRecord[] = [
    {
      personnel_id: 'op-aero',
      type: 'free_request',
      start_date: '2026-11-04',
      end_date: '2026-11-04',
      status: 'approved',
    },
    {
      personnel_id: 'op-aero',
      type: 'free_request',
      start_date: '2026-11-05',
      end_date: '2026-11-05',
      status: 'approved',
    },
  ];

  const baseCalendarByPerson = new Map<string, Set<string>>([
    ['op-aero', new Set(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'])],
  ]);

  const result = scheduleCrossArea({
    startDate: '2026-11-02',
    endDate: '2026-11-08',
    rawRequirements: requirements,
    existingAssignments: [],
    personnel: [
      { personnel_id: 'titular-a', main_position: 'pos-aero' },
      { personnel_id: 'titular-b', main_position: 'pos-aero' },
      opAero,
    ],
    approvedLeaves: leaves,
    ns22Config: { titulares, shiftDef: ns22Shift },
    baseCalendarByPerson,
    referenceDate: new Date('2026-10-20T12:00:00Z'),
  });

  // Titular A cubrió las 4 noches NS22 (sin salirse de NS22) y op-aero cubrió el sábado 07
  assert.equal(result.stats.total_required, 5);
  assert.equal(result.stats.total_covered, 5);
  assert.equal(result.stats.total_vacancies, 0);

  // De las dos solicitudes mensuales de op-aero, SOLO UNA puede quedar confirmada como 'relocated' por el turno del 07 nov
  const relocatedCount = result.permission_cases.filter((c) => c.status === 'relocated').length;
  const pendingCount = result.permission_cases.filter((c) => c.status === 'pending_relocation').length;
  assert.equal(relocatedCount, 1);
  assert.equal(pendingCount, 1);
});

test('ROSTER-05: distingue compromisos protegidos/fuera de filtro vs borrador reemplazable y acota resumen de vacantes al filtro', () => {
  const requirements: RawShiftRequirement[] = [
    {
      id: 'req-atrex-12',
      date: '2026-11-12',
      area_id: 'area-atrex',
      position_id: 'pos-grua',
      shift_id: 'shift-am07',
      required_count: 1,
      priority: 'HIGH',
      is_extra: false,
      shift: { name: 'AM 07', start_time: '07:00', end_time: '15:00', duration_hours: 8 },
    },
    {
      id: 'req-atrex-13',
      date: '2026-11-13',
      area_id: 'area-atrex',
      position_id: 'pos-grua',
      shift_id: 'shift-am07',
      required_count: 1,
      priority: 'HIGH',
      is_extra: false,
      shift: { name: 'AM 07', start_time: '07:00', end_time: '15:00', duration_hours: 8 },
    },
    // Requerimiento fuera del filtro (area-base / pos-bodega) que NO debe inflar el resumen filtrado
    {
      id: 'req-base-outside',
      date: '2026-11-13',
      area_id: 'area-base',
      position_id: 'pos-bodega',
      shift_id: 'shift-am08',
      required_count: 1,
      priority: 'NORMAL',
      is_extra: false,
      shift: { name: 'AM 08', start_time: '08:00', end_time: '16:00', duration_hours: 8 },
    },
  ];

  const existing: RawExistingAssignment[] = [
    // Compromiso protegido fuera del filtro el 12 nov -> impide asignar el 12
    {
      id: 'prot-outside-12',
      personnel_id: 'op-poly',
      date: '2026-11-12',
      area_id: 'area-base',
      position_id: 'pos-bodega',
      shift_id: 'shift-am08',
      shift_start: '08:00',
      shift_end: '16:00',
      duration_hours: 8,
      is_manual: true,
      is_extra: false,
    },
    // Borrador no protegido dentro del rango y del filtro el 13 nov -> debe poder recalcularse
    {
      id: 'draft-inside-13',
      personnel_id: 'op-poly',
      date: '2026-11-13',
      area_id: 'area-atrex',
      position_id: 'pos-grua',
      shift_id: 'shift-am07',
      shift_start: '07:00',
      shift_end: '15:00',
      duration_hours: 8,
      is_manual: false,
      is_locked: false,
      is_validated: false,
      is_published: false,
      frozen_by_rule: false,
      is_extra: false,
    },
  ];

  const polyWorker: PersonnelScheduleProfile = {
    personnel_id: 'op-poly',
    first_name: 'Polivalente',
    main_position: 'pos-bodega',
    secondary_positions: ['pos-grua'],
    rotation_pattern: '5x2',
  };

  const result = scheduleCrossArea({
    startDate: '2026-11-12',
    endDate: '2026-11-13',
    rawRequirements: requirements,
    existingAssignments: existing,
    personnel: [polyWorker],
    areaFilter: 'area-atrex',
    positionFilter: ['pos-grua'],
    referenceDate: REF_DATE,
  });

  // 12 nov bloqueado por compromiso protegido fuera del filtro; 13 nov recalculado desde borrador reemplazable
  assert.equal(result.ordinary_assignments.length, 1);
  assert.equal(result.ordinary_assignments[0].date, '2026-11-13');

  // El resumen de vacantes corresponde exclusivamente al alcance filtrado (2 requeridos, 1 cubierto, 1 vacante)
  assert.equal(result.stats.total_required, 2);
  assert.equal(result.stats.total_covered, 1);
  assert.equal(result.stats.total_vacancies, 1);
  assert.equal(result.coverage.ordinary.slots.length, 2);
});

test('ROSTER-05: reemplazo NS22 participa en prioridad conjunta frente a cupo Crítico secundario y bloque de cuatro', () => {
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
      cycle_offset: 4, // Le toca 2026-11-02..05
      confirmed_4x4_regime: true,
    },
  ];

  const requirements: RawShiftRequirement[] = [
    // NS22 con prioridad NORMAL del 02 al 05 nov
    ...['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((d, i) => ({
      id: `req-ns22-${i}`,
      date: d,
      area_id: 'area-aero',
      position_id: 'pos-aero',
      shift_id: 'shift-ns22',
      required_count: 1,
      priority: 'NORMAL',
      is_extra: false,
      shift: { name: 'NS 22', start_time: '22:00', end_time: '07:00', duration_hours: 9 },
    })),
    // Cupo CRÍTICO el 03 nov que solo op-aero-poly puede cubrir por cargo secundario
    {
      id: 'req-crit-grua',
      date: '2026-11-03',
      area_id: 'area-atrex',
      position_id: 'pos-grua',
      shift_id: 'shift-am08',
      required_count: 1,
      priority: 'CRITICAL',
      is_extra: false,
      shift: { name: 'AM 08', start_time: '08:00', end_time: '16:00', duration_hours: 8 },
    },
  ];

  // Titular B con licencia del 02 al 05 nov
  const leaves: RawLeaveRecord[] = [
    {
      personnel_id: 'titular-b',
      type: 'sick',
      start_date: '2026-11-02',
      end_date: '2026-11-05',
      status: 'approved',
    },
  ];

  const opAeroPoly: PersonnelScheduleProfile = {
    personnel_id: 'op-aero-poly',
    first_name: 'Aero Polivalente',
    main_position: 'pos-aero',
    secondary_positions: ['pos-grua'],
    rotation_pattern: '5x2',
  };
  const opAero2: PersonnelScheduleProfile = {
    personnel_id: 'op-aero-2',
    first_name: 'Aero 2',
    main_position: 'pos-aero',
    secondary_positions: [],
    rotation_pattern: '5x2',
  };

  // Caso A: solo existe op-aero-poly -> NS22 tiene preferencia sobre el otro cupo Crítico
  const singleRes = scheduleCrossArea({
    startDate: '2026-11-02',
    endDate: '2026-11-05',
    rawRequirements: requirements,
    existingAssignments: [],
    personnel: [
      { personnel_id: 'titular-a', main_position: 'pos-aero' },
      { personnel_id: 'titular-b', main_position: 'pos-aero' },
      opAeroPoly,
    ],
    approvedLeaves: leaves,
    ns22Config: { titulares, shiftDef: ns22Shift },
    referenceDate: new Date('2026-10-20T12:00:00Z'),
  });

  const ns22ReplSingle = singleRes.ordinary_assignments.filter(
    (a) => a.assignment_kind === 'ns22_replacement'
  );
  assert.equal(ns22ReplSingle.length, 4);
  assert.ok(ns22ReplSingle.every((a) => a.personnel_id === 'op-aero-poly'));
  assert.equal(singleRes.remaining_vacancies.length, 1);
  assert.equal(singleRes.remaining_vacancies[0].position_id, 'pos-grua');
  assert.equal(singleRes.audit_violations.length, 0);

  // Caso B: existe op-aero-2 viable para NS22 -> busca alternativa y cubre AMBOS (op-aero-poly -> Crítico grúa, op-aero-2 -> bloque 4 noches NS22)
  const dualRes = scheduleCrossArea({
    startDate: '2026-11-02',
    endDate: '2026-11-05',
    rawRequirements: requirements,
    existingAssignments: [],
    personnel: [
      { personnel_id: 'titular-a', main_position: 'pos-aero' },
      { personnel_id: 'titular-b', main_position: 'pos-aero' },
      opAeroPoly,
      opAero2,
    ],
    approvedLeaves: leaves,
    ns22Config: { titulares, shiftDef: ns22Shift },
    referenceDate: new Date('2026-10-20T12:00:00Z'),
  });

  assert.equal(dualRes.stats.total_required, 5);
  assert.equal(dualRes.stats.total_covered, 5);
  assert.equal(dualRes.stats.total_vacancies, 0);
  assert.equal(dualRes.remaining_vacancies.length, 0);
  assert.equal(dualRes.audit_violations.length, 0);

  const critAssDual = dualRes.ordinary_assignments.find(
    (a) => a.position_id === 'pos-grua'
  )!;
  assert.equal(critAssDual.personnel_id, 'op-aero-poly');

  const ns22Repls = dualRes.ordinary_assignments.filter(
    (a) => a.assignment_kind === 'ns22_replacement'
  );
  assert.equal(ns22Repls.length, 4);
  assert.ok(ns22Repls.every((r) => r.personnel_id === 'op-aero-2'));
});

test('ROSTER-05: generación semanal con requerimientos de todo el mes acota cobertura y refuerzos al rango, respetando compromisos externos', () => {
  // Requerimientos de todo noviembre, pero generamos solo la semana 2026-11-09..2026-11-15
  const fullMonthReqs: RawShiftRequirement[] = [
    {
      id: 'req-w1',
      date: '2026-11-05', // Fuera de rango semanal
      area_id: 'area-base',
      position_id: 'pos-bodega',
      shift_id: 'shift-am04',
      required_count: 1,
      priority: 'NORMAL',
      is_extra: false,
      shift: { name: 'AM 04', start_time: '04:00', end_time: '12:00', duration_hours: 8 },
    },
    {
      id: 'req-w2-mon',
      date: '2026-11-09', // Dentro de rango
      area_id: 'area-base',
      position_id: 'pos-bodega',
      shift_id: 'shift-am04',
      required_count: 1,
      priority: 'NORMAL',
      is_extra: false,
      shift: { name: 'AM 04', start_time: '04:00', end_time: '12:00', duration_hours: 8 },
    },
    {
      id: 'req-w2-sun',
      date: '2026-11-15', // Domingo dentro de rango
      area_id: 'area-base',
      position_id: 'pos-bodega',
      shift_id: 'shift-am04',
      required_count: 1,
      priority: 'HIGH',
      is_extra: false,
      shift: { name: 'AM 04', start_time: '04:00', end_time: '12:00', duration_hours: 8 },
    },
    {
      id: 'req-w3',
      date: '2026-11-20', // Fuera de rango semanal
      area_id: 'area-base',
      position_id: 'pos-bodega',
      shift_id: 'shift-am04',
      required_count: 1,
      priority: 'NORMAL',
      is_extra: false,
      shift: { name: 'AM 04', start_time: '04:00', end_time: '12:00', duration_hours: 8 },
    },
  ];

  // El operador ya tiene 3 domingos trabajados fuera del rango (01, 08, 22 nov) -> no puede trabajar el domingo 15 nov
  const outOfRangeAssignments: RawExistingAssignment[] = [
    {
      id: 'sun-01',
      personnel_id: 'op-bod',
      date: '2026-11-01',
      area_id: 'area-base',
      position_id: 'pos-bodega',
      shift_id: 'shift-am04',
      shift_start: '04:00',
      shift_end: '12:00',
      duration_hours: 8,
      is_validated: true,
    },
    {
      id: 'sun-08',
      personnel_id: 'op-bod',
      date: '2026-11-08',
      area_id: 'area-base',
      position_id: 'pos-bodega',
      shift_id: 'shift-am04',
      shift_start: '04:00',
      shift_end: '12:00',
      duration_hours: 8,
      is_validated: true,
    },
    {
      id: 'sun-22',
      personnel_id: 'op-bod',
      date: '2026-11-22',
      area_id: 'area-base',
      position_id: 'pos-bodega',
      shift_id: 'shift-am04',
      required_count: 1,
      shift_start: '04:00',
      shift_end: '12:00',
      duration_hours: 8,
      is_validated: true,
    } as any,
  ];

  const worker: PersonnelScheduleProfile = {
    personnel_id: 'op-bod',
    first_name: 'Bodeguero',
    main_position: 'pos-bodega',
    area_id: 'area-base',
    rotation_pattern: '5x2',
  };

  const result = scheduleCrossArea({
    startDate: '2026-11-09',
    endDate: '2026-11-15',
    rawRequirements: fullMonthReqs,
    existingAssignments: outOfRangeAssignments,
    personnel: [worker],
    referenceDate: new Date('2026-10-20T12:00:00Z'),
  });

  // Solo evalúa los 2 requerimientos dentro de la semana 09..15 nov
  assert.equal(result.stats.total_required, 2);
  assert.equal(result.stats.total_covered, 1); // Lun 09 cubierto
  assert.equal(result.stats.total_vacancies, 1); // Dom 15 vacante por cuota mensual de domingos externos
  assert.equal(result.remaining_vacancies[0].date, '2026-11-15');
  assert.ok(result.assignments.every((a) => a.date >= '2026-11-09' && a.date <= '2026-11-15'));
});

test('ROSTER-05: refuerzos de Aeropuerto solo L-V con AM07 y Bodegas con AM04 en bodega habilitada dentro del filtro', () => {
  // Fin de semana + lunes (2026-11-07 Sáb, 2026-11-08 Dom, 2026-11-09 Lun)
  const opAero: PersonnelScheduleProfile = {
    personnel_id: 'op-aero',
    first_name: 'Operador Aero',
    main_position: 'pos-aero',
    area_id: 'area-aero',
    rotation_pattern: '5x2',
  };
  const opBodega: PersonnelScheduleProfile = {
    personnel_id: 'op-bodega',
    first_name: 'Operador Bodega',
    main_position: 'pos-bodega-fedex',
    secondary_positions: ['pos-bodega-dhl'],
    area_id: 'area-fedex',
    rotation_pattern: '5x2',
  };

  const reinforcementConfig = {
    'pos-aero': {
      shift_id: 'shift-am07',
      shift_start: '07:00',
      shift_end: '15:00',
      duration_hours: 8,
      area_id: 'area-aero',
      days_of_week: [1, 2, 3, 4, 5], // Solo L-V en Aeropuerto
    },
    'pos-bodega-fedex': {
      shift_id: 'shift-am04',
      shift_start: '04:00',
      shift_end: '12:00',
      duration_hours: 8,
      area_id: 'area-fedex',
    },
    'pos-bodega-dhl': {
      shift_id: 'shift-am04',
      shift_start: '04:00',
      shift_end: '12:00',
      duration_hours: 8,
      area_id: 'area-dhl',
    },
  };

  // 1) Aeropuerto en fin de semana + lunes: refuerza solo el lunes 09 con AM07 (nunca sáb 07 ni dom 08)
  const aeroRes = scheduleCrossArea({
    startDate: '2026-11-07',
    endDate: '2026-11-09',
    rawRequirements: [],
    existingAssignments: [],
    personnel: [opAero],
    areaFilter: 'area-aero',
    reinforcementConfig,
    referenceDate: REF_DATE,
  });

  assert.equal(aeroRes.reinforcements.length, 1);
  assert.equal(aeroRes.reinforcements[0].date, '2026-11-09'); // Lunes
  assert.equal(aeroRes.reinforcements[0].shift_id, 'shift-am07');

  // 2) Generación filtrada a área DHL: op-bodega habilitado por cargo secundario refuerza con AM04 en area-dhl
  const dhlRes = scheduleCrossArea({
    startDate: '2026-11-09',
    endDate: '2026-11-09',
    rawRequirements: [],
    existingAssignments: [],
    personnel: [opBodega],
    areaFilter: 'area-dhl',
    reinforcementConfig,
    referenceDate: REF_DATE,
  });

  assert.equal(dhlRes.reinforcements.length, 1);
  assert.equal(dhlRes.reinforcements[0].area_id, 'area-dhl');
  assert.equal(dhlRes.reinforcements[0].position_id, 'pos-bodega-dhl');
  assert.equal(dhlRes.reinforcements[0].shift_id, 'shift-am04');
});

test('Exclusividades de horario en v2: solo titulares 4x4 (NS22) e Ítalo Guerra (PM 13:30); turno fijo antiguo no bloquea otros horarios', () => {
  const opLegacyFixed: PersonnelScheduleProfile = {
    personnel_id: 'op-legacy',
    first_name: 'Operador',
    full_name: 'Operador Legado',
    main_position: 'pos-aero',
    secondary_positions: ['pos-base'],
    fixed_shift_id: 'shift-legacy-am08',
    prefers_night: false,
    avoids_night: true,
    rotation_pattern: '5X2_ANTIGUO',
    area_id: 'area-aero',
  };

  const italo: PersonnelScheduleProfile = {
    personnel_id: 'italo-id',
    first_name: 'Ítalo',
    full_name: 'Ítalo Guerra',
    main_position: 'pos-base',
    secondary_positions: ['pos-aero'],
    area_id: 'area-base',
  };

  const titular1: PersonnelScheduleProfile = {
    personnel_id: 'tit-1',
    first_name: 'Titular 1',
    main_position: 'pos-aero',
    secondary_positions: ['pos-base'],
    rotation_pattern: '4x4',
    area_id: 'area-aero',
  };

  const titular2: PersonnelScheduleProfile = {
    personnel_id: 'tit-2',
    first_name: 'Titular 2',
    main_position: 'pos-aero',
    secondary_positions: ['pos-base'],
    rotation_pattern: '4x4',
    area_id: 'area-aero',
  };

  const res = scheduleCrossArea({
    startDate: '2026-11-09', // lunes
    endDate: '2026-11-09',
    rawRequirements: [
      // Titular 1 ausente -> requiere reemplazo NS22 (22:00)
      {
        id: 'req-ns22',
        date: '2026-11-09',
        area_id: 'area-aero',
        position_id: 'pos-aero',
        shift_id: 'shift-ns22',
        required_count: 1,
        priority: 'Crítico',
        shift: { name: 'NS 22', start_time: '22:00', end_time: '07:00', duration_hours: 8 },
      },
      // Cupo PM 13:30 en Base -> debe tomarlo Ítalo Guerra
      {
        id: 'req-pm1330',
        date: '2026-11-09',
        area_id: 'area-base',
        position_id: 'pos-base',
        shift_id: 'shift-pm1330',
        required_count: 1,
        priority: 'Normal',
        shift: { name: 'PM 13:30', start_time: '13:30', end_time: '22:00', duration_hours: 8 },
      },
      // Cupo AM 08 en Base -> Ítalo NO puede tomarlo; Titular 2 NO puede tomarlo
      {
        id: 'req-am08-extra',
        date: '2026-11-09',
        area_id: 'area-base',
        position_id: 'pos-base',
        shift_id: 'shift-am08',
        required_count: 1,
        priority: 'Normal',
        shift: { name: 'AM 08', start_time: '08:00', end_time: '16:00', duration_hours: 8 },
      },
    ],
    existingAssignments: [],
    personnel: [opLegacyFixed, italo, titular1, titular2],
    approvedLeaves: [
      {
        personnel_id: 'tit-1',
        type: 'vacation',
        start_date: '2026-11-09',
        end_date: '2026-11-09',
        status: 'approved',
      },
    ],
    ns22Config: {
      titulares: [
        { personnel_id: 'tit-1', anchor_date: '2026-11-09', cycle_offset: 0, confirmed_4x4_regime: true },
        { personnel_id: 'tit-2', anchor_date: '2026-11-09', cycle_offset: 4, confirmed_4x4_regime: true },
      ],
      shiftDef: {
        shift_id: 'shift-ns22',
        area_id: 'area-aero',
        position_id: 'pos-aero',
        shift_start: '22:00',
        shift_end: '07:00',
        duration_hours: 8,
      },
    },
    reinforcementConfig: {
      'pos-base': {
        shift_id: 'shift-am04',
        shift_start: '04:00',
        shift_end: '12:00',
        duration_hours: 8,
        area_id: 'area-base',
        position_id: 'pos-base',
      },
    },
    referenceDate: REF_DATE,
  });

  // 1) Operador con fixed_shift_id antiguo + avoids_night sí cubre el reemplazo NS22 (otro horario)
  const ns22Ass = res.ordinary_assignments.find((a) => a.shift_id === 'shift-ns22');
  assert.equal(ns22Ass?.personnel_id, 'op-legacy');

  // 2) Ítalo Guerra cubre únicamente PM 13:30 y NO es asignado a AM 08 ni a refuerzo AM 04
  const italoOrd = res.ordinary_assignments.filter((a) => a.personnel_id === 'italo-id');
  assert.equal(italoOrd.length, 1);
  assert.equal(italoOrd[0].shift_id, 'shift-pm1330');
  const italoReinf = res.reinforcements.filter((a) => a.personnel_id === 'italo-id');
  assert.equal(italoReinf.length, 0);

  // 3) Titular 2 (4x4 Aeropuerto) no es asignado fuera de NS22 (ni a AM 08 ni a refuerzo AM 04)
  assert.equal(
    res.assignments.filter((a) => a.personnel_id === 'tit-2' && a.shift_id !== 'shift-ns22').length,
    0
  );
  // El cupo AM 08 queda vacante porque ni Ítalo ni Titular 2 pueden salir de su exclusividad y opLegacy ya tomó NS22
  assert.ok(res.remaining_vacancies.some((v) => v.shift_id === 'shift-am08'));
});
