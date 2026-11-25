import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveNs22AnchorFromHistory, isNs22TitularWorkNight } from './aeropuerto-ns22';
import { scheduleCrossArea, scheduleCrossAreaAsync } from './cobertura';
import { fetchAllPaginated } from './pagination';
import {
  buildV2DailyPlanningRows,
  compareEnginesPreview,
  compareEnginesPreviewStaged,
  groupV2DailyPlanningSections,
} from './preview-compare';
import { applyV2DraftAdjustment, computeV2AuditSummaries } from './preview-draft';
import {
  fetchPriorityQuotasInBatches,
  loadPreviewCompareInputs,
  resolveOperadorAeropuertoPosition,
} from './preview-compare-server';
import type {
  PersonnelScheduleProfile,
  RawExistingAssignment,
  RawLeaveRecord,
  RawShiftRequirement,
} from './types';

const REF_DATE = new Date('2026-11-01T12:00:00Z');

test('ROSTER-06: comparación lado a lado v1 vs v2 sin escrituras ni llamada al guardado de v1, manteniendo v1 predeterminado', () => {
  const allShifts = [
    {
      id: 'shift-am08',
      name: 'AM 08',
      start_time: '08:00',
      end_time: '16:00',
      duration_hours: 8,
      requires_transport: false,
    },
    {
      id: 'shift-ns22',
      name: 'NS 22',
      start_time: '22:00',
      end_time: '07:00',
      duration_hours: 9,
      requires_transport: true,
    },
  ];

  const requirements: RawShiftRequirement[] = [
    {
      id: 'req-bodega',
      date: '2026-11-10',
      area_id: 'area-base',
      position_id: 'pos-bodega',
      shift_id: 'shift-am08',
      required_count: 1,
      priority: 'NORMAL',
      is_extra: false,
      area: { name: 'Base' },
      position: { name: 'Operador Bodega' },
      shift: allShifts[0],
    },
    {
      id: 'req-grua-crit',
      date: '2026-11-10',
      area_id: 'area-atrex',
      position_id: 'pos-grua',
      shift_id: 'shift-ns22',
      required_count: 1,
      priority: 'CRITICAL',
      is_extra: false,
      area: { name: 'Atrex' },
      position: { name: 'Operador de grúa' },
      shift: allShifts[1],
    },
  ];

  const personnel: PersonnelScheduleProfile[] = [
    {
      personnel_id: 'op-poly',
      first_name: 'Polivalente',
      main_position: 'pos-bodega',
      main_position_name: 'Operador Bodega',
      secondary_positions: ['pos-grua'],
      avoids_night: true, // En v2 no excluye
      area_id: 'area-base',
      rotation_pattern: '5x2',
    },
    {
      personnel_id: 'op-spec',
      first_name: 'Especialista',
      main_position: 'pos-bodega',
      main_position_name: 'Operador Bodega',
      secondary_positions: [],
      area_id: 'area-base',
      rotation_pattern: '5x2',
    },
  ];

  const comparison = compareEnginesPreview({
    startDate: '2026-11-10',
    endDate: '2026-11-10',
    rawRequirements: requirements,
    existingAssignments: [],
    personnel,
    allShifts,
    referenceDate: REF_DATE,
  });

  assert.equal(comparison.default_engine, 'v1');
  assert.equal(comparison.dry_run, true);
  assert.equal(comparison.called_v1_save_route, false);

  // Ambos motores evaluados sobre los mismos 2 requerimientos
  assert.equal(comparison.v1.total_required, 2);
  assert.equal(comparison.v2.total_required, 2);

  // v2 cubre ambos (1 principal + 1 secundario) sin conflictos de jornada
  assert.equal(comparison.v2.total_covered, 2);
  assert.equal(comparison.v2.total_vacancies, 0);
  assert.equal(comparison.v2.covered_primary_count, 1);
  assert.equal(comparison.v2.covered_secondary_count, 1);
  assert.equal(comparison.v2.jornada_conflicts_count, 0);

  // Deltas calculados correctamente
  assert.equal(
    comparison.deltas.coverage_diff,
    comparison.v2.total_covered - comparison.v1.total_covered
  );
  assert.equal(
    comparison.deltas.vacancies_diff,
    comparison.v2.total_vacancies - comparison.v1.total_vacancies
  );
});

test('ROSTER-06: comparación respeta turnos protegidos, ausencias aprobadas y reporta refuerzos separados', () => {
  const allShifts = [
    {
      id: 'shift-am08',
      name: 'AM 08',
      start_time: '08:00',
      end_time: '16:00',
      duration_hours: 8,
      requires_transport: false,
    },
  ];

  const requirements: RawShiftRequirement[] = [
    {
      id: 'req-10',
      date: '2026-11-10',
      area_id: 'area-base',
      position_id: 'pos-bodega',
      shift_id: 'shift-am08',
      required_count: 1,
      priority: 'HIGH',
      is_extra: false,
      shift: allShifts[0],
    },
  ];

  const protectedShift: RawExistingAssignment[] = [
    {
      id: 'prot-1',
      personnel_id: 'op-1',
      date: '2026-11-10',
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

  const leaves: RawLeaveRecord[] = [
    {
      personnel_id: 'op-2',
      type: 'sick',
      start_date: '2026-11-11',
      end_date: '2026-11-11',
      status: 'approved',
    },
  ];

  const personnel: PersonnelScheduleProfile[] = [
    {
      personnel_id: 'op-1',
      first_name: 'Op 1',
      main_position: 'pos-bodega',
      main_position_name: 'Operador Bodega',
      area_id: 'area-base',
      rotation_pattern: '5x2',
    },
    {
      personnel_id: 'op-2',
      first_name: 'Op 2',
      main_position: 'pos-bodega',
      main_position_name: 'Operador Bodega',
      area_id: 'area-base',
      rotation_pattern: '5x2',
    },
  ];

  const comparison = compareEnginesPreview({
    startDate: '2026-11-10',
    endDate: '2026-11-11',
    rawRequirements: requirements,
    existingAssignments: protectedShift,
    personnel,
    approvedLeaves: leaves,
    allShifts,
    reinforcementConfig: {
      'pos-bodega': {
        shift_id: 'shift-am08',
        shift_start: '08:00',
        shift_end: '16:00',
        duration_hours: 8,
        area_id: 'area-base',
      },
    },
    referenceDate: REF_DATE,
  });

  // 10 nov cubierto por protegido -> 1/1 cubierto, 0 vacantes
  assert.equal(comparison.v2.total_required, 1);
  assert.equal(comparison.v2.total_covered, 1);
  assert.equal(comparison.v2.total_vacancies, 0);
  // op-1 refuerza el 11 nov y op-2 refuerza el 10 nov (respetando su licencia médica del 11 nov) -> 2 refuerzos, 0 conflictos
  assert.equal(comparison.v2.reinforcement_count, 2);
  assert.equal(comparison.v2.jornada_conflicts_count, 0);
});

test('ROSTER-06: semana sintética con NS22, ausencia aprobada, turno protegido, refuerzo previsto y aviso de regla sin confirmar', () => {
  const allShifts = [
    { id: 'syn-ns22', name: 'NS 22', start_time: '22:00', end_time: '07:00', duration_hours: 9, requires_transport: true },
    { id: 'syn-am07', name: 'AM 07', start_time: '07:00', end_time: '15:00', duration_hours: 8, requires_transport: false },
  ];
  const weekDates = [
    '2026-11-09',
    '2026-11-10',
    '2026-11-11',
    '2026-11-12',
    '2026-11-13',
    '2026-11-14',
    '2026-11-15',
  ];

  const reqs: RawShiftRequirement[] = [
    ...weekDates.map((d, i) => ({
      id: `syn-req-ns22-${i}`,
      date: d,
      area_id: 'syn-area-aero',
      position_id: 'syn-pos-aero',
      shift_id: 'syn-ns22',
      required_count: 1,
      priority: 'HIGH',
      is_extra: false,
      area: { name: 'Aeropuerto' },
      position: { name: 'Operador Aeropuerto' },
      shift: allShifts[0],
    })),
    {
      id: 'syn-req-am07-mon',
      date: '2026-11-09',
      area_id: 'syn-area-aero',
      position_id: 'syn-pos-aero',
      shift_id: 'syn-am07',
      required_count: 1,
      priority: 'NORMAL',
      is_extra: false,
      area: { name: 'Aeropuerto' },
      position: { name: 'Operador Aeropuerto' },
      shift: allShifts[1],
    },
  ];

  const comparison = compareEnginesPreview({
    startDate: '2026-11-09',
    endDate: '2026-11-15',
    rawRequirements: reqs,
    existingAssignments: [
      {
        id: 'syn-prot-mon',
        personnel_id: 'syn-op-aero',
        date: '2026-11-09',
        area_id: 'syn-area-aero',
        position_id: 'syn-pos-aero',
        shift_id: 'syn-am07',
        shift_start: '07:00',
        shift_end: '15:00',
        duration_hours: 8,
        is_manual: true,
        is_extra: false,
      },
    ],
    personnel: [
      {
        personnel_id: 'syn-tit-a',
        first_name: 'Titular A',
        main_position: 'syn-pos-aero',
        main_position_name: 'Operador Aeropuerto',
        rotation_pattern: '4x4',
        area_id: 'syn-area-aero',
      },
      {
        personnel_id: 'syn-tit-b',
        first_name: 'Titular B',
        main_position: 'syn-pos-aero',
        main_position_name: 'Operador Aeropuerto',
        rotation_pattern: '4x4',
        area_id: 'syn-area-aero',
      },
      {
        personnel_id: 'syn-op-aero',
        first_name: 'Operador Aero',
        main_position: 'syn-pos-aero',
        main_position_name: 'Operador Aeropuerto',
        rotation_pattern: '5x2',
        area_id: 'syn-area-aero',
      },
    ],
    approvedLeaves: [
      {
        personnel_id: 'syn-tit-b',
        type: 'sick',
        start_date: '2026-11-13',
        end_date: '2026-11-13',
        status: 'approved',
      },
    ],
    allShifts,
    ns22Config: {
      titulares: [
        {
          personnel_id: 'syn-tit-a',
          first_name: 'Titular A',
          anchor_date: '2026-11-09',
          cycle_offset: 0,
          confirmed_4x4_regime: false,
        },
        {
          personnel_id: 'syn-tit-b',
          first_name: 'Titular B',
          anchor_date: '2026-11-09',
          cycle_offset: 4,
          confirmed_4x4_regime: false,
        },
      ],
      shiftDef: {
        shift_id: 'syn-ns22',
        area_id: 'syn-area-aero',
        position_id: 'syn-pos-aero',
        shift_start: '22:00',
        shift_end: '07:00',
        duration_hours: 9,
      },
    },
    reinforcementConfig: {
      'syn-pos-aero': {
        shift_id: 'syn-am07',
        shift_start: '07:00',
        shift_end: '15:00',
        duration_hours: 8,
        area_id: 'syn-area-aero',
        position_id: 'syn-pos-aero',
        days_of_week: [1, 2, 3, 4, 5],
      },
    },
    areaNameById: new Map([['syn-area-aero', 'Aeropuerto']]),
    positionNameById: new Map([['syn-pos-aero', 'Operador Aeropuerto']]),
    referenceDate: REF_DATE,
  });

  assert.equal(comparison.dry_run, true);
  assert.equal(comparison.called_v1_save_route, false);
  assert.equal(comparison.default_engine, 'v1');

  // Ambos evaluados sobre los mismos 8 cupos (7 NS22 + 1 AM07 lun)
  assert.equal(comparison.v1.total_required, 8);
  assert.equal(comparison.v2.total_required, 8);

  // En v2: cubre 8/8 (Titular A 4 noches, Titular B 2 noches + 1 reemplazo por ausencia en 12/13 nov, protegido lun AM07, refuerzo AM07 L-V)
  assert.equal(comparison.v2.total_covered, 8);
  assert.equal(comparison.v2.total_vacancies, 0);
  assert.equal(comparison.v2.jornada_conflicts_count, 0);
  assert.ok(comparison.v2.reinforcement_count >= 1);

  // Regla 4x4 sin confirmar aparece explícitamente en unconfirmed_rules
  assert.ok(comparison.unconfirmed_rules.some((r) => r.includes('régimen aplicable 4x4')));
});

test('ROSTER-06: ancla NS22 confirmada vs provisional a mitad de bloque (sin reiniciar ciclo) vs fase no verificable', () => {
  // 1) Ancla confirmada
  const confirmed = deriveNs22AnchorFromHistory({
    personnelId: 'tit-1',
    firstName: 'Titular 1',
    confirmedAnchorDate: '2026-11-09',
    confirmedCycleOffset: 0,
    observedNs22Dates: [],
  });
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.anchor_date, '2026-11-09');
  assert.equal(confirmed.notice, null);

  // 2) Ventana empieza a mitad de bloque (bloque real: 09, 10, 11, 12 nov; ventana observada: 10..13 nov)
  const midBlock = deriveNs22AnchorFromHistory({
    personnelId: 'tit-1',
    firstName: 'Titular 1',
    observedNs22Dates: ['2026-11-10', '2026-11-11', '2026-11-12'],
    observedWindowDates: ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'],
  });
  assert.equal(midBlock.status, 'provisional');
  assert.match(midBlock.notice || '', /provisional/i);
  // El 13 nov debe ser LIBRE (no reinicia el bloque el 10 nov) y el próximo bloque empieza el 17 nov
  assert.equal(isNs22TitularWorkNight('2026-11-13', midBlock.anchor_date, midBlock.cycle_offset), false);
  assert.equal(isNs22TitularWorkNight('2026-11-16', midBlock.anchor_date, midBlock.cycle_offset), false);
  assert.equal(isNs22TitularWorkNight('2026-11-17', midBlock.anchor_date, midBlock.cycle_offset), true);

  // 3) Historial ambiguo (solo 1 noche sin contexto suficiente) -> no verificable
  const ambiguous = deriveNs22AnchorFromHistory({
    personnelId: 'tit-1',
    firstName: 'Titular 1',
    observedNs22Dates: ['2026-11-10'],
    observedWindowDates: ['2026-11-10'],
  });
  assert.equal(ambiguous.status, 'unverified');
  assert.match(ambiguous.notice || '', /no se pudo verificar la fase/i);
});

test('ROSTER-06: paginación completa más allá de una página y fallo en página posterior sin métricas parciales', async () => {
  const allRows = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];

  // 1) Consulta que supera una página (pageSize = 2 -> 3 páginas)
  const okRes = await fetchAllPaginated(async (from, to) => ({
    data: allRows.slice(from, to + 1),
    error: null,
  }), 2);
  assert.equal(okRes.error, null);
  assert.equal(okRes.pages_fetched, 3);
  assert.deepEqual(okRes.data, allRows);

  // 2) Consulta que falla en la segunda página -> aborta y NO entrega datos parciales
  const failRes = await fetchAllPaginated(async (from, to) => {
    if (from === 0) return { data: allRows.slice(0, 2), error: null };
    return { data: null, error: { message: 'DB timeout on page 2' } };
  }, 2);
  assert.equal(failRes.data, null);
  assert.equal(failRes.error, 'DB timeout on page 2');
});

test('ROSTER-06: compareEnginesPreviewStaged informa etapas reales en orden sin guardar en DB', async () => {
  const stages: string[] = [];
  const res = await compareEnginesPreviewStaged(
    {
      startDate: '2026-11-09',
      endDate: '2026-11-09',
      rawRequirements: [
        {
          id: 'st-req-1',
          date: '2026-11-09',
          area_id: 'area-1',
          position_id: 'pos-1',
          shift_id: 'sh-1',
          required_count: 1,
          priority: 'Normal',
          is_extra: false,
          shift: { name: 'AM 08', start_time: '08:00', end_time: '16:00', duration_hours: 8 },
        },
      ],
      existingAssignments: [],
      personnel: [
        {
          personnel_id: 'op-1',
          first_name: 'Operador Uno',
          main_position: 'pos-1',
          area_id: 'area-1',
        },
      ],
      allShifts: [
        { id: 'sh-1', name: 'AM 08', start_time: '08:00', end_time: '16:00', duration_hours: 8 },
      ],
    },
    (stage) => {
      stages.push(stage);
    }
  );

  assert.deepEqual(stages, ['calculating_v1', 'calculating_v2', 'preparing_comparison']);
  assert.equal(res.dry_run, true);
  assert.equal(res.called_v1_save_route, false);
  assert.equal(res.v1.total_covered, 1);
  assert.equal(res.v2.total_covered, 1);
  assert.equal(res.v2.start_date, '2026-11-09');
  assert.equal(res.v2.end_date, '2026-11-09');
  assert.equal(res.v2.assignments?.length, 1);
  assert.equal(res.v2.assignments?.[0].shift_name, 'AM 08');
});

test('ROSTER-06: cancelación vía AbortSignal detiene scheduleCrossAreaAsync en curso sin esperar al final', async () => {
  const controller = new AbortController();
  const days = Array.from({ length: 28 }, (_, idx) => {
    const d = new Date(Date.UTC(2026, 11, 7 + idx));
    return d.toISOString().slice(0, 10);
  });
  const personnel: PersonnelScheduleProfile[] = Array.from({ length: 48 }, (_, i) => ({
    personnel_id: `cancel-p-${i}`,
    first_name: `Operador ${i}`,
    main_position: `pos-${i % 3}`,
    secondary_positions: [`pos-${(i + 1) % 3}`],
    area_id: `area-${i % 4}`,
  }));
  const rawRequirements: RawShiftRequirement[] = [];
  let seq = 1;
  for (const d of days) {
    for (let k = 0; k < 24; k++) {
      rawRequirements.push({
        id: `cancel-req-${seq++}`,
        date: d,
        area_id: `area-${k % 8}`,
        position_id: `pos-${k % 3}`,
        shift_id: `sh-${k % 3}`,
        required_count: 1,
        priority: k < 8 ? 'Crítico' : 'Normal',
        is_extra: false,
        shift: {
          name: `SH ${k % 3}`,
          start_time: k % 3 === 0 ? '08:00' : k % 3 === 1 ? '14:00' : '22:00',
          end_time: k % 3 === 0 ? '16:00' : k % 3 === 1 ? '22:00' : '07:00',
          duration_hours: 8,
        },
      });
    }
  }

  const timer = setTimeout(() => controller.abort(), 50);
  const t0 = performance.now();
  let caughtErr: Error | null = null;
  try {
    await scheduleCrossAreaAsync({
      startDate: '2026-12-07',
      endDate: '2027-01-03',
      rawRequirements,
      existingAssignments: [],
      personnel,
      signal: controller.signal,
      deadlineAt: Date.now() + 30_000,
    });
  } catch (err: any) {
    caughtErr = err;
  } finally {
    clearTimeout(timer);
  }
  const elapsedMs = performance.now() - t0;

  assert.ok(caughtErr, 'Debe abortar cuando llega la señal de cancelación');
  assert.match(caughtErr!.message, /cancelado/i);
  assert.ok(elapsedMs < 2000, `Debe detenerse rápido tras cancelar (tardó ${elapsedMs}ms)`);
});

test('ROSTER-06: cancelación o límite vencido detiene la comparación también durante v1 (calculating_v1)', async () => {
  const days = Array.from({ length: 28 }, (_, idx) => {
    const d = new Date(Date.UTC(2026, 11, 7 + idx));
    return d.toISOString().slice(0, 10);
  });
  const personnel: PersonnelScheduleProfile[] = Array.from({ length: 60 }, (_, i) => ({
    personnel_id: `v1c-p-${i}`,
    first_name: `Op ${i}`,
    main_position: 'pos-1',
    area_id: 'area-1',
  }));
  const rawRequirements: RawShiftRequirement[] = [];
  let seq = 1;
  for (const d of days) {
    for (let k = 0; k < 24; k++) {
      rawRequirements.push({
        id: `v1c-req-${seq++}`,
        date: d,
        area_id: 'area-1',
        position_id: 'pos-1',
        shift_id: 'sh-1',
        required_count: 1,
        priority: 'NORMAL',
        is_extra: false,
        shift: { name: 'AM 08', start_time: '08:00', end_time: '16:00', duration_hours: 8 },
      });
    }
  }

  const controller = new AbortController();
  const stagesSeen: string[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const t0 = performance.now();
  let caught: Error | null = null;
  try {
    await compareEnginesPreviewStaged(
      {
        startDate: '2026-12-07',
        endDate: '2027-01-03',
        rawRequirements,
        existingAssignments: [],
        personnel,
        allShifts: [{ id: 'sh-1', name: 'AM 08', start_time: '08:00', end_time: '16:00', duration_hours: 8 }],
        signal: controller.signal,
        deadlineAt: Date.now() + 30_000,
      },
      (s) => {
        stagesSeen.push(s);
        if (s === 'calculating_v1' && !timer) {
          timer = setTimeout(() => controller.abort(), 25);
        }
      }
    );
  } catch (err: any) {
    caught = err;
  } finally {
    if (timer) clearTimeout(timer);
  }
  const elapsedMs = performance.now() - t0;

  assert.ok(caught, 'Debe abortar durante v1 cuando llega la cancelación');
  assert.match(caught!.message, /v1|cancelad/i);
  assert.deepEqual(stagesSeen, ['calculating_v1']);
  assert.ok(elapsedMs < 2000, `Debe detenerse rápido durante v1 (tardó ${elapsedMs}ms)`);
});

test('ROSTER-06: ReadableStream.cancel() (cierre desde navegador) aborta el trabajo en curso en el servidor', async () => {
  const days = Array.from({ length: 28 }, (_, idx) => {
    const d = new Date(Date.UTC(2026, 11, 7 + idx));
    return d.toISOString().slice(0, 10);
  });
  const personnel: PersonnelScheduleProfile[] = Array.from({ length: 30 }, (_, i) => ({
    personnel_id: `httpc-p-${i}`,
    first_name: `Op ${i}`,
    main_position: 'pos-1',
    area_id: 'area-1',
  }));
  const rawRequirements: RawShiftRequirement[] = [];
  let seq = 1;
  for (const d of days) {
    for (let k = 0; k < 12; k++) {
      rawRequirements.push({
        id: `httpc-req-${seq++}`,
        date: d,
        area_id: 'area-1',
        position_id: 'pos-1',
        shift_id: 'sh-1',
        required_count: 1,
        priority: 'NORMAL',
        is_extra: false,
        shift: { name: 'AM 08', start_time: '08:00', end_time: '16:00', duration_hours: 8 },
      });
    }
  }

  const workController = new AbortController();
  let stoppedBySignal = false;
  let serverDonePromise: Promise<void> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      workController.abort();
    },
    start(controller) {
      const enc = new TextEncoder();
      serverDonePromise = (async () => {
        try {
          controller.enqueue(enc.encode('{"type":"stage","stage":"calculating_v1"}\n'));
          await compareEnginesPreviewStaged(
            {
              startDate: '2026-12-07',
              endDate: '2027-01-03',
              rawRequirements,
              existingAssignments: [],
              personnel,
              allShifts: [{ id: 'sh-1', name: 'AM 08', start_time: '08:00', end_time: '16:00', duration_hours: 8 }],
              signal: workController.signal,
              deadlineAt: Date.now() + 30_000,
            },
            (stage) => {
              if (!workController.signal.aborted) {
                controller.enqueue(enc.encode(`${JSON.stringify({ type: 'stage', stage })}\n`));
              }
            }
          );
        } catch {
          stoppedBySignal = workController.signal.aborted;
        }
      })();
    },
  });

  const reader = stream.getReader();
  const firstChunk = await reader.read();
  assert.equal(firstChunk.done, false);

  const t0 = performance.now();
  await reader.cancel('user_clicked_cancel');
  await serverDonePromise;
  const elapsedMs = performance.now() - t0;

  assert.equal(workController.signal.aborted, true);
  assert.equal(stoppedBySignal, true);
  assert.ok(elapsedMs < 2000, `El stream cancelado debe detener el cálculo rápido (tardó ${elapsedMs}ms)`);
});

test('NS22 catálogo: identifica Operador Aeropuerto inequívocamente aunque Supervisor Aeropuerto venga primero, y excluye NS22 si falta config', () => {
  const positionsWithSupervisorFirst = [
    { id: 'pos-sup-aero', name: 'Supervisor Aeropuerto' },
    { id: 'pos-op-aero', name: 'Operador Aeropuerto' },
  ];
  const resolved = resolveOperadorAeropuertoPosition(positionsWithSupervisorFirst);
  assert.equal(resolved?.id, 'pos-op-aero');

  const withoutOperador = [
    { id: 'pos-sup-aero', name: 'Supervisor Aeropuerto' },
    { id: 'pos-bodega', name: 'Operador Bodega' },
  ];
  assert.equal(resolveOperadorAeropuertoPosition(withoutOperador), undefined);

  const shifts = [
    { id: 'sh-ns22', name: 'NS 22', start_time: '22:00', end_time: '07:00', duration_hours: 8 },
    { id: 'sh-am08', name: 'AM 08', start_time: '08:00', end_time: '16:00', duration_hours: 8 },
  ];

  const titularA = deriveNs22AnchorFromHistory({
    personnelId: 'tit-1',
    firstName: 'MARCELO ANDRES',
    observedNs22Dates: ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'],
    observedWindowDates: ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'],
  });
  const titularB = deriveNs22AnchorFromHistory({
    personnelId: 'tit-2',
    firstName: 'JAVIER IGNACIO',
    observedNs22Dates: ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11'],
    observedWindowDates: ['2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11'],
  });
  assert.equal(titularA.status, 'provisional');
  assert.equal(titularB.status, 'provisional');

  const v2ParamsWithTitulares = {
    startDate: '2026-12-07',
    endDate: '2026-12-09',
    rawRequirements: [
      {
        id: 'r-ns22-7',
        date: '2026-12-07',
        area_id: 'area-aero',
        position_id: resolved!.id,
        shift_id: 'sh-ns22',
        required_count: 1,
        is_extra: false,
        area: { name: 'Aeropuerto' },
        position: { name: 'Operador Aeropuerto' },
        shift: { name: 'NS 22', start_time: '22:00', end_time: '07:00', duration_hours: 8 },
      },
      {
        id: 'r-ns22-8',
        date: '2026-12-08',
        area_id: 'area-aero',
        position_id: resolved!.id,
        shift_id: 'sh-ns22',
        required_count: 1,
        is_extra: false,
        area: { name: 'Aeropuerto' },
        position: { name: 'Operador Aeropuerto' },
        shift: { name: 'NS 22', start_time: '22:00', end_time: '07:00', duration_hours: 8 },
      },
      {
        id: 'r-ns22-9',
        date: '2026-12-09',
        area_id: 'area-aero',
        position_id: resolved!.id,
        shift_id: 'sh-ns22',
        required_count: 1,
        is_extra: false,
        area: { name: 'Aeropuerto' },
        position: { name: 'Operador Aeropuerto' },
        shift: { name: 'NS 22', start_time: '22:00', end_time: '07:00', duration_hours: 8 },
      },
    ],
    existingAssignments: [],
    personnel: [
      {
        personnel_id: 'tit-1',
        full_name: 'MARCELO ANDRES JARA',
        main_position: resolved!.id,
        secondary_positions: [],
        rotation_pattern: '4X4',
      },
      {
        personnel_id: 'tit-2',
        full_name: 'JAVIER IGNACIO LOPEZ',
        main_position: resolved!.id,
        secondary_positions: [],
        rotation_pattern: '4X4',
      },
      {
        personnel_id: 'rep-marco',
        full_name: 'MARCO ANTONIO HOGADA',
        main_position: resolved!.id,
        secondary_positions: [],
        rotation_pattern: '5X2',
      },
    ],
    approvedLeaves: [
      {
        personnel_id: 'tit-1',
        start_date: '2026-12-09',
        end_date: '2026-12-09',
        status: 'approved',
        type: 'administrative',
      },
    ],
    allShifts: shifts,
    areaNameById: new Map([['area-aero', 'Aeropuerto']]),
    positionNameById: new Map([
      ['pos-sup-aero', 'Supervisor Aeropuerto'],
      ['pos-op-aero', 'Operador Aeropuerto'],
    ]),
    ns22Config: {
      titulares: [
        {
          personnel_id: 'tit-1',
          first_name: 'MARCELO ANDRES',
          anchor_date: titularA.anchor_date,
          cycle_offset: titularA.cycle_offset,
          confirmed_4x4_regime: false,
        },
        {
          personnel_id: 'tit-2',
          first_name: 'JAVIER IGNACIO',
          anchor_date: titularB.anchor_date,
          cycle_offset: titularB.cycle_offset,
          confirmed_4x4_regime: false,
        },
      ],
      shiftDef: {
        shift_id: 'sh-ns22',
        area_id: 'area-aero',
        position_id: resolved!.id,
        shift_start: '22:00',
        shift_end: '07:00',
        duration_hours: 8,
      },
    },
    excludeUnconfiguredNs22: true,
    unconfirmedRules: [titularA.notice!, titularB.notice!],
    referenceDate: REF_DATE,
  };

  const previewWithTitulares = compareEnginesPreview(v2ParamsWithTitulares);
  const v2ResWithTitulares = scheduleCrossArea(v2ParamsWithTitulares);

  const ns22ByDate = new Map(
    v2ResWithTitulares.ordinary_assignments
      .filter((a) => a.shift_id === 'sh-ns22')
      .map((a) => [a.date, a])
  );
  assert.equal(ns22ByDate.get('2026-12-07')?.personnel_id, 'tit-1');
  assert.equal(ns22ByDate.get('2026-12-08')?.personnel_id, 'rep-marco'); // 22:00-07:00 invade ausencia aprobada del 2026-12-09
  assert.equal(ns22ByDate.get('2026-12-09')?.personnel_id, 'rep-marco');
  assert.ok(
    previewWithTitulares.unconfirmed_rules.some((r) => r.includes('ancla provisional estimada'))
  );

  // Si falta la configuración de NS22, NS22 debe quedar fuera de la asignación general
  const missingConfigParams = {
    startDate: '2026-12-07',
    endDate: '2026-12-07',
    rawRequirements: [
      {
        id: 'r-ns22-missing',
        date: '2026-12-07',
        area_id: 'area-aero',
        position_id: 'pos-op-aero',
        shift_id: 'sh-ns22',
        required_count: 1,
        is_extra: false,
        area: { name: 'Aeropuerto' },
        position: { name: 'Operador Aeropuerto' },
        shift: { name: 'NS 22', start_time: '22:00', end_time: '07:00', duration_hours: 8 },
      },
    ],
    existingAssignments: [],
    personnel: [
      {
        personnel_id: 'rep-marco',
        full_name: 'MARCO ANTONIO HOGADA',
        main_position: 'pos-op-aero',
        secondary_positions: [],
        rotation_pattern: '5X2',
      },
    ],
    allShifts: shifts,
    areaNameById: new Map([['area-aero', 'Aeropuerto']]),
    positionNameById: new Map([['pos-op-aero', 'Operador Aeropuerto']]),
    ns22Config: null,
    excludeUnconfiguredNs22: true,
    unconfirmedRules: ['Regla NS22 4x4 sin evaluar completamente en vista previa (cargo=faltante).'],
    referenceDate: REF_DATE,
  };
  const previewMissingConfig = compareEnginesPreview(missingConfigParams);
  const v2ResMissingConfig = scheduleCrossArea(missingConfigParams);

  assert.equal(
    v2ResMissingConfig.ordinary_assignments.filter((a) => a.shift_id === 'sh-ns22').length,
    0
  );
  assert.ok(
    previewMissingConfig.unconfirmed_rules.some((r) => r.includes('sin evaluar completamente'))
  );
});

test('Filtro de Personas en vista previa: excluir a Carlos Tobar impide proponerle Supervisor Aeropuerto AM04, conserva protegidos aparte e incluye a todos con Todos', () => {
  const shifts = [
    { id: 'sh-am04', name: 'AM 04', start_time: '04:00', end_time: '13:00', duration_hours: 8 },
  ];
  const carlos: PersonnelScheduleProfile = {
    personnel_id: 'carlos-tobar',
    full_name: 'CARLOS TOBAR',
    main_position: 'pos-sup-aero',
    secondary_positions: [],
    rotation_pattern: '5X2',
  };
  const otroSupervisor: PersonnelScheduleProfile = {
    personnel_id: 'otro-sup',
    full_name: 'OTRO SUPERVISOR',
    main_position: 'pos-sup-aero',
    secondary_positions: [],
    rotation_pattern: '5X2',
  };
  const reqs: RawShiftRequirement[] = [
    {
      id: 'req-sup-am04-07',
      date: '2026-12-07',
      area_id: 'area-aero',
      position_id: 'pos-sup-aero',
      shift_id: 'sh-am04',
      required_count: 1,
      is_extra: false,
      area: { name: 'Aeropuerto' },
      position: { name: 'Supervisor Aeropuerto' },
      shift: { name: 'AM 04', start_time: '04:00', end_time: '13:00', duration_hours: 8 },
    },
    {
      id: 'req-sup-am04-08',
      date: '2026-12-08',
      area_id: 'area-aero',
      position_id: 'pos-sup-aero',
      shift_id: 'sh-am04',
      required_count: 1,
      is_extra: false,
      area: { name: 'Aeropuerto' },
      position: { name: 'Supervisor Aeropuerto' },
      shift: { name: 'AM 04', start_time: '04:00', end_time: '13:00', duration_hours: 8 },
    },
  ];
  // Carlos ya tiene un turno protegido el 2026-12-08 (publicado), y queda una vacante el 2026-12-07
  const existingProtected: RawExistingAssignment[] = [
    {
      id: 'ex-carlos-08',
      date: '2026-12-08',
      personnel_id: 'carlos-tobar',
      area_id: 'area-aero',
      position_id: 'pos-sup-aero',
      shift_id: 'sh-am04',
      shift_start: '04:00',
      shift_end: '13:00',
      duration_hours: 8,
      status: 'scheduled',
      is_published: true,
    },
  ];

  // 1) Selección explícita que deja fuera a Carlos Tobar (solo [otro-sup] o vacío sin Carlos)
  const previewExcludingCarlos = compareEnginesPreview({
    startDate: '2026-12-07',
    endDate: '2026-12-08',
    rawRequirements: reqs,
    existingAssignments: existingProtected,
    personnel: [otroSupervisor],
    approvedLeaves: [
      {
        personnel_id: 'otro-sup',
        start_date: '2026-12-07',
        end_date: '2026-12-07',
        status: 'approved',
        type: 'administrative',
      },
    ],
    allShifts: shifts,
    areaNameById: new Map([['area-aero', 'Aeropuerto']]),
    positionNameById: new Map([['pos-sup-aero', 'Supervisor Aeropuerto']]),
    referenceDate: REF_DATE,
  });

  // Carlos NO recibe propuesta nueva el 2026-12-07 (queda vacante en v2 y v1)
  const carlosNewProposalsV2 = (previewExcludingCarlos.v2.assignments || []).filter(
    (a) => a.personnel_id === 'carlos-tobar' && !a.is_protected
  );
  assert.equal(carlosNewProposalsV2.length, 0);
  assert.equal(previewExcludingCarlos.v2.total_vacancies, 1);

  // Su turno protegido existente del 2026-12-08 se identifica por separado como existente/protegido con área/cargo/turno correctos
  const carlosProtectedV2 = (previewExcludingCarlos.v2.assignments || []).find(
    (a) => a.personnel_id === 'carlos-tobar' && a.date === '2026-12-08'
  );
  assert.ok(carlosProtectedV2);
  assert.equal(carlosProtectedV2.is_protected, true);
  assert.equal(carlosProtectedV2.assignment_kind, 'protected');
  assert.equal(carlosProtectedV2.area_name, 'Aeropuerto');
  assert.equal(carlosProtectedV2.position_name, 'Supervisor Aeropuerto');
  assert.equal(carlosProtectedV2.shift_name, 'AM 04');

  // 2) Con "Todos" (Carlos incluido), sí se le propone cubrir la vacante del 2026-12-07
  const previewWithAll = compareEnginesPreview({
    startDate: '2026-12-07',
    endDate: '2026-12-08',
    rawRequirements: reqs,
    existingAssignments: existingProtected,
    personnel: [carlos, otroSupervisor],
    approvedLeaves: [
      {
        personnel_id: 'otro-sup',
        start_date: '2026-12-07',
        end_date: '2026-12-07',
        status: 'approved',
        type: 'administrative',
      },
    ],
    allShifts: shifts,
    areaNameById: new Map([['area-aero', 'Aeropuerto']]),
    positionNameById: new Map([['pos-sup-aero', 'Supervisor Aeropuerto']]),
    referenceDate: REF_DATE,
  });
  const carlosProposalDec7 = (previewWithAll.v2.assignments || []).find(
    (a) => a.personnel_id === 'carlos-tobar' && a.date === '2026-12-07'
  );
  assert.ok(carlosProposalDec7);
  assert.equal(carlosProposalDec7.is_protected, false);
  assert.equal(carlosProposalDec7.position_name, 'Supervisor Aeropuerto');
  assert.equal(carlosProposalDec7.shift_name, 'AM 04');
});

test('Equivalencia Grúa Horquilla Atrex <-> Base Minerquim: una sola habilitación cubre ambas áreas y respeta preferencia flexible Eloy->Atrex / Lizardo->Base', () => {
  const shifts = [
    { id: 'sh-am0830', name: 'AM 08:30', start_time: '08:30', end_time: '17:30', duration_hours: 8 },
    { id: 'sh-am07', name: 'AM 07', start_time: '07:00', end_time: '16:00', duration_hours: 8 },
  ];
  const areaNameById = new Map([
    ['area-atrex', 'Atrex'],
    ['area-base', 'Base Minerquim'],
  ]);
  const positionNameById = new Map([
    ['pos-grua-atrex', 'Operador Grúa Horquilla'],
    ['pos-grua-base', 'Operador Grúa Horquilla'],
  ]);
  const eloy: PersonnelScheduleProfile = {
    personnel_id: 'eloy-ponce',
    full_name: 'ELOY AGUSTIN PONCE',
    main_position: 'pos-grua-atrex',
    main_position_name: 'Operador Grúa Horquilla',
    area_id: 'area-atrex',
    secondary_positions: [],
    rotation_pattern: 'l-v',
  };
  const lizardo: PersonnelScheduleProfile = {
    personnel_id: 'lizardo-pailapichun',
    full_name: 'LIZARDO PATRICIO PAILAPICHUN',
    main_position: 'pos-grua-atrex',
    main_position_name: 'Operador Grúa Horquilla',
    area_id: 'area-atrex',
    secondary_positions: [],
    rotation_pattern: 'l-v',
  };

  const reqs: RawShiftRequirement[] = [
    {
      id: 'req-atrex-07',
      date: '2026-12-07',
      area_id: 'area-atrex',
      position_id: 'pos-grua-atrex',
      shift_id: 'sh-am0830',
      required_count: 1,
      priority: 'CRITICAL',
      is_extra: false,
      area: { name: 'Atrex' },
      position: { name: 'Operador Grúa Horquilla' },
      shift: { name: 'AM 08:30', start_time: '08:30', end_time: '17:30', duration_hours: 8 },
    },
    {
      id: 'req-base-07',
      date: '2026-12-07',
      area_id: 'area-base',
      position_id: 'pos-grua-base',
      shift_id: 'sh-am07',
      required_count: 1,
      priority: 'CRITICAL',
      is_extra: false,
      area: { name: 'Base Minerquim' },
      position: { name: 'Operador Grúa Horquilla' },
      shift: { name: 'AM 07', start_time: '07:00', end_time: '16:00', duration_hours: 8 },
    },
  ];

  // 1) Ambos disponibles con una sola habilitación (Atrex): Eloy -> Atrex y Lizardo -> Base Minerquim
  const resBoth = scheduleCrossArea({
    startDate: '2026-12-07',
    endDate: '2026-12-07',
    rawRequirements: reqs,
    existingAssignments: [],
    personnel: [lizardo, eloy],
    areaNameById,
    positionNameById,
    referenceDate: REF_DATE,
  });

  const atrexAss = resBoth.ordinary_assignments.find((a) => a.area_id === 'area-atrex');
  const baseAss = resBoth.ordinary_assignments.find((a) => a.area_id === 'area-base');
  assert.equal(atrexAss?.personnel_id, 'eloy-ponce');
  assert.equal(baseAss?.personnel_id, 'lizardo-pailapichun');
  assert.equal(resBoth.remaining_vacancies.length, 0);

  // 2) Eloy y Lizardo de vacaciones + 2 operadores con una sola habilitación secundaria de Grúa Horquilla -> cubre ambos cupos en vista previa
  const op1: PersonnelScheduleProfile = {
    personnel_id: 'op-1',
    full_name: 'JAIME EDUARDO ESPINOSA',
    main_position: 'pos-otro',
    secondary_positions: ['pos-grua-atrex'],
    rotation_pattern: '5X2',
  };
  const op2: PersonnelScheduleProfile = {
    personnel_id: 'op-2',
    full_name: 'ALVARO FELIPE MORALES',
    main_position: 'pos-otro',
    secondary_positions: ['pos-grua-base'],
    rotation_pattern: '5X2',
  };
  const previewVac = compareEnginesPreview({
    startDate: '2026-12-07',
    endDate: '2026-12-07',
    rawRequirements: reqs,
    existingAssignments: [],
    personnel: [eloy, lizardo, op1, op2],
    approvedLeaves: [
      { personnel_id: 'eloy-ponce', start_date: '2026-12-07', end_date: '2026-12-07', status: 'approved', type: 'vacation' },
      { personnel_id: 'lizardo-pailapichun', start_date: '2026-12-07', end_date: '2026-12-07', status: 'approved', type: 'vacation' },
    ],
    allShifts: shifts,
    areaNameById,
    positionNameById,
    referenceDate: REF_DATE,
  });

  assert.equal(previewVac.v2.total_required, 2);
  assert.equal(previewVac.v2.total_covered, 2);
  assert.equal(previewVac.v2.total_vacancies, 0);
  const v2AssignedIds = new Set((previewVac.v2.assignments || []).map((a) => a.personnel_id));
  assert.equal(v2AssignedIds.has('op-1'), true);
  assert.equal(v2AssignedIds.has('op-2'), true);
  assert.equal(v2AssignedIds.has('eloy-ponce'), false);
  assert.equal(v2AssignedIds.has('lizardo-pailapichun'), false);
});

test('Prioridades por lote en vista previa: consulta 407 IDs en lotes acotados y detiene si un lote falla', async () => {
  const reqIds407 = Array.from({ length: 407 }, (_, i) => `req-${i + 1}`);
  const batchSizes: number[] = [];

  const mockSupabaseOk = {
    from: (table: string) => {
      assert.equal(table, 'shift_requirement_priority_quotas');
      return {
        select: () => ({
          in: async (_col: string, ids: string[]) => {
            batchSizes.push(ids.length);
            // req-1 y req-407 tienen desglose; los demás representan requerimientos sin desglose (consulta exitosa)
            const rows: Array<{ shift_requirement_id: string; priority: string; required_count: number }> = [];
            if (ids.includes('req-1')) {
              rows.push({ shift_requirement_id: 'req-1', priority: 'CRITICAL', required_count: 4 });
              rows.push({ shift_requirement_id: 'req-1', priority: 'HIGH', required_count: 1 });
            }
            if (ids.includes('req-407')) {
              rows.push({ shift_requirement_id: 'req-407', priority: 'CRITICAL', required_count: 3 });
              rows.push({ shift_requirement_id: 'req-407', priority: 'HIGH', required_count: 2 });
            }
            return { data: rows, error: null };
          },
        }),
      };
    },
  };

  const okRes = await fetchPriorityQuotasInBatches(mockSupabaseOk, reqIds407);
  assert.equal(okRes.ok, true);
  if (okRes.ok) {
    assert.deepEqual(batchSizes, [100, 100, 100, 100, 7]);
    assert.equal(okRes.quotasByReqId.get('req-1')?.length, 2);
    assert.equal(okRes.quotasByReqId.get('req-407')?.length, 2);
    assert.equal(okRes.quotasByReqId.get('req-200'), undefined);
  }

  // Fallo en el lote 3 debe abortar loadPreviewCompareInputs sin devolver prioridades incompletas
  let callCount = 0;
  const makeEmptyQueryChain = (data: any[] = []) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      gte: () => chain,
      lte: () => chain,
      neq: () => chain,
      order: () => chain,
      range: async () => ({ data, error: null }),
      then: (resolve: (val: any) => void) => resolve({ data, error: null }),
    };
    return chain;
  };
  const mockSupabaseBatchFail = {
    from: (table: string) => {
      if (table === 'shift_requirements') {
        return makeEmptyQueryChain(
          reqIds407.map((id) => ({ id, date: '2026-12-07', required_count: 1 }))
        );
      }
      if (table === 'shift_requirement_priority_quotas') {
        return {
          select: () => ({
            in: async () => {
              callCount++;
              if (callCount === 3) {
                return { data: null, error: { message: 'fetch failed on batch 3' } };
              }
              return { data: [], error: null };
            },
          }),
        };
      }
      return makeEmptyQueryChain([]);
    },
  };

  const failLoaded = await loadPreviewCompareInputs(mockSupabaseBatchFail, {
    startDate: '2026-12-07',
    endDate: '2027-01-03',
  });
  assert.equal(failLoaded.ok, false);
  if (!failLoaded.ok) {
    assert.match(failLoaded.error, /lote \(3\)/i);
    assert.match(failLoaded.error, /fetch failed on batch 3/i);
  }
});

test('Preferencias flexibles v2: continuidad AM 11 y 2 libres consecutivos cuando hay alternativa, cediendo si hace falta para cobertura, y Vista Diaria con 0/N', () => {
  const shifts = [
    { id: 'sh-am08', name: 'AM 08', start_time: '08:00', end_time: '17:00', duration_hours: 8 },
    { id: 'sh-am11', name: 'AM 11', start_time: '11:00', end_time: '20:00', duration_hours: 8 },
  ];
  const areaNameById = new Map([['area-blue', 'Blue Express']]);
  const positionNameById = new Map([['pos-cond', 'Conductor Camion']]);

  // 1) Caso donde aplican ambas preferencias:
  // Trabajador A tuvo AM 11 el domingo previo (2026-12-06); Trabajador B tuvo AM 08 el domingo previo.
  // El lunes 2026-12-07 hay 1 cupo AM 08 y 1 cupo AM 11 -> A debe mantener AM 11 y B ir a AM 08 (0 transiciones AM11->AM08).
  const pA: PersonnelScheduleProfile = {
    personnel_id: 'p-a',
    full_name: 'TRABAJADOR A',
    main_position: 'pos-cond',
    secondary_positions: [],
    rotation_pattern: '5X2',
  };
  const pB: PersonnelScheduleProfile = {
    personnel_id: 'p-b',
    full_name: 'TRABAJADOR B',
    main_position: 'pos-cond',
    secondary_positions: [],
    rotation_pattern: '5X2',
  };

  const prevAssignments: RawExistingAssignment[] = [
    {
      id: 'prev-a',
      date: '2026-12-06',
      personnel_id: 'p-a',
      area_id: 'area-blue',
      position_id: 'pos-cond',
      shift_id: 'sh-am11',
      shift_start: '11:00',
      shift_end: '20:00',
      duration_hours: 8,
      status: 'scheduled',
      is_published: true,
    },
    {
      id: 'prev-b',
      date: '2026-12-06',
      personnel_id: 'p-b',
      area_id: 'area-blue',
      position_id: 'pos-cond',
      shift_id: 'sh-am08',
      shift_start: '08:00',
      shift_end: '17:00',
      duration_hours: 8,
      status: 'scheduled',
      is_published: true,
    },
  ];

  const reqsApply: RawShiftRequirement[] = [
    {
      id: 'r-am08-7',
      date: '2026-12-07',
      area_id: 'area-blue',
      position_id: 'pos-cond',
      shift_id: 'sh-am08',
      required_count: 1,
      priority: 'CRITICAL',
      is_extra: false,
      area: { name: 'Blue Express' },
      position: { name: 'Conductor Camion' },
      shift: shifts[0],
    },
    {
      id: 'r-am11-7',
      date: '2026-12-07',
      area_id: 'area-blue',
      position_id: 'pos-cond',
      shift_id: 'sh-am11',
      required_count: 1,
      priority: 'CRITICAL',
      is_extra: false,
      area: { name: 'Blue Express' },
      position: { name: 'Conductor Camion' },
      shift: shifts[1],
    },
  ];

  const resPref = scheduleCrossArea({
    startDate: '2026-12-07',
    endDate: '2026-12-07',
    rawRequirements: reqsApply,
    existingAssignments: prevAssignments,
    personnel: [pB, pA],
    areaNameById,
    positionNameById,
    referenceDate: REF_DATE,
  });

  const aDec7 = resPref.ordinary_assignments.find((a) => a.personnel_id === 'p-a');
  const bDec7 = resPref.ordinary_assignments.find((a) => a.personnel_id === 'p-b');
  assert.equal(aDec7?.shift_id, 'sh-am11');
  assert.equal(bDec7?.shift_id, 'sh-am08');

  // 2) Caso donde debe ceder para mantener cobertura:
  // Trabajador A tuvo AM 11 el 2026-12-06, y el 2026-12-07 solo existe cupo AM 08 (con otro cupo 0/1 vacante sin candidatos).
  // Debe asignar AM 08 a A para no perder cobertura, y buildV2DailyPlanningRows debe listar primero el 0/1.
  const reqsYield: RawShiftRequirement[] = [
    {
      id: 'r-yield-am08',
      date: '2026-12-07',
      area_id: 'area-blue',
      position_id: 'pos-cond',
      shift_id: 'sh-am08',
      required_count: 1,
      priority: 'CRITICAL',
      is_extra: false,
      area: { name: 'Blue Express' },
      position: { name: 'Conductor Camion' },
      shift: shifts[0],
    },
    {
      id: 'r-vac-0n',
      date: '2026-12-07',
      area_id: 'area-blue',
      position_id: 'pos-sin-personal',
      shift_id: 'sh-am11',
      required_count: 1,
      priority: 'HIGH',
      is_extra: false,
      area: { name: 'Blue Express' },
      position: { name: 'Ayudante' },
      shift: shifts[1],
    },
  ];
  const previewYield = compareEnginesPreview({
    startDate: '2026-12-07',
    endDate: '2026-12-07',
    rawRequirements: reqsYield,
    existingAssignments: [prevAssignments[0]],
    personnel: [pA],
    allShifts: shifts,
    areaNameById,
    positionNameById: new Map([
      ['pos-cond', 'Conductor Camion'],
      ['pos-sin-personal', 'Ayudante'],
    ]),
    reinforcementConfig: {
      'pos-cond': {
        shift_id: 'sh-am08',
        shift_start: '08:00',
        shift_end: '17:00',
        duration_hours: 8,
        area_id: 'area-blue',
        position_id: 'pos-cond',
      },
    },
    referenceDate: REF_DATE,
  });

  // Cobertura: AM 08 cubierto por A (1/1) pese a venir de AM 11; Ayudante queda 0/1
  assert.equal(previewYield.v2.total_covered, 1);
  assert.equal(previewYield.v2.total_vacancies, 1);

  const dailyRows = buildV2DailyPlanningRows(
    '2026-12-07',
    previewYield.v2,
    new Map([['p-a', 'TRABAJADOR A']])
  );
  assert.equal(dailyRows.length, 2);
  // Primero el requerimiento con faltantes (0/1) y su prioridad HIGH
  assert.equal(dailyRows[0].position_name, 'Ayudante');
  assert.equal(dailyRows[0].ordinary_covered_count, 0);
  assert.equal(dailyRows[0].required_count, 1);
  assert.deepEqual(dailyRows[0].vacancy_priorities, ['HIGH']);
  // Luego el cubierto (1/1)
  assert.equal(dailyRows[1].position_name, 'Conductor Camion');
  assert.equal(dailyRows[1].ordinary_covered_count, 1);
  assert.equal(dailyRows[1].ordinary_workers[0].name, 'TRABAJADOR A');

  const sheet = groupV2DailyPlanningSections([
    {
      date: '2026-12-11',
      area_id: 'a-base',
      area_name: 'Base Minerquim',
      position_id: 'p-sup-base',
      position_name: 'Supervisor Base',
      shift_id: 's-am07',
      shift_name: 'AM 07',
      shift_start: '07:00:00',
      shift_end: '16:00:00',
      required_count: 1,
      ordinary_covered_count: 0,
      missing_count: 1,
      vacancy_priorities: ['HIGH'],
      ordinary_workers: [],
      reinforcement_workers: [],
      extra_workers: [],
    },
    {
      date: '2026-12-11',
      area_id: 'a-blue',
      area_name: 'Blue Express',
      position_id: 'p-cond',
      position_name: 'Conductor Camion',
      shift_id: 's-am08',
      shift_name: 'AM 08',
      shift_start: '08:00:00',
      shift_end: '17:00:00',
      required_count: 1,
      ordinary_covered_count: 1,
      missing_count: 0,
      vacancy_priorities: [],
      ordinary_workers: [
        { personnel_id: 'c1', name: 'JUAN COLINA', is_protected: false, assignment_kind: 'ordinary', match_type: 'primary' },
      ],
      reinforcement_workers: [],
      extra_workers: [],
    },
    {
      date: '2026-12-11',
      area_id: 'a-blue',
      area_name: 'Blue Express',
      position_id: 'p-ayu',
      position_name: 'Ayudante',
      shift_id: 's-am08',
      shift_name: 'AM 08',
      shift_start: '08:00:00',
      shift_end: '17:00:00',
      required_count: 1,
      ordinary_covered_count: 1,
      missing_count: 0,
      vacancy_priorities: [],
      ordinary_workers: [
        { personnel_id: 'a1', name: 'VICTOR SEPULVEDA', is_protected: false, assignment_kind: 'ordinary', match_type: 'primary' },
      ],
      reinforcement_workers: [],
      extra_workers: [],
    },
  ]);
  assert.equal(sheet.supervisor.length, 1);
  assert.equal(sheet.supervisor[0].ordinary_workers.length, 0);
  assert.deepEqual(sheet.supervisor[0].vacancy_priorities, ['HIGH']);
  assert.equal(sheet.blue_express.length, 1);
  assert.equal(sheet.blue_express[0].conductors[0].name, 'JUAN COLINA');
  assert.equal(sheet.blue_express[0].ayudantes[0].name, 'VICTOR SEPULVEDA');
});

test('Supervisores en fines de semana (reparto equilibrado) y ajuste manual + deshacer en borrador v2 sincronizado con resumen y hoja diaria', () => {
  const shifts = [
    { id: 'sh-am07', name: 'AM 07', start_time: '07:00', end_time: '16:00', duration_hours: 8 },
  ];
  const areaNameById = new Map([['area-base', 'Base Minerquim']]);
  const positionNameById = new Map([['pos-sup-base', 'Supervisor Base']]);

  const sup1: PersonnelScheduleProfile = {
    personnel_id: 'sup-1',
    full_name: 'SUPERVISOR UNO',
    main_position: 'pos-sup-base',
    secondary_positions: [],
    rotation_pattern: '5X2',
  };
  const sup2: PersonnelScheduleProfile = {
    personnel_id: 'sup-2',
    full_name: 'SUPERVISOR DOS',
    main_position: 'pos-sup-base',
    secondary_positions: [],
    rotation_pattern: '5X2',
  };

  // Dos fines de semana (12-13 dic y 19-20 dic) con 1 cupo cada día -> debe repartirse equilibrado (2 y 2)
  const reqs: RawShiftRequirement[] = ['2026-12-12', '2026-12-13', '2026-12-19', '2026-12-20'].map(
    (d, i) => ({
      id: `req-sup-${i}`,
      date: d,
      area_id: 'area-base',
      position_id: 'pos-sup-base',
      shift_id: 'sh-am07',
      required_count: 1,
      priority: 'HIGH',
      is_extra: false,
      area: { name: 'Base Minerquim' },
      position: { name: 'Supervisor Base' },
      shift: shifts[0],
    })
  );

  const preview = compareEnginesPreview({
    startDate: '2026-12-12',
    endDate: '2026-12-20',
    rawRequirements: reqs,
    existingAssignments: [],
    personnel: [sup1, sup2],
    allShifts: shifts,
    areaNameById,
    positionNameById,
    referenceDate: REF_DATE,
  });

  const audit = computeV2AuditSummaries({
    v2: preview.v2,
    personnel: [sup1, sup2],
    existingAssignments: [],
  });
  const s1Wk = audit.people.find((p) => p.personnel_id === 'sup-1')!;
  const s2Wk = audit.people.find((p) => p.personnel_id === 'sup-2')!;
  assert.equal(s1Wk.saturdays_worked.length + s1Wk.sundays_worked_dec.length, 2);
  assert.equal(s2Wk.saturdays_worked.length + s2Wk.sundays_worked_dec.length, 2);

  // Ajuste manual en borrador: quitar asignación de 2026-12-12 -> impacta cobertura HIGH (4 -> 3) y hoja diaria muestra Sin cubrir
  const dec12Asgn = (preview.v2.assignments || []).find((a) => a.date === '2026-12-12')!;
  const removed = applyV2DraftAdjustment({
    currentV2: preview.v2,
    adjustment: {
      action: 'remove',
      date: '2026-12-12',
      personnel_id: dec12Asgn.personnel_id,
      shift_id: dec12Asgn.shift_id,
      shift_name: dec12Asgn.shift_name || '',
      shift_start: dec12Asgn.shift_start,
      shift_end: dec12Asgn.shift_end,
      duration_hours: 8,
      area_id: dec12Asgn.area_id,
      area_name: dec12Asgn.area_name || '',
      position_id: dec12Asgn.position_id,
      position_name: dec12Asgn.position_name || '',
    },
    person: dec12Asgn.personnel_id === 'sup-1' ? sup1 : sup2,
  });
  assert.equal(removed.valid, true);
  assert.equal(removed.impact.before.by_priority?.HIGH?.covered, 4);
  assert.equal(removed.impact.after.by_priority?.HIGH?.covered, 3);

  const dailyAfterRemove = buildV2DailyPlanningRows(
    '2026-12-12',
    removed.nextV2,
    new Map([
      ['sup-1', 'SUPERVISOR UNO'],
      ['sup-2', 'SUPERVISOR DOS'],
    ])
  );
  assert.equal(dailyAfterRemove[0].ordinary_covered_count, 0);
  assert.deepEqual(dailyAfterRemove[0].vacancy_priorities, ['HIGH']);

  // Deshacer (restaurar preview.v2) vuelve a 4/4 y hoja diaria cubierta
  const dailyAfterUndo = buildV2DailyPlanningRows(
    '2026-12-12',
    preview.v2,
    new Map([
      ['sup-1', 'SUPERVISOR UNO'],
      ['sup-2', 'SUPERVISOR DOS'],
    ])
  );
  assert.equal(dailyAfterUndo[0].ordinary_covered_count, 1);
  assert.equal(preview.v2.total_covered, 4);
});

test('Revisión semanal Stage 4C: intercambio de 2 personas (Manuel -> DHL AM 04, Juan -> Aeropuerto AM 04) válido y rechazado por descanso/protegido', () => {
  const juan: PersonnelScheduleProfile = {
    personnel_id: 'juan-colina',
    full_name: 'Juan Natividad Colina',
    birth_date: '1988-05-10',
    main_position: 'pos-dhl',
    secondary_positions: ['pos-aero'],
    area_id: 'area-bodegas',
    rotation_pattern: '5X2',
  };
  const manuel: PersonnelScheduleProfile = {
    personnel_id: 'manuel-gonz',
    full_name: 'Manuel Jesus Gonzalez',
    birth_date: '2000-07-24',
    main_position: 'pos-blue',
    secondary_positions: ['pos-dhl'], // NO habilitado en Aeropuerto
    area_id: 'area-blue',
    rotation_pattern: '5X2',
  };

  // Martes 2026-12-15: DHL AM 04 (HIGH) + Aeropuerto AM 04 (CRITICAL)
  // Juan tiene turno protegido en DHL AM 04? En Caso 1 NO -> Juan puede pasar a Aeropuerto AM 04 y Manuel a DHL AM 04.
  const reqs: RawShiftRequirement[] = [
    {
      id: 'req-dhl-15',
      date: '2026-12-15',
      area_id: 'area-bodegas',
      position_id: 'pos-dhl',
      shift_id: 'sh-am04',
      required_count: 1,
      priority: 'HIGH',
      shift: { name: 'AM 04', start_time: '04:00', end_time: '13:00', duration_hours: 8 },
    },
    {
      id: 'req-aero-15',
      date: '2026-12-15',
      area_id: 'area-aero',
      position_id: 'pos-aero',
      shift_id: 'sh-am04',
      required_count: 1,
      priority: 'CRITICAL',
      shift: { name: 'AM 04', start_time: '04:00', end_time: '13:00', duration_hours: 8 },
    },
  ];

  // Caso 1 (Válido): Manuel libre el 15-12 y sin conflicto de descanso -> cobertura 2/2
  const areaNames = new Map([
    ['area-bodegas', 'Bodegas'],
    ['area-aero', 'Aeropuerto'],
    ['area-blue', 'BlueExpress'],
  ]);
  const posNames = new Map([
    ['pos-dhl', 'Operador DHL'],
    ['pos-aero', 'Operador Aeropuerto'],
    ['pos-blue', 'Ayudante'],
  ]);

  const validRes = scheduleCrossArea({
    startDate: '2026-12-14',
    endDate: '2026-12-20',
    rawRequirements: reqs,
    existingAssignments: [],
    personnel: [juan, manuel],
    areaNameById: areaNames,
    positionNameById: posNames,
    referenceDate: REF_DATE,
  });
  assert.equal(validRes.coverage.ordinary.total_covered, 2);
  assert.equal(validRes.coverage.ordinary.total_vacancies, 0);
  const dec15Aero = validRes.ordinary_assignments.find((a) => a.date === '2026-12-15' && a.position_id === 'pos-aero');
  const dec15Dhl = validRes.ordinary_assignments.find((a) => a.date === '2026-12-15' && a.position_id === 'pos-dhl');
  assert.equal(dec15Aero?.personnel_id, 'juan-colina');
  assert.equal(dec15Dhl?.personnel_id, 'manuel-gonz');

  // Caso 2 (Rechazado): Manuel trabajó el 14-12 hasta las 20:00 (AM 11) -> solo 8h de descanso antes de AM 04 (04:00)
  // y Juan tiene DHL AM 04 protegido -> el intercambio debe rechazarse y Aeropuerto AM 04 queda vacante.
  const rejectedRes = scheduleCrossArea({
    startDate: '2026-12-14',
    endDate: '2026-12-20',
    rawRequirements: reqs,
    existingAssignments: [
      {
        date: '2026-12-14',
        personnel_id: 'manuel-gonz',
        area_id: 'area-blue',
        position_id: 'pos-blue',
        shift_id: 'sh-am11',
        status: 'CONFIRMED',
        is_locked: true,
        is_extra: false,
        shift_start: '11:00',
        shift_end: '20:00',
        duration_hours: 8,
      },
      {
        date: '2026-12-15',
        personnel_id: 'juan-colina',
        area_id: 'area-bodegas',
        position_id: 'pos-dhl',
        shift_id: 'sh-am04',
        status: 'CONFIRMED',
        is_locked: true,
        is_extra: false,
        shift_start: '04:00',
        shift_end: '13:00',
        duration_hours: 8,
      },
    ],
    personnel: [juan, manuel],
    areaNameById: areaNames,
    positionNameById: posNames,
    referenceDate: REF_DATE,
  });
  assert.equal(rejectedRes.coverage.ordinary.total_covered, 1);
  assert.equal(rejectedRes.coverage.ordinary.total_vacancies, 1);
  assert.equal(rejectedRes.remaining_vacancies[0].position_id, 'pos-aero');
});

test('Stage 4C nunca degrada un cupo CRITICAL compartido en el mismo slot_key al cubrir una vacante HIGH', () => {
  const op1: PersonnelScheduleProfile = {
    personnel_id: 'op-1',
    full_name: 'Operador Uno',
    birth_date: '1990-01-10',
    main_position: 'pos-dhl',
    area_id: 'area-bodegas',
    rotation_pattern: '5X2',
  };
  const op2: PersonnelScheduleProfile = {
    personnel_id: 'op-2',
    full_name: 'Operador Dos',
    birth_date: '1991-02-15',
    main_position: 'pos-dhl',
    area_id: 'area-bodegas',
    rotation_pattern: '5X2',
  };

  // Mismo slot_key el 2026-12-14 con 1 CRITICAL + 1 HIGH (requerido total = 2), y 1 HIGH el 2026-12-20
  const reqs: RawShiftRequirement[] = [
    {
      id: 'req-14-crit',
      date: '2026-12-14',
      area_id: 'area-bodegas',
      position_id: 'pos-dhl',
      shift_id: 'sh-am05',
      required_count: 1,
      priority: 'CRITICAL',
      shift: { name: 'AM 05', start_time: '05:00', end_time: '14:00', duration_hours: 8 },
    },
    {
      id: 'req-14-high',
      date: '2026-12-14',
      area_id: 'area-bodegas',
      position_id: 'pos-dhl',
      shift_id: 'sh-am05',
      required_count: 1,
      priority: 'HIGH',
      shift: { name: 'AM 05', start_time: '05:00', end_time: '14:00', duration_hours: 8 },
    },
    {
      id: 'req-20-high',
      date: '2026-12-20',
      area_id: 'area-bodegas',
      position_id: 'pos-dhl',
      shift_id: 'sh-am05',
      required_count: 1,
      priority: 'HIGH',
      shift: { name: 'AM 05', start_time: '05:00', end_time: '14:00', duration_hours: 8 },
    },
  ];

  const res = scheduleCrossArea({
    startDate: '2026-12-14',
    endDate: '2026-12-20',
    rawRequirements: reqs,
    existingAssignments: [],
    personnel: [op1, op2],
    areaNameById: new Map([['area-bodegas', 'Bodegas']]),
    positionNameById: new Map([['pos-dhl', 'Operador DHL']]),
    referenceDate: REF_DATE,
  });

  assert.equal(res.coverage.ordinary.by_priority?.CRITICAL?.covered, 1);
  assert.equal(res.coverage.ordinary.by_priority?.CRITICAL?.vacancies, 0);
  assert.equal(res.coverage.ordinary.total_covered, 3);
  assert.equal(res.coverage.ordinary.total_vacancies, 0);
});

test('Preferencia flexible Requiere Transporte: favorece ON en turnos con transporte, no bloquea OFF si es único y no altera turnos sin transporte', () => {
  const jaimeOn: PersonnelScheduleProfile = {
    personnel_id: 'jaime-on',
    full_name: 'Jaime Espinosa',
    birth_date: '1985-05-10',
    main_position: 'pos-aero',
    area_id: 'area-aero',
    rotation_pattern: '5X2',
    requires_transport: true,
  };
  const juanOff: PersonnelScheduleProfile = {
    personnel_id: 'juan-off',
    full_name: 'Juan Colina',
    birth_date: '1988-05-10',
    main_position: 'pos-aero',
    area_id: 'area-aero',
    rotation_pattern: '5X2',
    requires_transport: false,
  };

  // 1. Jueves 2026-12-10: AM 04 (requires_transport: true) y AM 07 (requires_transport: false)
  // Aunque Juan esté antes en el arreglo, debe preferir a Jaime (ON) en AM 04 y dejar a Juan (OFF) en AM 07.
  const swapRes = scheduleCrossArea({
    startDate: '2026-12-10',
    endDate: '2026-12-10',
    rawRequirements: [
      {
        id: 'req-am04',
        date: '2026-12-10',
        area_id: 'area-aero',
        position_id: 'pos-aero',
        shift_id: 'sh-am04',
        required_count: 1,
        priority: 'CRITICAL',
        shift: { name: 'AM 04', start_time: '04:00', end_time: '13:00', duration_hours: 8, requires_transport: true },
      },
      {
        id: 'req-am07',
        date: '2026-12-10',
        area_id: 'area-aero',
        position_id: 'pos-aero',
        shift_id: 'sh-am07',
        required_count: 1,
        priority: 'HIGH',
        shift: { name: 'AM 07', start_time: '07:00', end_time: '16:00', duration_hours: 8, requires_transport: false },
      },
    ],
    existingAssignments: [],
    personnel: [juanOff, jaimeOn],
    areaNameById: new Map([['area-aero', 'Aeropuerto']]),
    positionNameById: new Map([['pos-aero', 'Operador Aeropuerto']]),
    referenceDate: REF_DATE,
  });
  const am04 = swapRes.ordinary_assignments.find((a) => a.shift_id === 'sh-am04');
  const am07 = swapRes.ordinary_assignments.find((a) => a.shift_id === 'sh-am07');
  assert.equal(am04?.personnel_id, 'jaime-on');
  assert.equal(am07?.personnel_id, 'juan-off');
  assert.equal(swapRes.coverage.ordinary.total_vacancies, 0);

  // 2. Turno que NO requiere transporte: respeta orden/asignación normal sin forzar cambio por requires_transport
  const noTrRes = scheduleCrossArea({
    startDate: '2026-12-10',
    endDate: '2026-12-10',
    rawRequirements: [
      {
        id: 'req-am08',
        date: '2026-12-10',
        area_id: 'area-aero',
        position_id: 'pos-aero',
        shift_id: 'sh-am08',
        required_count: 1,
        priority: 'NORMAL',
        shift: { name: 'AM 08', start_time: '08:00', end_time: '17:00', duration_hours: 8, requires_transport: false },
      },
    ],
    existingAssignments: [],
    personnel: [juanOff, jaimeOn],
    areaNameById: new Map([['area-aero', 'Aeropuerto']]),
    positionNameById: new Map([['pos-aero', 'Operador Aeropuerto']]),
    referenceDate: REF_DATE,
  });
  assert.equal(noTrRes.ordinary_assignments[0]?.personnel_id, 'juan-off');

  // 3. Turno con transporte donde el único disponible tiene OFF -> sí se le asigna sin dejar vacante
  const onlyOffRes = scheduleCrossArea({
    startDate: '2026-12-10',
    endDate: '2026-12-10',
    rawRequirements: [
      {
        id: 'req-am04-only',
        date: '2026-12-10',
        area_id: 'area-aero',
        position_id: 'pos-aero',
        shift_id: 'sh-am04',
        required_count: 1,
        priority: 'CRITICAL',
        shift: { name: 'AM 04', start_time: '04:00', end_time: '13:00', duration_hours: 8, requires_transport: true },
      },
    ],
    existingAssignments: [],
    personnel: [juanOff],
    areaNameById: new Map([['area-aero', 'Aeropuerto']]),
    positionNameById: new Map([['pos-aero', 'Operador Aeropuerto']]),
    referenceDate: REF_DATE,
  });
  assert.equal(onlyOffRes.coverage.ordinary.total_covered, 1);
  assert.equal(onlyOffRes.ordinary_assignments[0]?.personnel_id, 'juan-off');
});
