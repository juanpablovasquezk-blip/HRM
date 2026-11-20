import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkMinRestBetweenShifts,
  checkWeeklyHoursLimit,
  classifyLeave,
  evaluateConsecutiveDaysStreak,
  evaluatePermissionsForWeek,
  getShiftOccupiedDates,
  hasMandatoryJornadaViolation,
  identifyUnconfirmedRegimeCases,
  splitShiftHoursByWeek,
  validateJornadaConstraints,
} from './jornada';
import type {
  PersonnelScheduleProfile,
  RawLeaveRecord,
  ScheduledShiftInterval,
} from './types';

const baseWorker: PersonnelScheduleProfile = {
  personnel_id: 'per-1',
  first_name: 'Operador Prueba',
  main_position: 'pos-1',
  main_position_name: 'Operador Bodega',
  rotation_pattern: '5x2',
  has_special_contract: false,
};

test('ROSTER-03: tope semanal de 42h, límite contractual menor e imputación por cruce de semana', () => {
  const existing40h: ScheduledShiftInterval[] = [
    { date: '2026-11-09', shift_start: '08:00', shift_end: '16:00', duration_hours: 8 },
    { date: '2026-11-10', shift_start: '08:00', shift_end: '16:00', duration_hours: 8 },
    { date: '2026-11-11', shift_start: '08:00', shift_end: '16:00', duration_hours: 8 },
    { date: '2026-11-12', shift_start: '08:00', shift_end: '16:00', duration_hours: 8 },
  ]; // 32h en semana 2026-11-09

  // +10h = 42h -> permitido
  assert.equal(
    checkWeeklyHoursLimit(
      baseWorker,
      { date: '2026-11-13', shift_start: '08:00', shift_end: '18:00', duration_hours: 10 },
      existing40h
    ),
    null
  );

  // +11h = 43h -> bloqueado por tope 42h
  const over42 = checkWeeklyHoursLimit(
    baseWorker,
    { date: '2026-11-13', shift_start: '08:00', shift_end: '19:00', duration_hours: 11 },
    existing40h
  );
  assert.ok(over42);
  assert.equal(over42.type, 'max_hours');

  // Límite contractual menor (30h)
  const partTimeWorker: PersonnelScheduleProfile = {
    ...baseWorker,
    contractual_weekly_hours: 30,
  };
  const overContract = checkWeeklyHoursLimit(
    partTimeWorker,
    { date: '2026-11-12', shift_start: '08:00', shift_end: '16:00', duration_hours: 8 },
    existing40h.slice(0, 3)
  );
  assert.ok(overContract);
  assert.match(overContract.message, /30h/);

  // Imputación proporcional al cruzar de semana: domingo 2026-11-15 22:00 -> lunes 2026-11-16 07:00 (9h)
  const crossWeekShift: ScheduledShiftInterval = {
    date: '2026-11-15',
    shift_start: '22:00',
    shift_end: '07:00',
    duration_hours: 9,
  };
  const split = splitShiftHoursByWeek(crossWeekShift);
  assert.equal(split.get('2026-11-09'), 2); // 2h el domingo
  assert.equal(split.get('2026-11-16'), 7); // 7h el lunes siguiente

  // Si la semana 2026-11-16 ya tiene 36h, agregar esas 7h (43h) debe bloquearse
  const nextWeek36h: ScheduledShiftInterval[] = [
    { date: '2026-11-17', shift_start: '08:00', shift_end: '17:00', duration_hours: 9 },
    { date: '2026-11-18', shift_start: '08:00', shift_end: '17:00', duration_hours: 9 },
    { date: '2026-11-19', shift_start: '08:00', shift_end: '17:00', duration_hours: 9 },
    { date: '2026-11-20', shift_start: '08:00', shift_end: '17:00', duration_hours: 9 },
  ];
  const overCrossWeek = checkWeeklyHoursLimit(baseWorker, crossWeekShift, nextWeek36h);
  assert.ok(overCrossWeek);
  assert.equal(overCrossWeek.type, 'max_hours');
  assert.match(overCrossWeek.message, /2026-11-16/);
});

test('ROSTER-03: turno que cruza medianoche con 11h de descanso (rechazado) vs 12h (permitido)', () => {
  const overnightShift: ScheduledShiftInterval[] = [
    { date: '2026-11-10', shift_start: '22:00', shift_end: '07:00', duration_hours: 9 },
  ];

  const rest11h = checkMinRestBetweenShifts(
    baseWorker,
    { date: '2026-11-11', shift_start: '18:00', shift_end: '02:00', duration_hours: 8 },
    overnightShift
  );
  assert.ok(rest11h);
  assert.equal(rest11h.type, 'min_rest');

  const rest12h = checkMinRestBetweenShifts(
    baseWorker,
    { date: '2026-11-11', shift_start: '19:00', shift_end: '03:00', duration_hours: 8 },
    overnightShift
  );
  assert.equal(rest12h, null);
});

test('ROSTER-03: NS22 del sábado que termina el domingo ocupa domingo y cuenta para cuota mensual', () => {
  const satNs22: ScheduledShiftInterval = {
    date: '2026-11-21', // Sábado
    shift_start: '22:00',
    shift_end: '07:00', // Termina el domingo 2026-11-22
    duration_hours: 9,
  };
  assert.deepEqual(getShiftOccupiedDates(satNs22), ['2026-11-21', '2026-11-22']);

  // Noviembre 2026 tiene 5 domingos (01, 08, 15, 22, 29). Con 3 domingos previos, el NS22 del sábado invade el 4to domingo.
  const previousSundays: ScheduledShiftInterval[] = [
    { date: '2026-11-01', shift_start: '08:00', shift_end: '16:00', duration_hours: 8 },
    { date: '2026-11-08', shift_start: '08:00', shift_end: '16:00', duration_hours: 8 },
    { date: '2026-11-15', shift_start: '08:00', shift_end: '16:00', duration_hours: 8 },
  ];

  const violations = validateJornadaConstraints(baseWorker, satNs22, previousSundays, []);
  const sundayViolation = violations.find((v) => v.type === 'sundays_off');
  assert.ok(sundayViolation);
  assert.equal(sundayViolation.severity, 'error');
});

test('ROSTER-03: turno del domingo que termina el lunes invade permiso aprobado del lunes', () => {
  const sunNs22: ScheduledShiftInterval = {
    date: '2026-11-15', // Domingo
    shift_start: '22:00',
    shift_end: '07:00', // Termina el lunes 2026-11-16
    duration_hours: 9,
  };

  const mondayPermission: RawLeaveRecord = {
    personnel_id: 'per-1',
    type: 'personal',
    start_date: '2026-11-16',
    end_date: '2026-11-16',
    status: 'approved',
    reason: 'Día administrativo',
  };

  const violations = validateJornadaConstraints(baseWorker, sunNs22, [], [mondayPermission]);
  const leaveViolation = violations.find((v) => v.type === 'leave_conflict');
  assert.ok(leaveViolation);
  assert.equal(leaveViolation.severity, 'error');
  assert.equal(leaveViolation.date, '2026-11-16');
});

test('ROSTER-03: racha que cruza cambio de semana y de mes (octubre -> noviembre)', () => {
  const occupiedDates = new Set([
    '2026-10-27',
    '2026-10-28',
    '2026-10-29',
    '2026-10-30',
    '2026-10-31',
    '2026-11-01',
    '2026-11-02',
  ]);

  const result = evaluateConsecutiveDaysStreak(
    baseWorker,
    { date: '2026-11-03', shift_start: '08:00', shift_end: '16:00', duration_hours: 8 },
    occupiedDates
  );
  assert.equal(result.maxStreak, 8);
  assert.ok(result.violation);
  assert.equal(result.violation.type, 'consecutive_days');
  assert.equal(result.violation.severity, 'warning');
});

test('ROSTER-03: sin exención automática por cargo/patrón/has_special_contract sin régimen confirmado', () => {
  const unconfirmedSpecial: PersonnelScheduleProfile = {
    personnel_id: 'per-special',
    first_name: 'Operador Especial',
    main_position: 'pos-canes',
    main_position_name: 'CANES',
    rotation_pattern: '7x7',
    has_special_contract: true,
    confirmed_regime: null,
  };

  const casesToConfirm = identifyUnconfirmedRegimeCases([unconfirmedSpecial]);
  assert.equal(casesToConfirm.length, 1);

  // Sin confirmed_regime, aplica el tope general de 42h
  const existing40h: ScheduledShiftInterval[] = [
    { date: '2026-11-09', shift_start: '08:00', shift_end: '16:00', duration_hours: 8 },
    { date: '2026-11-10', shift_start: '08:00', shift_end: '16:00', duration_hours: 8 },
    { date: '2026-11-11', shift_start: '08:00', shift_end: '16:00', duration_hours: 8 },
    { date: '2026-11-12', shift_start: '08:00', shift_end: '16:00', duration_hours: 8 },
    { date: '2026-11-13', shift_start: '08:00', shift_end: '16:00', duration_hours: 8 },
  ]; // 40h y 5 días
  const blocked = validateJornadaConstraints(
    unconfirmedSpecial,
    { date: '2026-11-14', shift_start: '08:00', shift_end: '16:00', duration_hours: 8 },
    existing40h,
    []
  );
  assert.equal(hasMandatoryJornadaViolation(blocked), true);
});

test('ROSTER-03: distinción entre solicitud mensual de libre elección y permiso personal genérico, con calendario base y cupo compatible', () => {
  const monthlyFreeChoiceWorkday: RawLeaveRecord = {
    personnel_id: 'per-1',
    type: 'other',
    start_date: '2026-11-11', // Miércoles
    end_date: '2026-11-11',
    status: 'approved',
    reason: 'Solicitud mensual de días libres',
  };
  const monthlyFreeChoiceRestday: RawLeaveRecord = {
    personnel_id: 'per-1',
    type: 'free_request',
    start_date: '2026-11-14', // Sábado (libre en calendario base)
    end_date: '2026-11-14',
    status: 'approved',
  };
  const genericPersonal: RawLeaveRecord = {
    personnel_id: 'per-1',
    type: 'personal',
    start_date: '2026-11-12', // Jueves
    end_date: '2026-11-12',
    status: 'approved',
    reason: 'Trámite personal',
  };

  assert.equal(classifyLeave(monthlyFreeChoiceWorkday), 'monthly_free_choice');
  assert.equal(classifyLeave(monthlyFreeChoiceRestday), 'monthly_free_choice');
  assert.equal(classifyLeave(genericPersonal), 'generic_personal');

  const baseCalendarDates = new Set([
    '2026-11-09',
    '2026-11-10',
    '2026-11-11',
    '2026-11-12',
    '2026-11-13',
  ]);
  const existingShifts: ScheduledShiftInterval[] = [
    { date: '2026-11-09', shift_start: '08:00', shift_end: '16:00', duration_hours: 8 },
    { date: '2026-11-10', shift_start: '08:00', shift_end: '16:00', duration_hours: 8 },
    { date: '2026-11-13', shift_start: '08:00', shift_end: '16:00', duration_hours: 8 },
  ];

  // 1) Sin calendario base -> reubicación pendiente
  const missingCal = evaluatePermissionsForWeek({
    personnel: baseWorker,
    weekStartStr: '2026-11-09',
    baseCalendarDates: null,
    compatibleSlots: [],
    existingShifts,
    approvedLeaves: [monthlyFreeChoiceWorkday],
  });
  assert.equal(missingCal[0].status, 'pending_relocation');
  assert.equal(missingCal[0].reason_code, 'missing_base_calendar');

  // 2) Día cumple descanso/jornada pero NO hay cupo real compatible -> reubicación pendiente
  const noSlot = evaluatePermissionsForWeek({
    personnel: baseWorker,
    weekStartStr: '2026-11-09',
    baseCalendarDates,
    compatibleSlots: [], // Sin cupos compatibles
    existingShifts,
    approvedLeaves: [monthlyFreeChoiceWorkday],
  });
  assert.equal(noSlot[0].status, 'pending_relocation');
  assert.equal(noSlot[0].reason_code, 'no_compatible_slot');

  // 3) Con cupo real compatible: sin confirmar -> proposed_relocation; confirmado -> relocated
  const compatibleSlots: ScheduledShiftInterval[] = [
    {
      date: '2026-11-15',
      shift_start: '08:00',
      shift_end: '16:00',
      duration_hours: 8,
      slot_key: '2026-11-15|area-1|pos-1|shift-1',
    },
  ];
  const unconfirmedEval = evaluatePermissionsForWeek({
    personnel: baseWorker,
    weekStartStr: '2026-11-09',
    baseCalendarDates,
    compatibleSlots,
    existingShifts,
    approvedLeaves: [monthlyFreeChoiceWorkday, genericPersonal, monthlyFreeChoiceRestday],
  });

  const wedProposed = unconfirmedEval.find((c) => c.permission_date === '2026-11-11');
  const thu = unconfirmedEval.find((c) => c.permission_date === '2026-11-12');
  const sat = unconfirmedEval.find((c) => c.permission_date === '2026-11-14');

  assert.equal(wedProposed?.status, 'proposed_relocation');
  assert.equal(wedProposed?.relocated_to, null);
  assert.equal(wedProposed?.proposed_slot?.slot_key, '2026-11-15|area-1|pos-1|shift-1');

  assert.equal(thu?.status, 'generic_personal_no_relocation');
  assert.equal(thu?.requires_relocation, false);

  assert.equal(sat?.status, 'on_free_day');
  assert.equal(sat?.requires_relocation, false);

  // Confirmado por el generador en el roster resultante -> relocated
  const confirmedEval = evaluatePermissionsForWeek({
    personnel: baseWorker,
    weekStartStr: '2026-11-09',
    baseCalendarDates,
    compatibleSlots,
    existingShifts,
    confirmedRosterAssignments: [compatibleSlots[0]],
    approvedLeaves: [monthlyFreeChoiceWorkday],
  });
  assert.equal(confirmedEval[0].status, 'relocated');
  assert.equal(confirmedEval[0].relocated_to, '2026-11-15');
  assert.equal(confirmedEval[0].relocated_slot_key, '2026-11-15|area-1|pos-1|shift-1');

  // 4) Hay cupos reales, pero todos incumplen una restricción obligatoria -> unrelocatable con motivo
  const invalidSlotsOnly: ScheduledShiftInterval[] = [
    {
      date: '2026-11-10', // Ya trabajado + solapado
      shift_start: '08:00',
      shift_end: '16:00',
      duration_hours: 8,
      slot_key: '2026-11-10|area-1|pos-1|shift-1',
    },
  ];
  const blockedEval = evaluatePermissionsForWeek({
    personnel: baseWorker,
    weekStartStr: '2026-11-09',
    baseCalendarDates,
    compatibleSlots: invalidSlotsOnly,
    existingShifts,
    approvedLeaves: [monthlyFreeChoiceWorkday],
  });
  assert.equal(blockedEval[0].status, 'unrelocatable');
  assert.equal(blockedEval[0].reason_code, 'jornada_blocked');
  assert.ok((blockedEval[0].blocking_reasons?.length || 0) > 0);
});

test('ROSTER-03: único día disponible tiene cupo real al mediodía que cumple descanso aunque entrar a las 08:00 no lo cumpla', () => {
  // Martes 2026-11-10 termina a las 23:00 -> entrar el miércoles 11 a las 08:00 daría solo 9h (< 12h),
  // pero un cupo real al mediodía (12:00-20:00) el miércoles 11 da 13h de descanso (>= 12h).
  const monthlyPermFriday: RawLeaveRecord = {
    personnel_id: 'per-1',
    type: 'free_request',
    start_date: '2026-11-13', // Viernes (día laboral en calendario base)
    end_date: '2026-11-13',
    status: 'approved',
  };
  const baseCalendarDates = new Set([
    '2026-11-09',
    '2026-11-10',
    '2026-11-12',
    '2026-11-13',
    '2026-11-14',
  ]);
  const existingShifts: ScheduledShiftInterval[] = [
    { date: '2026-11-09', shift_start: '08:00', shift_end: '16:00', duration_hours: 8 },
    { date: '2026-11-10', shift_start: '15:00', shift_end: '23:00', duration_hours: 8 },
    { date: '2026-11-12', shift_start: '08:00', shift_end: '16:00', duration_hours: 8 },
    { date: '2026-11-14', shift_start: '08:00', shift_end: '16:00', duration_hours: 8 },
  ];
  const middaySlot: ScheduledShiftInterval = {
    date: '2026-11-11',
    shift_start: '12:00',
    shift_end: '20:00',
    duration_hours: 8,
    slot_key: '2026-11-11|area-1|pos-1|shift-pm12',
  };

  // Sin confirmar aún por el generador: propone el cupo del mediodía (no lo descarta por un supuesto 08:00)
  const proposed = evaluatePermissionsForWeek({
    personnel: baseWorker,
    weekStartStr: '2026-11-09',
    baseCalendarDates,
    compatibleSlots: [middaySlot],
    existingShifts,
    approvedLeaves: [monthlyPermFriday],
  });
  assert.equal(proposed[0].status, 'proposed_relocation');
  assert.equal(proposed[0].proposed_slot?.date, '2026-11-11');
  assert.equal(proposed[0].proposed_slot?.shift_start, '12:00');
  assert.equal(proposed[0].relocated_to, null);

  // Confirmado por el generador en el roster resultante: pasa a relocated
  const confirmed = evaluatePermissionsForWeek({
    personnel: baseWorker,
    weekStartStr: '2026-11-09',
    baseCalendarDates,
    compatibleSlots: [middaySlot],
    existingShifts,
    confirmedRosterAssignments: [middaySlot],
    approvedLeaves: [monthlyPermFriday],
  });
  assert.equal(confirmed[0].status, 'relocated');
  assert.equal(confirmed[0].relocated_to, '2026-11-11');
  assert.equal(confirmed[0].relocated_slot_key, '2026-11-11|area-1|pos-1|shift-pm12');
});
