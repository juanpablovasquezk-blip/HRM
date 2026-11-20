import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConsolidatedRequirements } from '../../../app/(dashboard)/shifts/dotacion/materialize-utils';
import {
  buildGenerateMonthHolidayPreview,
  CHILE_NATIONAL_HOLIDAYS_BY_YEAR,
  findHolidayZeroStaffingRequirementIds,
  getChileNationalHolidaysForRange,
} from './chile-holidays';
import {
  buildBlueExpressApplyPlan,
  calculateBlueExpressNightStaffingProposal,
  getInitialApprovedTrucksByWeekday,
} from './blue-express';
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
    '2030-05-01',
    '2030-05-31',
    { areaNameById, positionNameById, warningsOut: warnings }
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /2030/);
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

test('ROSTER-02A (2027): calendario 2027 verificado, limpieza puntual 2027-01-01 y sin faltas en vista previa ni Planificación Diaria', async () => {
  const {
    CHILE_NATIONAL_HOLIDAYS_BY_YEAR,
    evaluateDailyPlanningVacancies,
    findHolidayZeroStaffingRequirementIds,
  } = await import('./index');

  assert.ok(CHILE_NATIONAL_HOLIDAYS_BY_YEAR[2027]);
  assert.ok(CHILE_NATIONAL_HOLIDAYS_BY_YEAR[2027].source.includes('Gob.cl'));
  assert.equal(CHILE_NATIONAL_HOLIDAYS_BY_YEAR[2027].holidays.length, 17);
  assert.ok(CHILE_NATIONAL_HOLIDAYS_BY_YEAR[2027].holidays.some((h) => h.date === '2027-01-01' && h.irrenunciable));

  // Simular requerimientos generados en HRM el 2027-01-01 con nombres reales de catálogo
  const jan01Rows = [
    {
      id: 'atrex-grua',
      date: '2027-01-01',
      area_id: 'a-atrex',
      position_id: 'p-grua',
      shift_id: 's-am0830',
      required_count: 1,
      is_extra: false,
      area: { name: 'Atrex' },
      position: { name: 'Operador Grúa Horquilla' },
    },
    {
      id: 'base-grua',
      date: '2027-01-01',
      area_id: 'a-base',
      position_id: 'p-grua',
      shift_id: 's-am07',
      required_count: 1,
      is_extra: false,
      area: { name: 'Base Minerquim' },
      position: { name: 'Operador Grúa Horquilla' },
    },
    {
      id: 'base-sup',
      date: '2027-01-01',
      area_id: 'a-base',
      position_id: 'p-sup',
      shift_id: 's-am07',
      required_count: 1,
      is_extra: false,
      area: { name: 'Base Minerquim' },
      position: { name: 'Supervisor Base' },
    },
    {
      id: 'blue-cond',
      date: '2027-01-01',
      area_id: 'a-blue',
      position_id: 'p-cond',
      shift_id: 's-am00',
      required_count: 2,
      is_extra: false,
      area: { name: 'BlueExpress' },
      position: { name: 'Conductor Camion' },
    },
    {
      id: 'atrex-grua-extra',
      date: '2027-01-01',
      area_id: 'a-atrex',
      position_id: 'p-grua',
      shift_id: 's-am0830',
      required_count: 1,
      is_extra: true,
      area: { name: 'Atrex' },
      position: { name: 'Operador Grúa Horquilla' },
    },
  ];

  // 1. Corrección puntual: selecciona solo los 3 pares ordinarios y conserva BlueExpress y extras
  const cleanup = findHolidayZeroStaffingRequirementIds(jan01Rows, '2027-01-01');
  assert.equal(cleanup.isNationalHoliday, true);
  assert.equal(cleanup.holidayName, 'Año Nuevo');
  assert.deepEqual(cleanup.matchedIds, ['atrex-grua', 'base-grua', 'base-sup']);

  // 2. Vista previa v2 no reporta esos 3 pares como vacantes ni faltantes el 2027-01-01
  const areaNames = new Map([
    ['a-atrex', 'Atrex'],
    ['a-base', 'Base Minerquim'],
    ['a-blue', 'BlueExpress'],
  ]);
  const posNames = new Map([
    ['p-grua', 'Operador Grúa Horquilla'],
    ['p-sup', 'Supervisor Base'],
    ['p-cond', 'Conductor Camion'],
  ]);
  const v2Res = scheduleCrossArea({
    startDate: '2027-01-01',
    endDate: '2027-01-01',
    rawRequirements: jan01Rows.filter((r) => !r.is_extra),
    existingAssignments: [],
    personnel: [],
    areaNameById: areaNames,
    positionNameById: posNames,
  });
  assert.equal(v2Res.stats.total_required, 2);
  assert.equal(v2Res.remaining_vacancies.length, 1);
  assert.equal(v2Res.remaining_vacancies[0].area_id, 'a-blue');

  // 3. Planificación Diaria tampoco reporta esos 3 pares como faltantes el 2027-01-01
  const daily = evaluateDailyPlanningVacancies({
    date: '2027-01-01',
    ordinaryRequirements: jan01Rows.filter((r) => !r.is_extra),
    extraRequirements: [],
    assignments: [],
    areaNameById: areaNames,
    positionNameById: posNames,
  });
  const atrexSlot = daily.slots.find((s) => s.area_id === 'a-atrex');
  assert.equal(atrexSlot?.suppressed_by_holiday, true);
  assert.equal(atrexSlot?.open_falta_count, 0);
  const blueSlot = daily.slots.find((s) => s.area_id === 'a-blue');
  assert.equal(blueSlot?.open_falta_count, 2);
});

test('Generar Mes: rango que cruza de año (2026-12-07..2027-01-03), bloqueo si falta año (2030) y cálculo Blue Express en el mismo flujo', () => {
  // 1. Rango 2026-12-07 al 2027-01-03 detecta feriados de ambos años y los 3 cupos existentes del 1 de enero a corregir
  const preview2627 = buildGenerateMonthHolidayPreview({
    startDate: '2026-12-07',
    endDate: '2027-01-03',
    existingOrdinaryRows: [
      {
        id: 'atrex-grua',
        date: '2027-01-01',
        required_count: 1,
        is_extra: false,
        area: { name: 'Atrex' },
        position: { name: 'Operador Grúa Horquilla' },
        shift: { name: 'Turno Día' },
      },
      {
        id: 'base-grua',
        date: '2027-01-01',
        required_count: 1,
        is_extra: false,
        area: { name: 'Base Minerquim' },
        position: { name: 'Operador Grúa Horquilla' },
        shift: { name: 'Turno Día' },
      },
      {
        id: 'base-sup',
        date: '2027-01-01',
        required_count: 1,
        is_extra: false,
        area: { name: 'Base Minerquim' },
        position: { name: 'Supervisor Base' },
        shift: { name: 'Turno Día' },
      },
      {
        id: 'blue-keep',
        date: '2027-01-01',
        required_count: 2,
        is_extra: false,
        area: { name: 'BlueExpress' },
        position: { name: 'Conductor Camion' },
        shift: { name: 'AM 00' },
      },
      {
        id: 'atrex-extra-keep',
        date: '2027-01-01',
        required_count: 1,
        is_extra: true,
        area: { name: 'Atrex' },
        position: { name: 'Operador Grúa Horquilla' },
        shift: { name: 'Turno Día' },
      },
    ],
  });

  assert.equal(preview2627.has_unverified_years, false);
  assert.deepEqual(preview2627.missing_years, []);
  assert.deepEqual(
    preview2627.holidays.map((h) => h.date),
    ['2026-12-08', '2026-12-25', '2027-01-01']
  );
  assert.deepEqual(
    preview2627.existing_zero_staffing_to_fix.map((x) => x.id),
    ['atrex-grua', 'base-grua', 'base-sup']
  );

  // 2. Rango que cruza a un año sin cobertura verificada (2030) bloquea el guardado automático
  const previewMissingYear = buildGenerateMonthHolidayPreview({
    startDate: '2029-12-28',
    endDate: '2030-01-04',
    existingOrdinaryRows: [],
  });
  assert.equal(previewMissingYear.has_unverified_years, true);
  assert.ok(previewMissingYear.missing_years.includes(2030));
  assert.ok(previewMissingYear.warnings.some((w) => w.includes('2030')));

  // 3. En el mismo flujo de Generar Mes, Blue Express sigue calculando su propuesta para 2026-12-07..2027-01-03
  const blueProposal = calculateBlueExpressNightStaffingProposal({
    targetStartDate: '2026-12-07',
    targetEndDate: '2027-01-03',
    referenceDate: '2026-11-20',
    identifiers: {
      areaId: 'a-blue',
      areaName: 'BlueExpress',
      shiftId: 's-am00',
      shiftName: 'AM 00',
      conductorPositionId: 'p-cond',
      conductorPositionName: 'Conductor Camion',
      ayudantePositionId: 'p-ayud',
      ayudantePositionName: 'Ayudante Carga/Descarga',
    },
    historyRequirements: [],
    historyAssignments: [],
    targetExistingRequirements: [],
  });
  assert.equal(blueProposal.target_start_date, '2026-12-07');
  assert.equal(blueProposal.target_end_date, '2027-01-03');
  assert.equal(blueProposal.weekdays.length, 7);
});

test('Generar Mes ruta integrada 2026-12-07..2027-01-03: 17 cupos 2027-01-01 (limpia solo 3 y conserva 14 + extras) y aplica pauta aprobada Blue Express (48/48)', () => {
  const jan1Other14 = Array.from({ length: 14 }, (_, idx) => ({
    id: `other-ord-${idx + 1}`,
    date: '2027-01-01',
    required_count: 1,
    is_extra: false,
    area: { name: idx < 2 ? 'BlueExpress' : `Area ${idx + 1}` },
    position: { name: idx < 2 ? (idx === 0 ? 'Conductor Camion' : 'Ayudante Carga/Descarga') : `Cargo ${idx + 1}` },
    shift: { name: idx < 2 ? 'AM 00' : 'AM 08' },
  }));
  const jan1All17 = [
    {
      id: '478a2b9a-9408-49ce-bf59-d31413919e15',
      date: '2027-01-01',
      required_count: 1,
      is_extra: false,
      area: { name: 'Atrex' },
      position: { name: 'Operador Grúa Horquilla' },
      shift: { name: 'AM 08' },
    },
    {
      id: '05ee61d0-9da9-4ac2-ab02-27fd80371711',
      date: '2027-01-01',
      required_count: 1,
      is_extra: false,
      area: { name: 'Base Minerquim' },
      position: { name: 'Operador Grúa Horquilla' },
      shift: { name: 'AM 08' },
    },
    {
      id: 'a55ccbc0-f9e6-4b53-aadb-d9d0d42fdeda',
      date: '2027-01-01',
      required_count: 1,
      is_extra: false,
      area: { name: 'Base Minerquim' },
      position: { name: 'Supervisor Base' },
      shift: { name: 'AM 08' },
    },
    ...jan1Other14,
  ];
  const jan1Extra = {
    id: 'extra-keep-1',
    date: '2027-01-01',
    required_count: 1,
    is_extra: true,
    area: { name: 'Atrex' },
    position: { name: 'Operador Grúa Horquilla' },
    shift: { name: 'AM 08' },
  };

  // Vista previa antes de confirmar muestra los 3 cupos del 1 de enero a corregir
  const preview = buildGenerateMonthHolidayPreview({
    startDate: '2026-12-07',
    endDate: '2027-01-03',
    existingOrdinaryRows: [...jan1All17, jan1Extra],
  });
  assert.deepEqual(
    preview.existing_zero_staffing_to_fix.map((x) => x.id),
    [
      '478a2b9a-9408-49ce-bf59-d31413919e15',
      '05ee61d0-9da9-4ac2-ab02-27fd80371711',
      'a55ccbc0-f9e6-4b53-aadb-d9d0d42fdeda',
    ]
  );

  // Limpieza en Generar Mes usa findHolidayZeroStaffingRequirementIds por cada fecha feriada y matchedIds
  const rangeLookup = getChileNationalHolidaysForRange('2026-12-07', '2027-01-03');
  const holidayDatesInRange = Array.from(rangeLookup.holidaysByDate.keys());
  assert.deepEqual(holidayDatesInRange, ['2026-12-08', '2026-12-25', '2027-01-01']);

  const allRows = [...jan1All17, jan1Extra];
  const idsToDelete: string[] = [];
  for (const holidayDate of holidayDatesInRange) {
    const rowsForDate = allRows.filter((r) => r.date === holidayDate);
    const { matchedIds } = findHolidayZeroStaffingRequirementIds(rowsForDate, holidayDate);
    idsToDelete.push(...matchedIds);
  }
  assert.deepEqual(idsToDelete, [
    '478a2b9a-9408-49ce-bf59-d31413919e15',
    '05ee61d0-9da9-4ac2-ab02-27fd80371711',
    'a55ccbc0-f9e6-4b53-aadb-d9d0d42fdeda',
  ]);
  const remainingOrdinary = jan1All17.filter((r) => !idsToDelete.includes(r.id));
  assert.equal(remainingOrdinary.length, 14);
  assert.ok(!idsToDelete.includes(jan1Extra.id));

  // Propuesta aprobada Blue Express (3,2,2,1,2,1,1 -> 48 conductor y 48 ayudante) en el mismo rango
  const blueProposal = calculateBlueExpressNightStaffingProposal({
    targetStartDate: '2026-12-07',
    targetEndDate: '2027-01-03',
    referenceDate: '2026-11-20',
    identifiers: {
      areaId: 'a-blue',
      areaName: 'BlueExpress',
      shiftId: 's-am00',
      shiftName: 'AM 00',
      conductorPositionId: 'p-cond',
      conductorPositionName: 'Conductor Camion',
      ayudantePositionId: 'p-ayud',
      ayudantePositionName: 'Ayudante Carga/Descarga',
    },
    historyRequirements: [],
    historyAssignments: [],
    targetExistingRequirements: [],
  });
  const approved = { 1: 3, 2: 2, 3: 2, 4: 1, 5: 2, 6: 1, 7: 1 };
  const applyPlan = buildBlueExpressApplyPlan(blueProposal, approved);
  const totalCond = applyPlan
    .filter((r) => r.position_id === 'p-cond')
    .reduce((acc, r) => acc + r.required_count, 0);
  const totalAyud = applyPlan
    .filter((r) => r.position_id === 'p-ayud')
    .reduce((acc, r) => acc + r.required_count, 0);
  assert.equal(totalCond, 48);
  assert.equal(totalAyud, 48);
});
