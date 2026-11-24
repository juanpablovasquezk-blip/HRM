import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveNs22AnchorFromHistory, isNs22TitularWorkNight } from './aeropuerto-ns22';
import { scheduleCrossArea, scheduleCrossAreaAsync } from './cobertura';
import { fetchAllPaginated } from './pagination';
import { compareEnginesPreview, compareEnginesPreviewStaged } from './preview-compare';
import { resolveOperadorAeropuertoPosition } from './preview-compare-server';
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
  const personnel: PersonnelScheduleProfile[] = Array.from({ length: 30 }, (_, i) => ({
    personnel_id: `v1c-p-${i}`,
    first_name: `Op ${i}`,
    main_position: 'pos-1',
    area_id: 'area-1',
  }));
  const rawRequirements: RawShiftRequirement[] = [];
  let seq = 1;
  for (const d of days) {
    for (let k = 0; k < 12; k++) {
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
  const timer = setTimeout(() => controller.abort(), 35);
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
      }
    );
  } catch (err: any) {
    caught = err;
  } finally {
    clearTimeout(timer);
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
