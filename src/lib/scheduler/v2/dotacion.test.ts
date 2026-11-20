import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDotacionSlotKey,
  measureDotacionCoverage,
  prepareDotacionSlots,
} from './dotacion';
import type { RawExistingAssignment, RawShiftRequirement } from './types';

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
