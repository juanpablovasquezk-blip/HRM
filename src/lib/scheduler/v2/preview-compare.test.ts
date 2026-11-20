import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveNs22AnchorFromHistory, isNs22TitularWorkNight } from './aeropuerto-ns22';
import { fetchAllPaginated } from './pagination';
import { compareEnginesPreview } from './preview-compare';
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
