import { eachDayOfInterval, format, parseISO } from 'date-fns';
import { greedyAssign, greedyAssignAsync } from '../greedy-assign';
import { optimizeAssignments, optimizeAssignmentsAsync } from '../optimizer';
import type { PersonnelAvailability, ShiftSlot } from '../types';
import { scheduleCrossArea, scheduleCrossAreaAsync } from './cobertura';
import {
  buildDotacionSlotKey,
  isAssignmentProtected,
  measureDotacionCoverage,
  normalizeIsoDate,
  prepareDotacionSlots,
} from './dotacion';
import { validateJornadaConstraints } from './jornada';
import type {
  EnginePreviewMetrics,
  GeneratedAssignmentRef,
  JornadaViolation,
  Ns22ShiftDefinition,
  Ns22TitularConfig,
  PersonnelScheduleProfile,
  PreviewComparisonResult,
  RawExistingAssignment,
  RawLeaveRecord,
  RawShiftRequirement,
  ReinforcementShiftConfig,
  ScheduledShiftInterval,
  V2PreviewAssignment,
} from './types';

function buildV1PersonnelPool(params: {
  personnel: PersonnelScheduleProfile[];
  existingAssignments: RawExistingAssignment[];
  approvedLeaves: RawLeaveRecord[];
  startDate: string;
  endDate: string;
  positionFilter?: string[] | null;
}): PersonnelAvailability[] {
  const {
    personnel,
    existingAssignments,
    approvedLeaves,
    startDate,
    endDate,
    positionFilter,
  } = params;

  const sDate = parseISO(normalizeIsoDate(startDate));
  const eDate = parseISO(normalizeIsoDate(endDate));

  // Mirror current v1 engine: positionFilter only keeps main_position matches
  const filtered =
    positionFilter && positionFilter.length > 0
      ? personnel.filter((p) => p.main_position && positionFilter.includes(p.main_position))
      : personnel;

  return filtered.map((p) => {
    const hash = (p.personnel_id || '')
      .split('')
      .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const leaveDates = new Set<string>();

    for (const l of approvedLeaves) {
      if (l.personnel_id !== p.personnel_id || l.status !== 'approved') continue;
      const ls = parseISO(normalizeIsoDate(l.start_date));
      const le = parseISO(normalizeIsoDate(l.end_date));
      const cs = ls < sDate ? sDate : ls;
      const ce = le > eDate ? eDate : le;
      if (cs <= ce) {
        for (const d of eachDayOfInterval({ start: cs, end: ce })) {
          leaveDates.add(format(d, 'yyyy-MM-dd'));
        }
      }
    }

    return {
      personnel_id: p.personnel_id,
      birth_date: p.birth_date ?? null,
      first_name: p.first_name || p.personnel_id,
      main_position: p.main_position || '',
      main_position_name: p.main_position_name,
      secondary_positions: p.secondary_positions || [],
      prefers_night: Boolean(p.prefers_night),
      avoids_night: Boolean(p.avoids_night),
      fixed_shift_id: p.fixed_shift_id ?? null,
      rotation_pattern: p.rotation_pattern ?? null,
      has_special_contract: Boolean(p.has_special_contract),
      hire_date: null,
      termination_date: null,
      weekly_hours: 0,
      days_off_count: 0,
      last_shift_end: null,
      assigned_dates: new Set(
        existingAssignments
          .filter((a) => a.personnel_id === p.personnel_id && a.status !== 'cancelled')
          .map((a) => normalizeIsoDate(a.date))
      ),
      leave_dates: leaveDates,
      area_id: p.area_id || '',
      is_turn_b: hash % 2 !== 0,
      requires_transport: true,
    };
  });
}

function buildV1ShiftSlots(params: {
  rawRequirements: RawShiftRequirement[];
  existingAssignments: RawExistingAssignment[];
  startDate: string;
  endDate: string;
  areaFilter?: string | null;
  positionFilter?: string[] | null;
  areaNameById?: Map<string, string>;
  positionNameById?: Map<string, string>;
  referenceDate: Date;
}): ShiftSlot[] {
  const {
    rawRequirements,
    existingAssignments,
    startDate,
    endDate,
    areaFilter,
    positionFilter,
    areaNameById,
    positionNameById,
    referenceDate,
  } = params;

  const normStart = normalizeIsoDate(startDate);
  const normEnd = normalizeIsoDate(endDate);
  const protectedAssignments = existingAssignments.filter((a) =>
    isAssignmentProtected(a, referenceDate)
  );

  return rawRequirements
    .filter((req) => {
      const d = normalizeIsoDate(req.date);
      if (d < normStart || d > normEnd) return false;
      if (areaFilter && req.area_id !== areaFilter) return false;
      if (positionFilter && positionFilter.length > 0 && !positionFilter.includes(req.position_id)) {
        return false;
      }
      return true;
    })
    .map((req) => {
      const d = normalizeIsoDate(req.date);
      const filled = protectedAssignments.filter(
        (a) =>
          normalizeIsoDate(a.date) === d &&
          a.shift_id === req.shift_id &&
          a.area_id === req.area_id &&
          a.position_id === req.position_id
      ).length;
      const posName = req.position?.name ?? req.positions?.name ?? positionNameById?.get(req.position_id);
      const areaName = req.area?.name ?? areaNameById?.get(req.area_id);

      return {
        requirement_id: req.id,
        date: d,
        shift_id: req.shift_id,
        area_id: req.area_id,
        position_id: req.position_id,
        shift_start: req.shift?.start_time || '00:00',
        shift_end: req.shift?.end_time || '00:00',
        shift_duration_hours: Number(req.shift?.duration_hours) || 8,
        required_count: req.required_count,
        filled_count: filled,
        is_extra: Boolean(req.is_extra),
        position_name: posName ?? undefined,
        area_name: areaName ?? undefined,
        shift_name: req.shift?.name ?? undefined,
        requires_transport: Boolean(req.shift?.requires_transport),
      };
    })
    .filter((s) => s.filled_count < s.required_count);
}

export type PreviewCompareStage =
  | 'loading_data'
  | 'calculating_v1'
  | 'calculating_v2'
  | 'preparing_comparison';

export interface CompareEnginesPreviewParams {
  startDate: string;
  endDate: string;
  rawRequirements: RawShiftRequirement[];
  existingAssignments: RawExistingAssignment[];
  personnel: PersonnelScheduleProfile[];
  approvedLeaves?: RawLeaveRecord[];
  allShifts?: Array<{
    id: string;
    name: string;
    start_time: string;
    end_time: string;
    duration_hours: number;
    requires_transport?: boolean;
  }>;
  blueAreaId?: string;
  areaFilter?: string | null;
  positionFilter?: string[] | null;
  ns22Config?: {
    titulares: Ns22TitularConfig[];
    shiftDef: Ns22ShiftDefinition;
  } | null;
  reinforcementConfig?: Record<
    string,
    ReinforcementShiftConfig | ReinforcementShiftConfig[]
  > | null;
  areaNameById?: Map<string, string>;
  positionNameById?: Map<string, string>;
  baseCalendarByPerson?: Map<string, Set<string>> | null;
  unconfirmedRules?: string[];
  referenceDate?: Date;
  deadlineAt?: number;
  signal?: AbortSignal;
}

function computeV1PreviewMetrics(
  params: CompareEnginesPreviewParams,
  scopedPrepared: ReturnType<typeof prepareDotacionSlots>,
  scopedSlotKeys: Set<string>
): EnginePreviewMetrics {
  const {
    startDate,
    endDate,
    rawRequirements,
    existingAssignments,
    personnel,
    approvedLeaves = [],
    allShifts = [],
    blueAreaId = '',
    areaFilter,
    positionFilter,
    areaNameById,
    positionNameById,
    referenceDate = new Date(),
  } = params;
  const normStart = normalizeIsoDate(startDate);
  const normEnd = normalizeIsoDate(endDate);

  const t1Start = performance.now();
  const v1Pool = buildV1PersonnelPool({
    personnel,
    existingAssignments,
    approvedLeaves,
    startDate,
    endDate,
    positionFilter,
  });
  const v1Slots = buildV1ShiftSlots({
    rawRequirements,
    existingAssignments,
    startDate,
    endDate,
    areaFilter,
    positionFilter,
    areaNameById,
    positionNameById,
    referenceDate,
  });
  const existingForV1Constraints = existingAssignments
    .filter((a) => a.status !== 'cancelled')
    .map((a) => ({
      personnel_id: a.personnel_id,
      date: normalizeIsoDate(a.date),
      duration_hours: Number(a.duration_hours) || 8,
      shift_start: a.shift_start || '08:00',
      shift_end: a.shift_end || '16:00',
    }));

  const greedyRes = greedyAssign(
    v1Slots,
    v1Pool,
    existingForV1Constraints,
    normStart,
    normEnd,
    allShifts,
    blueAreaId,
    { deadlineAt: params.deadlineAt, signal: params.signal }
  );
  const v1Opt = optimizeAssignments(greedyRes.assignments, v1Pool, v1Slots, {
    deadlineAt: params.deadlineAt,
    signal: params.signal,
  });
  const t1Ms = performance.now() - t1Start;
  return finalizeV1PreviewMetrics(params, scopedPrepared, scopedSlotKeys, v1Opt.assignments, t1Ms);
}

async function computeV1PreviewMetricsAsync(
  params: CompareEnginesPreviewParams,
  scopedPrepared: ReturnType<typeof prepareDotacionSlots>,
  scopedSlotKeys: Set<string>
): Promise<EnginePreviewMetrics> {
  const {
    startDate,
    endDate,
    rawRequirements,
    existingAssignments,
    personnel,
    approvedLeaves = [],
    allShifts = [],
    blueAreaId = '',
    areaFilter,
    positionFilter,
    areaNameById,
    positionNameById,
    referenceDate = new Date(),
  } = params;
  const normStart = normalizeIsoDate(startDate);
  const normEnd = normalizeIsoDate(endDate);

  const t1Start = performance.now();
  const v1Pool = buildV1PersonnelPool({
    personnel,
    existingAssignments,
    approvedLeaves,
    startDate,
    endDate,
    positionFilter,
  });
  const v1Slots = buildV1ShiftSlots({
    rawRequirements,
    existingAssignments,
    startDate,
    endDate,
    areaFilter,
    positionFilter,
    areaNameById,
    positionNameById,
    referenceDate,
  });
  const existingForV1Constraints = existingAssignments
    .filter((a) => a.status !== 'cancelled')
    .map((a) => ({
      personnel_id: a.personnel_id,
      date: normalizeIsoDate(a.date),
      duration_hours: Number(a.duration_hours) || 8,
      shift_start: a.shift_start || '08:00',
      shift_end: a.shift_end || '16:00',
    }));

  const execOpts = { deadlineAt: params.deadlineAt, signal: params.signal };
  const greedyRes = await greedyAssignAsync(
    v1Slots,
    v1Pool,
    existingForV1Constraints,
    normStart,
    normEnd,
    allShifts,
    blueAreaId,
    execOpts
  );
  const v1Opt = await optimizeAssignmentsAsync(greedyRes.assignments, v1Pool, v1Slots, execOpts);
  const t1Ms = performance.now() - t1Start;
  return finalizeV1PreviewMetrics(params, scopedPrepared, scopedSlotKeys, v1Opt.assignments, t1Ms);
}

function finalizeV1PreviewMetrics(
  params: CompareEnginesPreviewParams,
  scopedPrepared: ReturnType<typeof prepareDotacionSlots>,
  scopedSlotKeys: Set<string>,
  optAssignments: ReturnType<typeof optimizeAssignments>['assignments'],
  t1Ms: number
): EnginePreviewMetrics {
  const {
    startDate,
    endDate,
    existingAssignments,
    personnel,
    approvedLeaves = [],
    allShifts = [],
    referenceDate = new Date(),
  } = params;
  const normStart = normalizeIsoDate(startDate);
  const normEnd = normalizeIsoDate(endDate);

  const v1Refs: GeneratedAssignmentRef[] = [];
  let v1PrimaryCount = 0;
  let v1SecondaryCount = 0;
  let v1ReinforcementCount = 0;

  for (const a of optAssignments) {
    const key = buildDotacionSlotKey({
      date: a.date,
      area_id: a.area_id,
      position_id: a.position_id,
      shift_id: a.shift_id,
    });
    if (!scopedSlotKeys.has(key)) {
      v1ReinforcementCount++;
      continue;
    }
    v1Refs.push({
      personnel_id: a.personnel_id,
      date: a.date,
      area_id: a.area_id,
      position_id: a.position_id,
      shift_id: a.shift_id,
      is_extra: Boolean(a.is_extra),
    });
    const person = personnel.find((p) => p.personnel_id === a.personnel_id);
    if (person?.main_position === a.position_id) {
      v1PrimaryCount++;
    } else {
      v1SecondaryCount++;
    }
  }

  const v1Coverage = measureDotacionCoverage(scopedPrepared, v1Refs);
  const v1Conflicts: JornadaViolation[] = [];
  const shiftMap = new Map(allShifts.map((s) => [s.id, s]));

  const v1ShiftsByPerson = new Map<string, ScheduledShiftInterval[]>();
  for (const a of existingAssignments) {
    if (a.status === 'cancelled') continue;
    if (!isAssignmentProtected(a, referenceDate) && normalizeIsoDate(a.date) >= normStart && normalizeIsoDate(a.date) <= normEnd) {
      continue;
    }
    if (!v1ShiftsByPerson.has(a.personnel_id)) v1ShiftsByPerson.set(a.personnel_id, []);
    v1ShiftsByPerson.get(a.personnel_id)!.push({
      date: normalizeIsoDate(a.date),
      shift_start: a.shift_start || '08:00',
      shift_end: a.shift_end || '16:00',
      duration_hours: Number(a.duration_hours) || 8,
    });
  }
  for (const a of optAssignments) {
    const person = personnel.find((p) => p.personnel_id === a.personnel_id);
    if (!person) continue;
    const sh = shiftMap.get(a.shift_id);
    const interval: ScheduledShiftInterval = {
      date: normalizeIsoDate(a.date),
      shift_start: sh?.start_time || '08:00',
      shift_end: sh?.end_time || '16:00',
      duration_hours: Number(sh?.duration_hours) || 8,
      shift_id: a.shift_id,
      area_id: a.area_id,
      position_id: a.position_id,
    };
    const prev = v1ShiftsByPerson.get(a.personnel_id) || [];
    const violations = validateJornadaConstraints(person, interval, prev, approvedLeaves);
    for (const err of violations.filter((v) => v.severity === 'error')) {
      v1Conflicts.push(err);
    }
    v1ShiftsByPerson.set(a.personnel_id, [...prev, interval]);
  }

  return {
    engine: 'v1',
    label: 'Motor Actual (v1 · Predeterminado)',
    total_required: v1Coverage.ordinary.total_required,
    total_covered: v1Coverage.ordinary.total_covered,
    total_vacancies: v1Coverage.ordinary.total_vacancies,
    coverage_percent: v1Coverage.ordinary.coverage_percent,
    covered_primary_count: v1PrimaryCount,
    covered_secondary_count: v1SecondaryCount,
    reinforcement_count: v1ReinforcementCount,
    jornada_conflicts_count: v1Conflicts.length,
    vacancies: v1Coverage.ordinary.slots.filter((s) => s.vacancy_count > 0),
    conflicts: v1Conflicts,
    holiday_warnings: [],
    execution_time_ms: Math.round(t1Ms * 100) / 100,
  };
}

function buildV2MetricsFromResult(
  v2Res: ReturnType<typeof scheduleCrossArea>,
  t2Ms: number,
  params: CompareEnginesPreviewParams
): EnginePreviewMetrics {
  const normStart = normalizeIsoDate(params.startDate);
  const normEnd = normalizeIsoDate(params.endDate);
  const refDate = params.referenceDate ?? new Date();
  const shiftMap = new Map((params.allShifts || []).map((s) => [s.id, s]));
  const personMap = new Map(params.personnel.map((p) => [p.personnel_id, p]));

  const previewAssignments: V2PreviewAssignment[] = [];
  const seenKeys = new Set<string>();

  for (const a of v2Res.assignments) {
    const k = `${a.date}|${a.personnel_id}|${a.shift_id}|${a.area_id}|${a.position_id}`;
    seenKeys.add(k);
    const sh = shiftMap.get(a.shift_id);
    previewAssignments.push({
      date: a.date,
      personnel_id: a.personnel_id,
      shift_id: a.shift_id,
      shift_name: sh?.name || `${a.shift_start.slice(0, 5)}`,
      shift_start: a.shift_start,
      shift_end: a.shift_end,
      area_id: a.area_id,
      area_name: params.areaNameById?.get(a.area_id) || '',
      position_id: a.position_id,
      position_name: params.positionNameById?.get(a.position_id) || '',
      assignment_kind: a.assignment_kind,
      match_type: a.match_type,
      is_protected: Boolean(a.is_locked || a.frozen_by_rule),
      is_extra: false,
    });
  }

  for (const ex of params.existingAssignments) {
    if (ex.status === 'cancelled') continue;
    const dStr = normalizeIsoDate(ex.date);
    if (dStr < normStart || dStr > normEnd) continue;
    if (params.areaFilter && ex.area_id !== params.areaFilter) continue;
    if (
      params.positionFilter &&
      params.positionFilter.length > 0 &&
      !params.positionFilter.includes(ex.position_id)
    ) {
      continue;
    }
    if (!isAssignmentProtected(ex, refDate) && !ex.is_extra) continue;

    const k = `${dStr}|${ex.personnel_id}|${ex.shift_id}|${ex.area_id}|${ex.position_id}`;
    if (seenKeys.has(k)) {
      const existingItem = previewAssignments.find(
        (x) =>
          `${x.date}|${x.personnel_id}|${x.shift_id}|${x.area_id}|${x.position_id}` === k
      );
      if (existingItem) existingItem.is_protected = true;
      continue;
    }
    seenKeys.add(k);
    const sh = shiftMap.get(ex.shift_id);
    const per = personMap.get(ex.personnel_id);
    const matchType =
      per?.main_position === ex.position_id ? 'primary' : 'secondary';
    previewAssignments.push({
      date: dStr,
      personnel_id: ex.personnel_id,
      shift_id: ex.shift_id,
      shift_name: sh?.name || (ex.shift_start || '08:00').slice(0, 5),
      shift_start: ex.shift_start || sh?.start_time || '08:00',
      shift_end: ex.shift_end || sh?.end_time || '16:00',
      area_id: ex.area_id,
      area_name: params.areaNameById?.get(ex.area_id) || '',
      position_id: ex.position_id,
      position_name: params.positionNameById?.get(ex.position_id) || '',
      assignment_kind: 'protected',
      match_type: matchType,
      is_protected: true,
      is_extra: Boolean(ex.is_extra),
    });
  }

  const enrichedVacancies = v2Res.remaining_vacancies.map((v) => ({
    ...v,
    area_name: v.area_name || params.areaNameById?.get(v.area_id) || '',
    position_name: v.position_name || params.positionNameById?.get(v.position_id) || '',
    shift_name: v.shift_name || shiftMap.get(v.shift_id)?.name || '',
  }));

  return {
    engine: 'v2',
    label: 'Motor Nuevo (v2 · Paralelo)',
    start_date: normStart,
    end_date: normEnd,
    total_required: v2Res.stats.total_required,
    total_covered: v2Res.stats.total_covered,
    total_vacancies: v2Res.stats.total_vacancies,
    coverage_percent: v2Res.stats.coverage_percent,
    coverage_by_priority: v2Res.coverage.ordinary.by_priority,
    covered_primary_count: v2Res.stats.covered_primary_count,
    covered_secondary_count: v2Res.stats.covered_secondary_count,
    reinforcement_count: v2Res.stats.reinforcement_count,
    jornada_conflicts_count: v2Res.audit_violations.length,
    vacancies: enrichedVacancies,
    conflicts: v2Res.audit_violations,
    holiday_warnings: v2Res.holiday_warnings,
    execution_time_ms: Math.round(t2Ms * 100) / 100,
    assignments: previewAssignments,
  };
}

function computeV2PreviewMetrics(params: CompareEnginesPreviewParams) {
  const t2Start = performance.now();
  const v2Res = scheduleCrossArea({
    startDate: params.startDate,
    endDate: params.endDate,
    rawRequirements: params.rawRequirements,
    existingAssignments: params.existingAssignments,
    personnel: params.personnel,
    approvedLeaves: params.approvedLeaves ?? [],
    areaFilter: params.areaFilter,
    positionFilter: params.positionFilter,
    ns22Config: params.ns22Config,
    reinforcementConfig: params.reinforcementConfig,
    areaNameById: params.areaNameById,
    positionNameById: params.positionNameById,
    baseCalendarByPerson: params.baseCalendarByPerson,
    referenceDate: params.referenceDate ?? new Date(),
    deadlineAt: params.deadlineAt,
    signal: params.signal,
  });
  const t2Ms = performance.now() - t2Start;
  return { v2Res, v2Metrics: buildV2MetricsFromResult(v2Res, t2Ms, params) };
}

async function computeV2PreviewMetricsAsync(params: CompareEnginesPreviewParams) {
  const t2Start = performance.now();
  const v2Res = await scheduleCrossAreaAsync({
    startDate: params.startDate,
    endDate: params.endDate,
    rawRequirements: params.rawRequirements,
    existingAssignments: params.existingAssignments,
    personnel: params.personnel,
    approvedLeaves: params.approvedLeaves ?? [],
    areaFilter: params.areaFilter,
    positionFilter: params.positionFilter,
    ns22Config: params.ns22Config,
    reinforcementConfig: params.reinforcementConfig,
    areaNameById: params.areaNameById,
    positionNameById: params.positionNameById,
    baseCalendarByPerson: params.baseCalendarByPerson,
    referenceDate: params.referenceDate ?? new Date(),
    deadlineAt: params.deadlineAt,
    signal: params.signal,
  });
  const t2Ms = performance.now() - t2Start;
  return { v2Res, v2Metrics: buildV2MetricsFromResult(v2Res, t2Ms, params) };
}

function buildComparisonResult(
  v1Metrics: EnginePreviewMetrics,
  v2Res: ReturnType<typeof scheduleCrossArea>,
  v2Metrics: EnginePreviewMetrics,
  unconfirmedRules: string[] = []
): PreviewComparisonResult {
  const collectedUnconfirmed = Array.from(
    new Set([
      ...unconfirmedRules,
      ...(v2Res.ns22_result?.verification_notices || []),
      ...v2Res.permission_cases
        .filter((c) => c.status === 'pending_relocation')
        .map((c) => c.message),
    ])
  );

  return {
    default_engine: 'v1',
    dry_run: true,
    called_v1_save_route: false,
    v1: v1Metrics,
    v2: v2Metrics,
    unconfirmed_rules: collectedUnconfirmed,
    deltas: {
      coverage_diff: v2Metrics.total_covered - v1Metrics.total_covered,
      vacancies_diff: v2Metrics.total_vacancies - v1Metrics.total_vacancies,
      primary_diff: v2Metrics.covered_primary_count - v1Metrics.covered_primary_count,
      secondary_diff: v2Metrics.covered_secondary_count - v1Metrics.covered_secondary_count,
      reinforcements_diff: v2Metrics.reinforcement_count - v1Metrics.reinforcement_count,
      conflicts_diff: v2Metrics.jornada_conflicts_count - v1Metrics.jornada_conflicts_count,
    },
  };
}

function prepareScopedDotacion(params: CompareEnginesPreviewParams) {
  const normStart = normalizeIsoDate(params.startDate);
  const normEnd = normalizeIsoDate(params.endDate);
  const preparedAll = prepareDotacionSlots(params.rawRequirements, params.existingAssignments, {
    referenceDate: params.referenceDate ?? new Date(),
    areaNameById: params.areaNameById,
    positionNameById: params.positionNameById,
  });
  const scopedPrepared = {
    ...preparedAll,
    ordinarySlots: preparedAll.ordinarySlots.filter(
      (s) =>
        s.date >= normStart &&
        s.date <= normEnd &&
        (!params.areaFilter || s.area_id === params.areaFilter) &&
        (!params.positionFilter || params.positionFilter.length === 0 || params.positionFilter.includes(s.position_id))
    ),
    extraSlots: preparedAll.extraSlots.filter(
      (s) =>
        s.date >= normStart &&
        s.date <= normEnd &&
        (!params.areaFilter || s.area_id === params.areaFilter) &&
        (!params.positionFilter || params.positionFilter.length === 0 || params.positionFilter.includes(s.position_id))
    ),
  };
  const scopedSlotKeys = new Set(scopedPrepared.ordinarySlots.map((s) => s.slot_key));
  return { scopedPrepared, scopedSlotKeys };
}

/**
 * Compares v1 (current engine in dry-run mode) vs v2 (parallel engine)
 * with the exact same dotación, availability, absences, and protected shifts.
 * Never writes to the database and never calls `generateSchedule`.
 */
export function compareEnginesPreview(
  params: CompareEnginesPreviewParams
): PreviewComparisonResult {
  const { scopedPrepared, scopedSlotKeys } = prepareScopedDotacion(params);
  const v1Metrics = computeV1PreviewMetrics(params, scopedPrepared, scopedSlotKeys);
  const { v2Res, v2Metrics } = computeV2PreviewMetrics(params);
  return buildComparisonResult(v1Metrics, v2Res, v2Metrics, params.unconfirmedRules);
}

/**
 * Async staged version of `compareEnginesPreview` for streaming real server stages
 * (`calculating_v1` -> `calculating_v2` -> `preparing_comparison`).
 */
export async function compareEnginesPreviewStaged(
  params: CompareEnginesPreviewParams,
  onStage?: (stage: Exclude<PreviewCompareStage, 'loading_data'>) => void | Promise<void>
): Promise<PreviewComparisonResult> {
  const yieldTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  const { scopedPrepared, scopedSlotKeys } = prepareScopedDotacion(params);

  await onStage?.('calculating_v1');
  await yieldTick();
  const v1Metrics = await computeV1PreviewMetricsAsync(params, scopedPrepared, scopedSlotKeys);

  await onStage?.('calculating_v2');
  await yieldTick();
  const { v2Res, v2Metrics } = await computeV2PreviewMetricsAsync(params);

  await onStage?.('preparing_comparison');
  await yieldTick();
  return buildComparisonResult(v1Metrics, v2Res, v2Metrics, params.unconfirmedRules);
}
