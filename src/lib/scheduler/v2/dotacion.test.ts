import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDotacionSlotKey,
  measureDotacionCoverage,
  prepareDotacionSlots,
} from './dotacion';
import { scheduleCrossArea } from './cobertura';
import { buildWeeklyMatrix, type TemplatePriorityQuotaRow } from '../../../app/(dashboard)/shifts/dotacion/matrix-utils';
import { buildConsolidatedRequirements } from '../../../app/(dashboard)/shifts/dotacion/materialize-utils';
import type { PersonnelScheduleProfile, RawExistingAssignment, RawShiftRequirement } from './types';

const REF_DATE = new Date('2026-11-01T12:00:00Z');

test('ROSTER-02: un turno cubierto en un área no cubre otro turno del mismo cargo en otra área', () => {
  const requirements: RawShiftRequirement[] = [
    {
      id: 'req-base',
      date: '2026-11-10',
      area_id: 'area-base',
      position_id: 'pos-grua',
      shift_id: 'shift-am07',
      required_count: 1,
      priority: 'NORMAL',
      is_extra: false,
      area: { name: 'Base' },
      position: { name: 'Operador Grúa' },
      shift: { name: 'AM 07', start_time: '07:00', end_time: '16:00', duration_hours: 8 },
    },
    {
      id: 'req-atrex',
      date: '2026-11-10',
      area_id: 'area-atrex',
      position_id: 'pos-grua',
      shift_id: 'shift-am07',
      required_count: 1,
      priority: 'HIGH',
      is_extra: false,
      area: { name: 'Atrex' },
      position: { name: 'Operador Grúa' },
      shift: { name: 'AM 07', start_time: '07:00', end_time: '16:00', duration_hours: 8 },
    },
  ];

  // Protected assignment only in Base
  const existing: RawExistingAssignment[] = [
    {
      id: 'ass-1',
      personnel_id: 'per-1',
      date: '2026-11-10',
      area_id: 'area-base',
      position_id: 'pos-grua',
      shift_id: 'shift-am07',
      is_manual: true,
      is_extra: false,
    },
  ];

  const prepared = prepareDotacionSlots(requirements, existing, { referenceDate: REF_DATE });
  const coverage = measureDotacionCoverage(prepared, []);

  const baseKey = buildDotacionSlotKey({
    date: '2026-11-10',
    area_id: 'area-base',
    position_id: 'pos-grua',
    shift_id: 'shift-am07',
  });
  const atrexKey = buildDotacionSlotKey({
    date: '2026-11-10',
    area_id: 'area-atrex',
    position_id: 'pos-grua',
    shift_id: 'shift-am07',
  });

  const baseSlot = coverage.ordinary.slots.find((s) => s.slot_key === baseKey);
  const atrexSlot = coverage.ordinary.slots.find((s) => s.slot_key === atrexKey);

  assert.ok(baseSlot);
  assert.ok(atrexSlot);
  assert.equal(baseSlot.covered_count, 1);
  assert.equal(baseSlot.vacancy_count, 0);
  assert.equal(atrexSlot.covered_count, 0);
  assert.equal(atrexSlot.vacancy_count, 1);
  assert.equal(coverage.ordinary.total_required, 2);
  assert.equal(coverage.ordinary.total_covered, 1);
  assert.equal(coverage.ordinary.total_vacancies, 1);
  assert.equal(coverage.ordinary.coverage_percent, 50);
});

test('ROSTER-02: un extra manual no cuenta como cobertura ordinaria', () => {
  const requirements: RawShiftRequirement[] = [
    {
      id: 'req-ord',
      date: '2026-11-12',
      area_id: 'area-aero',
      position_id: 'pos-aero',
      shift_id: 'shift-pm13',
      required_count: 2,
      priority: 'CRITICAL',
      is_extra: false,
    },
    {
      id: 'req-ext',
      date: '2026-11-12',
      area_id: 'area-aero',
      position_id: 'pos-aero',
      shift_id: 'shift-pm13',
      required_count: 1,
      priority: 'NORMAL',
      is_extra: true,
    },
  ];

  // Manual extra assignment on the same date/area/position/shift
  const existing: RawExistingAssignment[] = [
    {
      id: 'ass-extra-manual',
      personnel_id: 'per-extra',
      date: '2026-11-12',
      area_id: 'area-aero',
      position_id: 'pos-aero',
      shift_id: 'shift-pm13',
      is_manual: true,
      is_extra: true,
    },
    {
      id: 'ass-ord-1',
      personnel_id: 'per-ord',
      date: '2026-11-12',
      area_id: 'area-aero',
      position_id: 'pos-aero',
      shift_id: 'shift-pm13',
      is_locked: true,
      is_extra: false,
    },
  ];

  const prepared = prepareDotacionSlots(requirements, existing, { referenceDate: REF_DATE });
  const coverage = measureDotacionCoverage(prepared, [
    // Even a generated extra assignment must not count toward ordinary
    {
      personnel_id: 'per-gen-extra',
      date: '2026-11-12',
      area_id: 'area-aero',
      position_id: 'pos-aero',
      shift_id: 'shift-pm13',
      is_extra: true,
    },
  ]);

  assert.equal(coverage.ordinary.total_required, 2);
  assert.equal(coverage.ordinary.total_covered, 1);
  assert.equal(coverage.ordinary.total_vacancies, 1);
  assert.equal(coverage.ordinary.slots[0].protected_filled_count, 1);
  assert.equal(coverage.ordinary.slots[0].assigned_count, 0);

  assert.equal(coverage.extra.total_required, 1);
  assert.equal(coverage.extra.total_covered, 1);
  assert.equal(coverage.extra.total_vacancies, 0);
  assert.equal(coverage.extra.slots[0].protected_filled_count, 1);
  assert.equal(coverage.extra.slots[0].over_allocated_count, 1);
});

test('ROSTER-02: una prioridad distinta por día llega correctamente al resultado y ordena los cupos', () => {
  const requirements: RawShiftRequirement[] = [
    {
      id: 'req-mon',
      date: '2026-11-09',
      area_id: 'area-fedex',
      position_id: 'pos-fedex',
      shift_id: 'shift-am04',
      required_count: 2,
      priority: 'LOW',
      is_extra: false,
    },
    {
      id: 'req-wed',
      date: '2026-11-11',
      area_id: 'area-fedex',
      position_id: 'pos-fedex',
      shift_id: 'shift-am04',
      required_count: 2,
      priority: 'CRITICAL',
      is_extra: false,
    },
    {
      id: 'req-tue',
      date: '2026-11-10',
      area_id: 'area-fedex',
      position_id: 'pos-fedex',
      shift_id: 'shift-am04',
      required_count: 2,
      priority: 'HIGH',
      is_extra: false,
    },
  ];

  const prepared = prepareDotacionSlots(requirements, [], { referenceDate: REF_DATE });
  const coverage = measureDotacionCoverage(prepared, []);

  assert.deepEqual(
    prepared.ordinarySlots.map((s) => ({ date: s.date, priority: s.priority, rank: s.priority_rank })),
    [
      { date: '2026-11-11', priority: 'CRITICAL', rank: 4 },
      { date: '2026-11-10', priority: 'HIGH', rank: 3 },
      { date: '2026-11-09', priority: 'LOW', rank: 1 },
    ]
  );

  assert.deepEqual(
    coverage.ordinary.slots.map((s) => ({ date: s.date, priority: s.priority })),
    [
      { date: '2026-11-11', priority: 'CRITICAL' },
      { date: '2026-11-10', priority: 'HIGH' },
      { date: '2026-11-09', priority: 'LOW' },
    ]
  );
});

test('ROSTER-02: asignaciones canceladas o no protegidas no se cuentan como cobertura protegida', () => {
  const requirements: RawShiftRequirement[] = [
    {
      id: 'req-1',
      date: '2026-11-15',
      area_id: 'area-dhl',
      position_id: 'pos-dhl',
      shift_id: 'shift-am05',
      required_count: 2,
      priority: 'NORMAL',
      is_extra: false,
    },
  ];

  const existing: RawExistingAssignment[] = [
    {
      id: 'cancelled-manual',
      personnel_id: 'p1',
      date: '2026-11-15',
      area_id: 'area-dhl',
      position_id: 'pos-dhl',
      shift_id: 'shift-am05',
      status: 'cancelled',
      is_manual: true,
      is_extra: false,
    },
    {
      id: 'regular-unprotected',
      personnel_id: 'p2',
      date: '2026-11-15',
      area_id: 'area-dhl',
      position_id: 'pos-dhl',
      shift_id: 'shift-am05',
      status: 'scheduled',
      is_manual: false,
      is_locked: false,
      is_extra: false,
    },
    {
      id: 'validated-protected',
      personnel_id: 'p3',
      date: '2026-11-15',
      area_id: 'area-dhl',
      position_id: 'pos-dhl',
      shift_id: 'shift-am05',
      status: 'scheduled',
      is_validated: true,
      is_extra: false,
    },
  ];

  const prepared = prepareDotacionSlots(requirements, existing, { referenceDate: REF_DATE });
  const coverage = measureDotacionCoverage(prepared, []);

  assert.equal(coverage.ordinary.slots[0].protected_filled_count, 1);
  assert.equal(coverage.ordinary.slots[0].vacancy_count, 1);
});

test('Cupos por prioridad: Matriz semanal + Generar Mes con Bodegas Operador DHL (4C+1A lun/sáb, 3C+2A mar-vie, 5A dom)', () => {
  const templates = [
    {
      area_id: 'area-bodegas',
      position_id: 'pos-dhl',
      shift_id: 'shift-am05',
      required_count: 5,
      days_of_week: [1, 6, 0],
      priority: 'CRITICAL',
      area: { name: 'Bodegas' },
      position: { name: 'Operador DHL' },
      shift: { name: 'AM 05', start_time: '05:00:00' },
    },
    {
      area_id: 'area-bodegas',
      position_id: 'pos-dhl',
      shift_id: 'shift-am04',
      required_count: 5,
      days_of_week: [2, 3, 4, 5],
      priority: 'CRITICAL',
      area: { name: 'Bodegas' },
      position: { name: 'Operador DHL' },
      shift: { name: 'AM 04', start_time: '04:00:00' },
    },
  ];

  const templateQuotas: TemplatePriorityQuotaRow[] = [
    // Lun(1) y Sáb(6): AM05 = 4 Críticos + 1 Alto
    ...[1, 6].flatMap((dow) => [
      { area_id: 'area-bodegas', position_id: 'pos-dhl', shift_id: 'shift-am05', day_of_week: dow, priority: 'CRITICAL', required_count: 4 },
      { area_id: 'area-bodegas', position_id: 'pos-dhl', shift_id: 'shift-am05', day_of_week: dow, priority: 'HIGH', required_count: 1 },
    ]),
    // Dom(0): AM05 = 5 Altos
    { area_id: 'area-bodegas', position_id: 'pos-dhl', shift_id: 'shift-am05', day_of_week: 0, priority: 'HIGH', required_count: 5 },
    // Mar(2)-Vie(5): AM04 = 3 Críticos + 2 Altos
    ...[2, 3, 4, 5].flatMap((dow) => [
      { area_id: 'area-bodegas', position_id: 'pos-dhl', shift_id: 'shift-am04', day_of_week: dow, priority: 'CRITICAL', required_count: 3 },
      { area_id: 'area-bodegas', position_id: 'pos-dhl', shift_id: 'shift-am04', day_of_week: dow, priority: 'HIGH', required_count: 2 },
    ]),
  ];

  const matrix = buildWeeklyMatrix(templates, templateQuotas);
  assert.equal(matrix.length, 1);
  const am05Row = matrix[0].shifts.find((s) => s.shiftId === 'shift-am05')!;
  const am04Row = matrix[0].shifts.find((s) => s.shiftId === 'shift-am04')!;
  assert.deepEqual(am05Row.priorityQuotas['1'], [
    { priority: 'CRITICAL', required_count: 4 },
    { priority: 'HIGH', required_count: 1 },
  ]);
  assert.deepEqual(am05Row.priorityQuotas['0'], [
    { priority: 'HIGH', required_count: 5 },
  ]);
  assert.deepEqual(am04Row.priorityQuotas['2'], [
    { priority: 'CRITICAL', required_count: 3 },
    { priority: 'HIGH', required_count: 2 },
  ]);

  // Materializar semana 2026-12-07 (Lun) .. 2026-12-13 (Dom)
  const generated = buildConsolidatedRequirements(templates, '2026-12-07', '2026-12-13', { templateQuotas });
  assert.equal(generated.length, 7);

  const mon = generated.find((g) => g.date === '2026-12-07')!;
  assert.equal(mon.shift_id, 'shift-am05');
  assert.equal(mon.required_count, 5);
  assert.deepEqual(mon.priority_quotas, [
    { priority: 'CRITICAL', required_count: 4 },
    { priority: 'HIGH', required_count: 1 },
  ]);

  const tue = generated.find((g) => g.date === '2026-12-08')!;
  assert.equal(tue.shift_id, 'shift-am04');
  assert.deepEqual(tue.priority_quotas, [
    { priority: 'CRITICAL', required_count: 3 },
    { priority: 'HIGH', required_count: 2 },
  ]);

  const sun = generated.find((g) => g.date === '2026-12-13')!;
  assert.equal(sun.shift_id, 'shift-am05');
  assert.equal(sun.priority, 'HIGH');
  assert.deepEqual(sun.priority_quotas, [
    { priority: 'HIGH', required_count: 5 },
  ]);
});

test('v2: atiende cupos Críticos de todas las áreas antes que los Altos y reporta cobertura/vacantes por prioridad', () => {
  // Solo 4 operadores disponibles el lunes 2026-12-07:
  // - Bodegas DHL AM05 requiere 4 Críticos + 1 Alto (total 5)
  // - Base Minerquim Grúa AM07 requiere 1 Crítico
  // Como hay 4 personas para 6 cupos (5 Críticos + 1 Alto), se deben cubrir 4 Críticos (0 Altos),
  // dejando 1 Crítico vacante y 1 Alto vacante.
  const personnel: PersonnelScheduleProfile[] = ['p1', 'p2', 'p3', 'p4'].map((id) => ({
    personnel_id: id,
    first_name: id,
    full_name: id,
    main_position: 'pos-dhl',
    secondary_positions: ['pos-grua'],
    area_id: 'area-bodegas',
  }));

  const rawRequirements: RawShiftRequirement[] = [
    {
      id: 'req-dhl-mon',
      date: '2026-12-07',
      area_id: 'area-bodegas',
      position_id: 'pos-dhl',
      shift_id: 'shift-am05',
      required_count: 5,
      priority: 'CRITICAL',
      priority_quotas: [
        { priority: 'CRITICAL', required_count: 4 },
        { priority: 'HIGH', required_count: 1 },
      ],
      is_extra: false,
      shift: { name: 'AM 05', start_time: '05:00:00', end_time: '14:00:00', duration_hours: 8 },
    },
    {
      id: 'req-base-mon',
      date: '2026-12-07',
      area_id: 'area-base',
      position_id: 'pos-grua',
      shift_id: 'shift-am07',
      required_count: 1,
      priority: 'CRITICAL',
      is_extra: false,
      shift: { name: 'AM 07', start_time: '07:00:00', end_time: '16:00:00', duration_hours: 8 },
    },
  ];

  const res = scheduleCrossArea({
    startDate: '2026-12-07',
    endDate: '2026-12-07',
    rawRequirements,
    existingAssignments: [],
    personnel,
  });

  assert.equal(res.stats.total_required, 6);
  assert.equal(res.stats.total_covered, 4);
  assert.equal(res.stats.total_vacancies, 2);

  assert.deepEqual(res.coverage.ordinary.by_priority?.CRITICAL, {
    required: 5,
    covered: 4,
    vacancies: 1,
  });
  assert.deepEqual(res.coverage.ordinary.by_priority?.HIGH, {
    required: 1,
    covered: 0,
    vacancies: 1,
  });

  // Las vacantes restantes conservan su prioridad específica
  const highVac = res.remaining_vacancies.find((v) => v.priority === 'HIGH');
  assert.ok(highVac);
  assert.equal(highVac.vacancy_count, 1);
});

test('v2: un cupo Alto de DHL no desplaza un cupo Crítico de otra área', () => {
  // Escenario de competencia:
  // - 4 operadores DHL puros (solo DHL)
  // - 1 operador polivalente (principal: Grúa Horquilla, secundario: Operador DHL)
  // - Base Minerquim Grúa AM07 requiere 1 Crítico
  // - Bodegas DHL AM05 requiere 4 Críticos + 1 Alto
  // El cupo Crítico de Base Minerquim debe quedar cubierto (1/1) y el cupo Alto de DHL NO debe desplazarlo
  // (queda 0/1 Alto en DHL, 4/4 Críticos en DHL, 1/1 Crítico en Base).
  const personnel: PersonnelScheduleProfile[] = [
    ...['dhl-1', 'dhl-2', 'dhl-3', 'dhl-4'].map((id) => ({
      personnel_id: id,
      first_name: id,
      full_name: id,
      main_position: 'pos-dhl',
      secondary_positions: [],
      area_id: 'area-bodegas',
    })),
    {
      personnel_id: 'poly-1',
      first_name: 'Poly',
      full_name: 'Poly Operator',
      main_position: 'pos-grua',
      secondary_positions: ['pos-dhl'],
      area_id: 'area-base',
    },
  ];

  const rawRequirements: RawShiftRequirement[] = [
    {
      id: 'req-dhl-mon',
      date: '2026-12-07',
      area_id: 'area-bodegas',
      position_id: 'pos-dhl',
      shift_id: 'shift-am05',
      required_count: 5,
      priority: 'CRITICAL',
      priority_quotas: [
        { priority: 'CRITICAL', required_count: 4 },
        { priority: 'HIGH', required_count: 1 },
      ],
      is_extra: false,
      shift: { name: 'AM 05', start_time: '05:00:00', end_time: '14:00:00', duration_hours: 8 },
    },
    {
      id: 'req-base-mon',
      date: '2026-12-07',
      area_id: 'area-base',
      position_id: 'pos-grua',
      shift_id: 'shift-am07',
      required_count: 1,
      priority: 'CRITICAL',
      is_extra: false,
      shift: { name: 'AM 07', start_time: '07:00:00', end_time: '16:00:00', duration_hours: 8 },
    },
  ];

  // Simulamos que además no hay nadie libre para el cupo Alto si poly-1 está en Base (o incluso si solo 4 personas existen):
  // Con 4 personas totales (3 DHL + 1 poly-1): 4 cupos Críticos en juego (3 DHL + 1 Base) vs 1 Alto DHL.
  const resScarce = scheduleCrossArea({
    startDate: '2026-12-07',
    endDate: '2026-12-07',
    rawRequirements,
    existingAssignments: [],
    personnel: personnel.slice(1), // 3 DHL + 1 poly-1 = 4 personas para 5 Críticos + 1 Alto
  });

  // Base Crítico debe quedar cubierto por poly-1 y NO ser desplazado por el Alto de DHL
  const baseAss = resScarce.ordinary_assignments.filter((a) => a.area_id === 'area-base');
  assert.equal(baseAss.length, 1);
  assert.equal(baseAss[0].personnel_id, 'poly-1');

  // El cupo Alto de DHL queda vacante (0/1), sin desplazar a Base Crítico
  assert.deepEqual(resScarce.coverage.ordinary.by_priority?.HIGH, {
    required: 1,
    covered: 0,
    vacancies: 1,
  });
});
