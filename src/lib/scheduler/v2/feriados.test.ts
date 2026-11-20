import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConsolidatedRequirements } from '../../../app/(dashboard)/shifts/dotacion/materialize-utils';
import { CHILE_NATIONAL_HOLIDAYS_BY_YEAR } from './chile-holidays';
import { scheduleCrossArea } from './cobertura';
import type {
  PersonnelScheduleProfile,
  RawExistingAssignment,
  RawShiftRequirement,
} from './types';

const areaNameById = new Map<string, string>([
  ['area-atrex', 'Atrex'],
  ['area-base', 'Base'],
  ['area-aero', 'Aeropuerto'],
]);

const positionNameById = new Map<string, string>([
  ['pos-grua', 'Operador de grúa'],
  ['pos-sup', 'Supervisor'],
  ['pos-aero', 'Operador Aeropuerto'],
]);

test('ROSTER-02A: calendario nacional verificado registra fuente, fecha y avisa si falta el año', () => {
  assert.ok(CHILE_NATIONAL_HOLIDAYS_BY_YEAR[2026]);
  assert.match(CHILE_NATIONAL_HOLIDAYS_BY_YEAR[2026].source, /Gob\.cl|LeyChile/);
  assert.equal(CHILE_NATIONAL_HOLIDAYS_BY_YEAR[2026].reviewed_at, '2026-11-20');

  const warnings: string[] = [];
  buildConsolidatedRequirements(
    [],
    '2027-05-01',
    '2027-05-31',
    { areaNameById, positionNameById, warningsOut: warnings }
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /2027/);
});

test('ROSTER-02A: Generar Mes deja en cero los 3 pares en feriado nacional y mantiene normal en día hábil y feriado regional', () => {
  const templates = [
    {
      area_id: 'area-atrex',
      position_id: 'pos-grua',
      shift_id: 'shift-am07',
      required_count: 1,
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
      priority: 'HIGH',
    },
    {
      area_id: 'area-base',
      position_id: 'pos-grua',
      shift_id: 'shift-am07',
      required_count: 1,
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
      priority: 'NORMAL',
    },
    {
      area_id: 'area-base',
      position_id: 'pos-sup',
      shift_id: 'shift-am07',
      required_count: 1,
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
      priority: 'CRITICAL',
    },
    {
      area_id: 'area-aero',
      position_id: 'pos-aero',
      shift_id: 'shift-am07',
      required_count: 2,
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
      priority: 'HIGH',
    },
  ];

  // 1) Feriado nacional (2026-09-18) vs día normal (2026-09-17)
  const septInserts = buildConsolidatedRequirements(
    templates,
    '2026-09-17',
    '2026-09-18',
    { areaNameById, positionNameById }
  );

  const dayNormal = septInserts.filter((i) => i.date === '2026-09-17');
  const dayHoliday = septInserts.filter((i) => i.date === '2026-09-18');

  // Día normal: los 4 cupos se generan
  assert.equal(dayNormal.length, 4);
  // Feriado nacional: solo queda Aeropuerto (los 3 pares quedan en 0 / omitidos)
  assert.equal(dayHoliday.length, 1);
  assert.equal(dayHoliday[0].area_id, 'area-aero');
  assert.equal(dayHoliday[0].required_count, 2);

  // 2) Feriado exclusivamente regional/comunal (2026-08-20 Chillán, 2026-06-07 Arica): dotación normal
  const aug20 = buildConsolidatedRequirements(templates, '2026-08-20', '2026-08-20', {
    areaNameById,
    positionNameById,
  });
  const jun07 = buildConsolidatedRequirements(templates, '2026-06-07', '2026-06-07', {
    areaNameById,
    positionNameById,
  });
  assert.equal(aug20.length, 4);
  assert.equal(jun07.length, 4);
});

test('ROSTER-02A: mes ya generado excluye los 3 pares en feriado nacional sin reportar vacantes, conservando protegidos y extras manuales', () => {
  // Simula cupos ya materializados en DB para el feriado nacional 2026-09-18
  const alreadyGenerated: RawShiftRequirement[] = [
    {
      id: 'req-atrex-grua',
      date: '2026-09-18',
      area_id: 'area-atrex',
      position_id: 'pos-grua',
      shift_id: 'shift-am07',
      required_count: 1,
      priority: 'HIGH',
      is_extra: false,
    },
    {
      id: 'req-base-grua',
      date: '2026-09-18',
      area_id: 'area-base',
      position_id: 'pos-grua',
      shift_id: 'shift-am07',
      required_count: 1,
      priority: 'NORMAL',
      is_extra: false,
    },
    {
      id: 'req-base-sup',
      date: '2026-09-18',
      area_id: 'area-base',
      position_id: 'pos-sup',
      shift_id: 'shift-am07',
      required_count: 1,
      priority: 'CRITICAL',
      is_extra: false,
    },
    {
      id: 'req-aero',
      date: '2026-09-18',
      area_id: 'area-aero',
      position_id: 'pos-aero',
      shift_id: 'shift-am07',
      required_count: 1,
      priority: 'HIGH',
      is_extra: false,
      shift: { name: 'AM 07', start_time: '07:00', end_time: '15:00', duration_hours: 8 },
    },
    {
      id: 'req-extra-manual',
      date: '2026-09-18',
      area_id: 'area-base',
      position_id: 'pos-grua',
      shift_id: 'shift-am07',
      required_count: 1,
      priority: 'NORMAL',
      is_extra: true,
    },
  ];

  // Conserva un turno protegido en Base Grúa y un extra manual
  const existing: RawExistingAssignment[] = [
    {
      id: 'prot-base-grua',
      personnel_id: 'op-grua-1',
      date: '2026-09-18',
      area_id: 'area-base',
      position_id: 'pos-grua',
      shift_id: 'shift-am07',
      is_manual: true,
      is_extra: false,
    },
    {
      id: 'manual-extra-1',
      personnel_id: 'op-extra-1',
      date: '2026-09-18',
      area_id: 'area-base',
      position_id: 'pos-grua',
      shift_id: 'shift-am07',
      is_manual: true,
      is_extra: true,
    },
  ];

  const personnel: PersonnelScheduleProfile[] = [
    {
      personnel_id: 'op-aero-1',
      first_name: 'Aero 1',
      main_position: 'pos-aero',
      area_id: 'area-aero',
      rotation_pattern: '5x2',
    },
  ];

  const result = scheduleCrossArea({
    startDate: '2026-09-18',
    endDate: '2026-09-18',
    rawRequirements: alreadyGenerated,
    existingAssignments: existing,
    personnel,
    areaNameById,
    positionNameById,
    referenceDate: new Date('2026-09-01T12:00:00Z'),
  });

  // Los 3 pares excluidos NO se asignan y NO se reportan como vacantes; solo queda Aeropuerto (1/1 cubierto)
  assert.equal(result.stats.total_required, 1);
  assert.equal(result.stats.total_covered, 1);
  assert.equal(result.stats.total_vacancies, 0);
  assert.equal(result.remaining_vacancies.length, 0);
  assert.equal(result.ordinary_assignments.length, 1);
  assert.equal(result.ordinary_assignments[0].area_id, 'area-aero');

  // El requerimiento extra manual y su cobertura protegida se conservan intactos
  assert.equal(result.coverage.extra.total_required, 1);
  assert.equal(result.coverage.extra.total_covered, 1);
});

test('ROSTER-02A: nombre parecido como Bodega Base — Supervisor de Bodega mantiene su dotación en Generar Mes y en v2', () => {
  const localAreaNames = new Map<string, string>([
    ...areaNameById.entries(),
    ['area-bodega-base', 'Bodega Base'],
  ]);
  const localPosNames = new Map<string, string>([
    ...positionNameById.entries(),
    ['pos-sup-bodega', 'Supervisor de Bodega'],
  ]);

  // 1) En Generar Mes (2026-09-18 feriado nacional): Base—Supervisor se omite, Bodega Base—Supervisor de Bodega se mantiene
  const templates = [
    {
      area_id: 'area-base',
      position_id: 'pos-sup',
      shift_id: 'shift-am07',
      required_count: 1,
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
      priority: 'CRITICAL',
    },
    {
      area_id: 'area-bodega-base',
      position_id: 'pos-sup-bodega',
      shift_id: 'shift-am07',
      required_count: 1,
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
      priority: 'HIGH',
    },
  ];

  const generated = buildConsolidatedRequirements(templates, '2026-09-18', '2026-09-18', {
    areaNameById: localAreaNames,
    positionNameById: localPosNames,
  });
  assert.equal(generated.length, 1);
  assert.equal(generated[0].area_id, 'area-bodega-base');
  assert.equal(generated[0].position_id, 'pos-sup-bodega');

  // 2) En v2 (con ambos cupos ya generados para 2026-09-18): Base—Supervisor se excluye y Bodega Base—Supervisor de Bodega se conserva y asigna
  const existingReqs: RawShiftRequirement[] = [
    {
      id: 'req-base-sup-only',
      date: '2026-09-18',
      area_id: 'area-base',
      position_id: 'pos-sup',
      shift_id: 'shift-am07',
      required_count: 1,
      priority: 'CRITICAL',
      is_extra: false,
    },
    {
      id: 'req-bodega-sup',
      date: '2026-09-18',
      area_id: 'area-bodega-base',
      position_id: 'pos-sup-bodega',
      shift_id: 'shift-am07',
      required_count: 1,
      priority: 'HIGH',
      is_extra: false,
      shift: { name: 'AM 07', start_time: '07:00', end_time: '15:00', duration_hours: 8 },
    },
  ];

  const supBodegaWorker: PersonnelScheduleProfile = {
    personnel_id: 'op-sup-bodega',
    first_name: 'Sup Bodega',
    main_position: 'pos-sup-bodega',
    area_id: 'area-bodega-base',
    rotation_pattern: '5x2',
  };

  const v2Res = scheduleCrossArea({
    startDate: '2026-09-18',
    endDate: '2026-09-18',
    rawRequirements: existingReqs,
    existingAssignments: [],
    personnel: [supBodegaWorker],
    areaNameById: localAreaNames,
    positionNameById: localPosNames,
    referenceDate: new Date('2026-09-01T12:00:00Z'),
  });

  assert.equal(v2Res.stats.total_required, 1);
  assert.equal(v2Res.stats.total_covered, 1);
  assert.equal(v2Res.ordinary_assignments.length, 1);
  assert.equal(v2Res.ordinary_assignments[0].area_id, 'area-bodega-base');
  assert.equal(v2Res.ordinary_assignments[0].position_id, 'pos-sup-bodega');
});
