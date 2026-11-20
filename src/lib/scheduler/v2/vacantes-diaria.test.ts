import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleCrossArea } from './cobertura';
import {
  buildExtraSelectorItems,
  createExtraAssignmentFromSelector,
  evaluateDailyPlanningVacancies,
  reconcileVacancyExtraRequirements,
} from './vacantes-diaria';
import type {
  DailyPlanningAssignmentRef,
  PersonnelScheduleProfile,
  RawExistingAssignment,
  RawShiftRequirement,
} from './types';

const REF_DATE = new Date('2026-09-01T12:00:00Z');

test('ROSTER-08: 3 requeridos y 2 asignados genera 1 falta + 1 cupo extra asociado; cubrirlo por cualquiera de las 2 vías cierra ambos y cuenta 1 cobertura', () => {
  const reqs: RawShiftRequirement[] = [
    {
      id: 'req-3',
      date: '2026-09-17',
      area_id: 'area-aero',
      position_id: 'pos-aero',
      shift_id: 'shift-am07',
      required_count: 3,
      priority: 'HIGH',
      is_extra: false,
      shift: { name: 'AM 07', start_time: '07:00', end_time: '15:00', duration_hours: 8 },
    },
  ];

  const twoWorkers: PersonnelScheduleProfile[] = [
    { personnel_id: 'op-1', main_position: 'pos-aero', area_id: 'area-aero' },
    { personnel_id: 'op-2', main_position: 'pos-aero', area_id: 'area-aero' },
  ];

  const v2Res = scheduleCrossArea({
    startDate: '2026-09-17',
    endDate: '2026-09-17',
    rawRequirements: reqs,
    existingAssignments: [],
    personnel: twoWorkers,
    referenceDate: REF_DATE,
  });

  assert.equal(v2Res.stats.total_required, 3);
  assert.equal(v2Res.stats.total_covered, 2);
  assert.equal(v2Res.stats.total_vacancies, 1);

  const reconciled = reconcileVacancyExtraRequirements({
    v2Result: v2Res,
    existingExtraRequirements: [],
    rangeStart: '2026-09-17',
    rangeEnd: '2026-09-17',
  });

  assert.equal(reconciled.extra_requirements.length, 1);
  assert.equal(reconciled.extra_requirements[0].auto_vacancy_count, 1);
  assert.equal(reconciled.extra_requirements[0].required_count, 1);

  const baseAssignments: DailyPlanningAssignmentRef[] = v2Res.ordinary_assignments.map((a) => ({
    personnel_id: a.personnel_id,
    date: a.date,
    area_id: a.area_id,
    position_id: a.position_id,
    shift_id: a.shift_id,
    is_extra: false,
  }));

  // Estado inicial: 1 falta y 1 cupo extra asociado
  const beforeCover = evaluateDailyPlanningVacancies({
    date: '2026-09-17',
    ordinaryRequirements: reqs,
    extraRequirements: reconciled.extra_requirements,
    assignments: baseAssignments,
  });
  assert.equal(beforeCover.total_open_faltas, 1);
  assert.equal(beforeCover.total_open_linked_extras, 1);
  assert.equal(beforeCover.slots[0].effective_ordinary_coverage, 2);

  // Vía 1: cubrir directamente la falta ordinaria
  const coveredViaOrdinary = evaluateDailyPlanningVacancies({
    date: '2026-09-17',
    ordinaryRequirements: reqs,
    extraRequirements: reconciled.extra_requirements,
    assignments: [
      ...baseAssignments,
      {
        personnel_id: 'op-3',
        date: '2026-09-17',
        area_id: 'area-aero',
        position_id: 'pos-aero',
        shift_id: 'shift-am07',
        is_extra: false,
      },
    ],
  });
  assert.equal(coveredViaOrdinary.total_open_faltas, 0);
  assert.equal(coveredViaOrdinary.total_open_linked_extras, 0);
  assert.equal(coveredViaOrdinary.slots[0].effective_ordinary_coverage, 3);

  // Vía 2: cubrir por Dotación Extra vinculado a vacante (extra_target: 'v2_vacancy')
  const coveredViaExtra = evaluateDailyPlanningVacancies({
    date: '2026-09-17',
    ordinaryRequirements: reqs,
    extraRequirements: reconciled.extra_requirements,
    assignments: [
      ...baseAssignments,
      {
        personnel_id: 'op-extra-3',
        date: '2026-09-17',
        area_id: 'area-aero',
        position_id: 'pos-aero',
        shift_id: 'shift-am07',
        is_extra: true,
        extra_target: 'v2_vacancy',
      },
    ],
  });
  assert.equal(coveredViaExtra.total_open_faltas, 0);
  assert.equal(coveredViaExtra.total_open_linked_extras, 0);
  assert.equal(coveredViaExtra.slots[0].effective_ordinary_coverage, 3);
});

test('ROSTER-08: extra manual cubierto en misma fecha/área/cargo/turno mantiene abierta la falta ordinaria hasta cubrir el cupo vinculado', () => {
  const reqs: RawShiftRequirement[] = [
    {
      id: 'req-ord-3',
      date: '2026-09-17',
      area_id: 'area-aero',
      position_id: 'pos-aero',
      shift_id: 'shift-am07',
      required_count: 3,
      priority: 'HIGH',
      is_extra: false,
    },
  ];

  // 2 ordinarios asignados -> 1 falta ordinaria; además 1 extra manual en el mismo slot
  const extraReqs = [
    {
      id: 'ext-shared-1',
      date: '2026-09-17',
      area_id: 'area-aero',
      position_id: 'pos-aero',
      shift_id: 'shift-am07',
      manual_count: 1,
      auto_vacancy_count: 1,
      required_count: 2,
      is_extra: true as const,
      linked_requirement_id: 'req-ord-3',
    },
  ];

  const ordinaryTwo: DailyPlanningAssignmentRef[] = [
    {
      personnel_id: 'op-1',
      date: '2026-09-17',
      area_id: 'area-aero',
      position_id: 'pos-aero',
      shift_id: 'shift-am07',
      is_extra: false,
    },
    {
      personnel_id: 'op-2',
      date: '2026-09-17',
      area_id: 'area-aero',
      position_id: 'pos-aero',
      shift_id: 'shift-am07',
      is_extra: false,
    },
  ];

  // Paso 1: Se cubre únicamente el extra manual -> la falta ordinaria y su cupo vinculado SIGUEN ABIERTOS
  const withManualCovered = evaluateDailyPlanningVacancies({
    date: '2026-09-17',
    ordinaryRequirements: reqs,
    extraRequirements: extraReqs,
    assignments: [
      ...ordinaryTwo,
      {
        personnel_id: 'op-manual-extra',
        date: '2026-09-17',
        area_id: 'area-aero',
        position_id: 'pos-aero',
        shift_id: 'shift-am07',
        is_extra: true,
        extra_target: 'manual',
      },
    ],
  });

  assert.equal(withManualCovered.total_open_manual_extras, 0);
  assert.equal(withManualCovered.total_open_faltas, 1);
  assert.equal(withManualCovered.total_open_linked_extras, 1);
  assert.equal(withManualCovered.slots[0].extra_filled_manual, 1);
  assert.equal(withManualCovered.slots[0].extra_filled_linked, 0);
  assert.equal(withManualCovered.slots[0].effective_ordinary_coverage, 2);

  // Paso 2: Se cubre también el cupo vinculado -> ambas necesidades quedan cubiertas, cada una por su propia asignación
  const withBothCovered = evaluateDailyPlanningVacancies({
    date: '2026-09-17',
    ordinaryRequirements: reqs,
    extraRequirements: extraReqs,
    assignments: [
      ...ordinaryTwo,
      {
        personnel_id: 'op-manual-extra',
        date: '2026-09-17',
        area_id: 'area-aero',
        position_id: 'pos-aero',
        shift_id: 'shift-am07',
        is_extra: true,
        extra_target: 'manual',
      },
      {
        personnel_id: 'op-linked-extra',
        date: '2026-09-17',
        area_id: 'area-aero',
        position_id: 'pos-aero',
        shift_id: 'shift-am07',
        is_extra: true,
        extra_target: 'v2_vacancy',
        linked_requirement_id: 'req-ord-3',
      },
    ],
  });

  assert.equal(withBothCovered.total_open_manual_extras, 0);
  assert.equal(withBothCovered.total_open_faltas, 0);
  assert.equal(withBothCovered.total_open_linked_extras, 0);
  assert.equal(withBothCovered.slots[0].extra_filled_manual, 1);
  assert.equal(withBothCovered.slots[0].extra_filled_linked, 1);
  assert.equal(withBothCovered.slots[0].effective_ordinary_coverage, 3);
});

test('ROSTER-08: regenerar actualiza pendientes sin duplicados y conserva extras creados manualmente', () => {
  const reqs: RawShiftRequirement[] = [
    {
      id: 'req-3',
      date: '2026-09-17',
      area_id: 'area-aero',
      position_id: 'pos-aero',
      shift_id: 'shift-am07',
      required_count: 3,
      priority: 'HIGH',
      is_extra: false,
      shift: { name: 'AM 07', start_time: '07:00', end_time: '15:00', duration_hours: 8 },
    },
  ];

  // Existe 1 extra manual previo creado por supervisor
  const initialManualExtra = [
    {
      id: 'ext-manual-1',
      date: '2026-09-17',
      area_id: 'area-aero',
      position_id: 'pos-aero',
      shift_id: 'shift-am07',
      required_count: 1,
      is_extra: true as const,
    },
  ];

  // Primera generación: 1 persona -> 2 vacantes
  const run1 = scheduleCrossArea({
    startDate: '2026-09-17',
    endDate: '2026-09-17',
    rawRequirements: reqs,
    existingAssignments: [],
    personnel: [{ personnel_id: 'op-1', main_position: 'pos-aero', area_id: 'area-aero' }],
    referenceDate: REF_DATE,
  });

  const rec1 = reconcileVacancyExtraRequirements({
    v2Result: run1,
    existingExtraRequirements: initialManualExtra,
    rangeStart: '2026-09-17',
    rangeEnd: '2026-09-17',
  });
  assert.equal(rec1.extra_requirements.length, 1);
  assert.equal(rec1.extra_requirements[0].manual_count, 1);
  assert.equal(rec1.extra_requirements[0].auto_vacancy_count, 2);
  assert.equal(rec1.extra_requirements[0].required_count, 3);

  // Segunda generación (regeneración): ahora hay 2 personas -> 1 vacante
  const run2 = scheduleCrossArea({
    startDate: '2026-09-17',
    endDate: '2026-09-17',
    rawRequirements: reqs,
    existingAssignments: [],
    personnel: [
      { personnel_id: 'op-1', main_position: 'pos-aero', area_id: 'area-aero' },
      { personnel_id: 'op-2', main_position: 'pos-aero', area_id: 'area-aero' },
    ],
    referenceDate: REF_DATE,
  });

  const rec2 = reconcileVacancyExtraRequirements({
    v2Result: run2,
    existingExtraRequirements: rec1.extra_requirements,
    rangeStart: '2026-09-17',
    rangeEnd: '2026-09-17',
  });
  assert.equal(rec2.extra_requirements.length, 1); // Sin duplicados
  assert.equal(rec2.extra_requirements[0].manual_count, 1); // Extra manual conservado
  assert.equal(rec2.extra_requirements[0].auto_vacancy_count, 1);
  assert.equal(rec2.extra_requirements[0].required_count, 2);

  // Tercera generación: 3 personas -> 0 vacantes, el extra manual sigue intacto
  const run3 = scheduleCrossArea({
    startDate: '2026-09-17',
    endDate: '2026-09-17',
    rawRequirements: reqs,
    existingAssignments: [],
    personnel: [
      { personnel_id: 'op-1', main_position: 'pos-aero', area_id: 'area-aero' },
      { personnel_id: 'op-2', main_position: 'pos-aero', area_id: 'area-aero' },
      { personnel_id: 'op-3', main_position: 'pos-aero', area_id: 'area-aero' },
    ],
    referenceDate: REF_DATE,
  });

  const rec3 = reconcileVacancyExtraRequirements({
    v2Result: run3,
    existingExtraRequirements: rec2.extra_requirements,
    rangeStart: '2026-09-17',
    rangeEnd: '2026-09-17',
  });
  assert.equal(rec3.extra_requirements.length, 1);
  assert.equal(rec3.extra_requirements[0].manual_count, 1);
  assert.equal(rec3.extra_requirements[0].auto_vacancy_count, 0);
  assert.equal(rec3.extra_requirements[0].required_count, 1);
});

test('ROSTER-08: feriado nacional en mes ya generado no muestra faltas ni genera extras para los 3 pares', () => {
  const areaNameById = new Map([
    ['area-base', 'Base'],
    ['area-aero', 'Aeropuerto'],
  ]);
  const positionNameById = new Map([
    ['pos-sup', 'Supervisor'],
    ['pos-aero', 'Operador Aeropuerto'],
  ]);

  const reqs: RawShiftRequirement[] = [
    {
      id: 'req-base-sup',
      date: '2026-09-18', // Feriado nacional
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
  ];

  // Sin personal -> Aeropuerto queda vacante, Base—Supervisor queda suprimido por feriado
  const v2Res = scheduleCrossArea({
    startDate: '2026-09-18',
    endDate: '2026-09-18',
    rawRequirements: reqs,
    existingAssignments: [],
    personnel: [],
    areaNameById,
    positionNameById,
    referenceDate: REF_DATE,
  });

  const rec = reconcileVacancyExtraRequirements({
    v2Result: v2Res,
    existingExtraRequirements: [],
    rangeStart: '2026-09-18',
    rangeEnd: '2026-09-18',
  });

  // Solo Aeropuerto genera extra vinculado
  assert.equal(rec.extra_requirements.length, 1);
  assert.equal(rec.extra_requirements[0].area_id, 'area-aero');

  const daily = evaluateDailyPlanningVacancies({
    date: '2026-09-18',
    ordinaryRequirements: reqs,
    extraRequirements: rec.extra_requirements,
    assignments: [],
    areaNameById,
    positionNameById,
  });

  const baseSupSlot = daily.slots.find((s) => s.area_id === 'area-base')!;
  const aeroSlot = daily.slots.find((s) => s.area_id === 'area-aero')!;

  assert.equal(baseSupSlot.suppressed_by_holiday, true);
  assert.equal(baseSupSlot.open_falta_count, 0);
  assert.equal(baseSupSlot.open_linked_extra_count, 0);

  assert.equal(aeroSlot.suppressed_by_holiday, false);
  assert.equal(aeroSlot.open_falta_count, 1);
  assert.equal(aeroSlot.open_linked_extra_count, 1);
});

test('ROSTER-08: selector habitual conserva extra_target y linked_requirement_id, sin duplicar pendientes ni cerrar falta al cubrir manual', () => {
  const ordinaryRequirements: RawShiftRequirement[] = [
    {
      id: 'req-ord-3',
      date: '2026-09-17',
      area_id: 'area-aero',
      position_id: 'pos-aero',
      shift_id: 'shift-am07',
      required_count: 3,
      priority: 'HIGH',
      is_extra: false,
    },
  ];
  const extraRequirements = [
    {
      id: 'ext-1',
      date: '2026-09-17',
      area_id: 'area-aero',
      position_id: 'pos-aero',
      shift_id: 'shift-am07',
      manual_count: 1,
      auto_vacancy_count: 1,
      required_count: 2,
      linked_requirement_id: 'req-ord-3',
    },
  ];
  const baseOrdinary: DailyPlanningAssignmentRef[] = [
    {
      personnel_id: 'op-1',
      date: '2026-09-17',
      area_id: 'area-aero',
      position_id: 'pos-aero',
      shift_id: 'shift-am07',
      is_extra: false,
    },
    {
      personnel_id: 'op-2',
      date: '2026-09-17',
      area_id: 'area-aero',
      position_id: 'pos-aero',
      shift_id: 'shift-am07',
      is_extra: false,
    },
  ];

  // 1) Lista habitual ofrece exactamente 1 ítem vinculado + 1 ítem manual (sin duplicar pendientes)
  const initialItems = buildExtraSelectorItems({
    date: '2026-09-17',
    ordinaryRequirements,
    extraRequirements,
    assignments: baseOrdinary,
  });
  assert.equal(initialItems.length, 2);
  const linkedItem = initialItems.find((i) => i.extra_target === 'v2_vacancy')!;
  const manualItem = initialItems.find((i) => i.extra_target === 'manual')!;
  assert.equal(linkedItem.open_count, 1);
  assert.equal(linkedItem.linked_requirement_id, 'req-ord-3');
  assert.equal(manualItem.open_count, 1);
  assert.equal(manualItem.linked_requirement_id, null);

  // 2) Elegir operador en el selector para el extra manual -> conserva is_extra=true, extra_target='manual' y deja abierta la falta ordinaria
  const manualAss = createExtraAssignmentFromSelector(manualItem, 'op-manual');
  assert.equal(manualAss.is_extra, true);
  assert.equal(manualAss.status, 'scheduled');
  assert.equal(manualAss.extra_target, 'manual');
  assert.equal(manualAss.linked_requirement_id, null);

  const afterManualAssignments = [...baseOrdinary, manualAss];
  const afterManualEval = evaluateDailyPlanningVacancies({
    date: '2026-09-17',
    ordinaryRequirements,
    extraRequirements,
    assignments: afterManualAssignments,
  });
  assert.equal(afterManualEval.total_open_manual_extras, 0);
  assert.equal(afterManualEval.total_open_faltas, 1);
  assert.equal(afterManualEval.total_open_linked_extras, 1);

  const itemsAfterManual = buildExtraSelectorItems({
    date: '2026-09-17',
    ordinaryRequirements,
    extraRequirements,
    assignments: afterManualAssignments,
  });
  assert.equal(itemsAfterManual.length, 1);
  assert.equal(itemsAfterManual[0].extra_target, 'v2_vacancy');

  // 3) Elegir operador en el selector para el cupo vinculado -> conserva is_extra=true, extra_target='v2_vacancy' y linked_requirement_id, cierra falta una sola vez
  const linkedAss = createExtraAssignmentFromSelector(itemsAfterManual[0], 'op-linked');
  assert.equal(linkedAss.is_extra, true);
  assert.equal(linkedAss.status, 'scheduled');
  assert.equal(linkedAss.extra_target, 'v2_vacancy');
  assert.equal(linkedAss.linked_requirement_id, 'req-ord-3');

  const afterBothAssignments = [...afterManualAssignments, linkedAss];
  const afterBothEval = evaluateDailyPlanningVacancies({
    date: '2026-09-17',
    ordinaryRequirements,
    extraRequirements,
    assignments: afterBothAssignments,
  });
  assert.equal(afterBothEval.total_open_faltas, 0);
  assert.equal(afterBothEval.total_open_linked_extras, 0);
  assert.equal(afterBothEval.total_open_manual_extras, 0);
  assert.equal(afterBothEval.slots[0].effective_ordinary_coverage, 3);
  assert.equal(
    buildExtraSelectorItems({
      date: '2026-09-17',
      ordinaryRequirements,
      extraRequirements,
      assignments: afterBothAssignments,
    }).length,
    0
  );
});
