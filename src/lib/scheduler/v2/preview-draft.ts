import { addDays, eachDayOfInterval, format, parseISO, startOfWeek } from 'date-fns';
import { getShiftOccupiedDates, hasMandatoryJornadaViolation, validateJornadaConstraints } from './jornada';
import type {
  DotacionGroupCoverage,
  EnginePreviewMetrics,
  OperationalPriority,
  PersonnelScheduleProfile,
  RawExistingAssignment,
  RawLeaveRecord,
  ScheduledShiftInterval,
  V2PreviewAssignment,
} from './types';

function normText(v?: string | null): string {
  return (v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function isForkliftName(v?: string | null): boolean {
  const n = normText(v);
  return n === 'OPERADOR GRUA HORQUILLA' || n === 'OPERADOR DE GRUA HORQUILLA';
}

function isPersonQualifiedForPosition(
  person: PersonnelScheduleProfile,
  targetPosId: string,
  targetAreaName?: string,
  targetPosName?: string,
  allMetrics?: EnginePreviewMetrics
): boolean {
  if (person.main_position === targetPosId) return true;
  if ((person.secondary_positions || []).includes(targetPosId)) return true;

  // Atrex <-> Base Minerquim Grúa Horquilla equivalence
  if (isForkliftName(targetPosName)) {
    const areaN = normText(targetAreaName);
    if (areaN === 'ATREX' || areaN === 'BASE MINERQUIM') {
      const reqs = allMetrics?.daily_requirements || [];
      const eqIds = new Set<string>();
      for (const r of reqs) {
        if (!isForkliftName(r.position_name)) continue;
        const rArea = normText(r.area_name);
        if (rArea === 'ATREX' || rArea === 'BASE MINERQUIM') {
          eqIds.add(r.position_id);
        }
      }
      if (person.main_position && eqIds.has(person.main_position)) return true;
      if ((person.secondary_positions || []).some((s) => eqIds.has(s))) return true;
    }
  }
  return false;
}

export interface V2DraftAdjustmentInput {
  action: 'add' | 'remove' | 'replace';
  date: string;
  personnel_id: string;
  shift_id: string;
  shift_name: string;
  shift_start: string;
  shift_end: string;
  duration_hours: number;
  area_id: string;
  area_name: string;
  position_id: string;
  position_name: string;
}

export interface V2DraftPersonHoursImpact {
  personnel_id: string;
  full_name?: string;
  before_hours: number;
  after_hours: number;
  delta_hours: number;
}

export interface V2DraftImpact {
  before: {
    total_covered: number;
    total_required: number;
    total_vacancies: number;
    by_priority: DotacionGroupCoverage['by_priority'];
  };
  after: {
    total_covered: number;
    total_required: number;
    total_vacancies: number;
    by_priority: DotacionGroupCoverage['by_priority'];
  };
  hours_impact?: V2DraftPersonHoursImpact[];
}

export interface V2DraftAdjustmentResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  impact: V2DraftImpact;
  nextV2: EnginePreviewMetrics;
}

const PRIO_ORDER: OperationalPriority[] = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];

export function recomputeV2MetricsFromAssignments(
  baseV2: EnginePreviewMetrics,
  nextAssignments: V2PreviewAssignment[]
): EnginePreviewMetrics {
  const reqs = baseV2.daily_requirements || [];
  const byPriority: DotacionGroupCoverage['by_priority'] = {};
  const nextVacancies: EnginePreviewMetrics['vacancies'] = [];

  let totalReq = 0;
  let totalCov = 0;
  let totalVac = 0;
  let primaryCov = 0;
  let secondaryCov = 0;
  let reinfCount = 0;

  for (const a of nextAssignments) {
    if (a.assignment_kind === 'reinforcement') {
      reinfCount++;
      continue;
    }
    if (a.is_extra) continue;
    if (a.match_type === 'primary') primaryCov++;
    else if (a.match_type === 'secondary') secondaryCov++;
  }

  for (const r of reqs) {
    const slotAsgns = nextAssignments.filter(
      (a) =>
        a.date === r.date &&
        a.area_id === r.area_id &&
        a.position_id === r.position_id &&
        a.shift_id === r.shift_id &&
        a.assignment_kind !== 'reinforcement' &&
        !a.is_extra
    );
    let remAssigned = slotAsgns.length;
    const quotas =
      r.priority_quotas && r.priority_quotas.length > 0
        ? [...r.priority_quotas].sort(
            (a, b) => PRIO_ORDER.indexOf(a.priority) - PRIO_ORDER.indexOf(b.priority)
          )
        : [{ priority: r.priority, required_count: r.required_count }];

    for (const q of quotas) {
      const cov = Math.min(q.required_count, remAssigned);
      remAssigned -= cov;
      const vac = Math.max(0, q.required_count - cov);
      totalReq += q.required_count;
      totalCov += cov;
      totalVac += vac;

      const cur = byPriority[q.priority] || { required: 0, covered: 0, vacancies: 0 };
      cur.required += q.required_count;
      cur.covered += cov;
      cur.vacancies += vac;
      byPriority[q.priority] = cur;

      if (vac > 0) {
        nextVacancies.push({
          slot_key: `${r.date}|${r.area_id}|${r.position_id}|${r.shift_id}`,
          date: r.date,
          area_id: r.area_id,
          area_name: r.area_name,
          position_id: r.position_id,
          position_name: r.position_name,
          shift_id: r.shift_id,
          shift_name: r.shift_name,
          priority: q.priority,
          priority_rank: q.priority === 'CRITICAL' ? 4 : q.priority === 'HIGH' ? 3 : q.priority === 'NORMAL' ? 2 : 1,
          required_count: q.required_count,
          is_extra: false,
          protected_filled_count: slotAsgns.filter((a) => a.is_protected).length,
          assigned_count: cov,
          covered_count: cov,
          vacancy_count: vac,
          over_allocated_count: 0,
        });
      }
    }
  }

  // Fallback if baseV2 has no daily_requirements (e.g. legacy synthetic)
  if (reqs.length === 0) {
    return {
      ...baseV2,
      assignments: nextAssignments,
      reinforcement_count: reinfCount,
    };
  }

  return {
    ...baseV2,
    total_required: totalReq,
    total_covered: totalCov,
    total_vacancies: totalVac,
    coverage_percent: totalReq > 0 ? Math.round((totalCov / totalReq) * 1000) / 10 : 100,
    coverage_by_priority: byPriority,
    covered_primary_count: primaryCov,
    covered_secondary_count: secondaryCov,
    reinforcement_count: reinfCount,
    vacancies: nextVacancies,
    assignments: nextAssignments,
  };
}

export function applyV2DraftAdjustment(params: {
  currentV2: EnginePreviewMetrics;
  adjustment: V2DraftAdjustmentInput;
  person: PersonnelScheduleProfile;
  existingOutOfRangeOrProtected?: RawExistingAssignment[];
  approvedLeaves?: RawLeaveRecord[];
  shiftDurationById?: Map<string, number>;
}): V2DraftAdjustmentResult {
  const {
    currentV2,
    adjustment,
    person,
    existingOutOfRangeOrProtected = [],
    approvedLeaves = [],
    shiftDurationById,
  } = params;

  const currentAsgns = [...(currentV2.assignments || [])];
  const existingIdx = currentAsgns.findIndex(
    (a) => a.personnel_id === adjustment.personnel_id && a.date === adjustment.date
  );
  const existingOnCell = existingIdx >= 0 ? currentAsgns[existingIdx] : null;

  const errors: string[] = [];
  const warnings: string[] = [];

  if (existingOnCell?.is_protected) {
    errors.push(
      `El turno existente el ${adjustment.date} es protegido y no puede modificarse ni eliminarse.`
    );
  }

  const computePersonWeekHours = (
    asgns: V2PreviewAssignment[],
    targetPersonId: string,
    targetDate: string
  ): number => {
    const wk = format(startOfWeek(parseISO(targetDate), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    let sum = 0;
    for (const a of asgns) {
      if (a.personnel_id !== targetPersonId) continue;
      if (format(startOfWeek(parseISO(a.date), { weekStartsOn: 1 }), 'yyyy-MM-dd') !== wk) continue;
      sum += shiftDurationById?.get(a.shift_id) ?? 8;
    }
    return sum;
  };

  if (adjustment.action === 'remove') {
    if (!existingOnCell) {
      errors.push(`No hay asignación en el borrador para quitar el ${adjustment.date}.`);
    }
    const nextAssignments =
      existingIdx >= 0 ? currentAsgns.filter((_, idx) => idx !== existingIdx) : currentAsgns;
    const nextV2 = recomputeV2MetricsFromAssignments(currentV2, nextAssignments);
    const beforeH = computePersonWeekHours(currentAsgns, adjustment.personnel_id, adjustment.date);
    const afterH = computePersonWeekHours(nextAssignments, adjustment.personnel_id, adjustment.date);
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      impact: {
        before: {
          total_covered: currentV2.total_covered,
          total_required: currentV2.total_required,
          total_vacancies: currentV2.total_vacancies,
          by_priority: currentV2.coverage_by_priority,
        },
        after: {
          total_covered: nextV2.total_covered,
          total_required: nextV2.total_required,
          total_vacancies: nextV2.total_vacancies,
          by_priority: nextV2.coverage_by_priority,
        },
        hours_impact: [
          {
            personnel_id: adjustment.personnel_id,
            full_name: person.full_name,
            before_hours: beforeH,
            after_hours: afterH,
            delta_hours: afterH - beforeH,
          },
        ],
      },
      nextV2,
    };
  }

  // Validate qualification
  const qualified = isPersonQualifiedForPosition(
    person,
    adjustment.position_id,
    adjustment.area_name,
    adjustment.position_name,
    currentV2
  );
  if (!qualified) {
    errors.push(
      `${person.full_name || person.personnel_id} no está habilitado para ${adjustment.area_name} · ${adjustment.position_name}.`
    );
  }

  // Build full calendar of person's shifts (outside-range existing + draft without existingOnCell)
  const simStart = currentV2.start_date || adjustment.date;
  const simEnd = currentV2.end_date || adjustment.date;
  const personShifts: ScheduledShiftInterval[] = [];

  for (const ex of existingOutOfRangeOrProtected) {
    if (ex.status === 'cancelled' || ex.personnel_id !== adjustment.personnel_id) continue;
    const d = String(ex.date).split('T')[0];
    if (d >= simStart && d <= simEnd) continue; // covered by draft assignments
    personShifts.push({
      date: d,
      shift_start: ex.shift_start || '08:00',
      shift_end: ex.shift_end || '16:00',
      duration_hours: Number(ex.duration_hours) || 8,
      shift_id: ex.shift_id,
      area_id: ex.area_id,
      position_id: ex.position_id,
    });
  }

  for (let i = 0; i < currentAsgns.length; i++) {
    if (i === existingIdx) continue;
    const a = currentAsgns[i];
    if (a.personnel_id !== adjustment.personnel_id) continue;
    personShifts.push({
      date: a.date,
      shift_start: a.shift_start,
      shift_end: a.shift_end,
      duration_hours: shiftDurationById?.get(a.shift_id) ?? 8,
      shift_id: a.shift_id,
      area_id: a.area_id,
      position_id: a.position_id,
    });
  }

  const candidateInterval: ScheduledShiftInterval = {
    date: adjustment.date,
    shift_start: adjustment.shift_start,
    shift_end: adjustment.shift_end,
    duration_hours: adjustment.duration_hours || 8,
    shift_id: adjustment.shift_id,
    area_id: adjustment.area_id,
    position_id: adjustment.position_id,
  };

  const violations = validateJornadaConstraints(
    person,
    candidateInterval,
    personShifts,
    approvedLeaves
  );
  for (const v of violations) {
    if (v.severity === 'error') errors.push(v.message);
    else warnings.push(v.message);
  }

  const matchType: 'primary' | 'secondary' =
    person.main_position === adjustment.position_id ||
    (isForkliftName(adjustment.position_name) && isForkliftName(person.main_position_name))
      ? 'primary'
      : 'secondary';

  const newEntry: V2PreviewAssignment = {
    date: adjustment.date,
    personnel_id: adjustment.personnel_id,
    shift_id: adjustment.shift_id,
    shift_name: adjustment.shift_name,
    shift_start: adjustment.shift_start,
    shift_end: adjustment.shift_end,
    area_id: adjustment.area_id,
    area_name: adjustment.area_name,
    position_id: adjustment.position_id,
    position_name: adjustment.position_name,
    assignment_kind: 'ordinary',
    match_type: matchType,
    is_protected: false,
    is_extra: false,
  };

  const nextAssignments =
    existingIdx >= 0
      ? currentAsgns.map((item, idx) => (idx === existingIdx ? newEntry : item))
      : [...currentAsgns, newEntry];

  const nextV2 = recomputeV2MetricsFromAssignments(currentV2, nextAssignments);
  const beforeH = computePersonWeekHours(currentAsgns, adjustment.personnel_id, adjustment.date);
  const afterH = computePersonWeekHours(nextAssignments, adjustment.personnel_id, adjustment.date);

  return {
    valid: errors.length === 0 && !hasMandatoryJornadaViolation(violations),
    errors,
    warnings,
    impact: {
      before: {
        total_covered: currentV2.total_covered,
        total_required: currentV2.total_required,
        total_vacancies: currentV2.total_vacancies,
        by_priority: currentV2.coverage_by_priority,
      },
      after: {
        total_covered: nextV2.total_covered,
        total_required: nextV2.total_required,
        total_vacancies: nextV2.total_vacancies,
        by_priority: nextV2.coverage_by_priority,
      },
      hours_impact: [
        {
          personnel_id: adjustment.personnel_id,
          full_name: person.full_name,
          before_hours: beforeH,
          after_hours: afterH,
          delta_hours: afterH - beforeH,
        },
      ],
    },
    nextV2,
  };
}

/**
 * Evaluates and applies a 2-person swap in the v2 draft, validating both workers together
 * on the resulting calendar (including adjacent weeks, NS22, rests, hours, Sundays & protected shifts).
 */
export function applyV2DraftSwap(params: {
  currentV2: EnginePreviewMetrics;
  personA: PersonnelScheduleProfile;
  dateA: string;
  personB: PersonnelScheduleProfile;
  dateB: string;
  existingOutOfRangeOrProtected?: RawExistingAssignment[];
  approvedLeaves?: RawLeaveRecord[];
  shiftDurationById?: Map<string, number>;
}): V2DraftAdjustmentResult {
  const {
    currentV2,
    personA,
    dateA,
    personB,
    dateB,
    existingOutOfRangeOrProtected = [],
    approvedLeaves = [],
    shiftDurationById,
  } = params;

  const currentAsgns = [...(currentV2.assignments || [])];
  const idxA = currentAsgns.findIndex(
    (a) => a.personnel_id === personA.personnel_id && a.date === dateA
  );
  const idxB = currentAsgns.findIndex(
    (a) => a.personnel_id === personB.personnel_id && a.date === dateB
  );
  const asgnA = idxA >= 0 ? currentAsgns[idxA] : null;
  const asgnB = idxB >= 0 ? currentAsgns[idxB] : null;

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!asgnA || !asgnB) {
    errors.push('Ambos trabajadores deben tener un turno asignado en las fechas seleccionadas para intercambiar.');
  }
  if (asgnA?.is_protected) {
    errors.push(`El turno de ${personA.full_name || personA.personnel_id} el ${dateA} es protegido y no puede intercambiarse.`);
  }
  if (asgnB?.is_protected) {
    errors.push(`El turno de ${personB.full_name || personB.personnel_id} el ${dateB} es protegido y no puede intercambiarse.`);
  }
  if (asgnA?.assignment_kind === 'ns22_titular' || asgnB?.assignment_kind === 'ns22_titular') {
    errors.push('Los turnos del ciclo 4x4 NS22 titular no pueden intercambiarse manualmente.');
  }

  if (errors.length > 0 || !asgnA || !asgnB) {
    return {
      valid: false,
      errors,
      warnings,
      impact: {
        before: {
          total_covered: currentV2.total_covered,
          total_required: currentV2.total_required,
          total_vacancies: currentV2.total_vacancies,
          by_priority: currentV2.coverage_by_priority,
        },
        after: {
          total_covered: currentV2.total_covered,
          total_required: currentV2.total_required,
          total_vacancies: currentV2.total_vacancies,
          by_priority: currentV2.coverage_by_priority,
        },
      },
      nextV2: currentV2,
    };
  }

  if (!isPersonQualifiedForPosition(personA, asgnB.position_id, asgnB.area_name, asgnB.position_name, currentV2)) {
    errors.push(`${personA.full_name || personA.personnel_id} no está habilitado para ${asgnB.area_name} · ${asgnB.position_name}.`);
  }
  if (!isPersonQualifiedForPosition(personB, asgnA.position_id, asgnA.area_name, asgnA.position_name, currentV2)) {
    errors.push(`${personB.full_name || personB.personnel_id} no está habilitado para ${asgnA.area_name} · ${asgnA.position_name}.`);
  }

  const simStart = currentV2.start_date || dateA;
  const simEnd = currentV2.end_date || dateB;

  const buildShiftsWithout = (targetId: string, skipIdx: number): ScheduledShiftInterval[] => {
    const out: ScheduledShiftInterval[] = [];
    for (const ex of existingOutOfRangeOrProtected) {
      if (ex.status === 'cancelled' || ex.personnel_id !== targetId) continue;
      const d = String(ex.date).split('T')[0];
      if (d >= simStart && d <= simEnd) continue;
      out.push({
        date: d,
        shift_start: ex.shift_start || '08:00',
        shift_end: ex.shift_end || '16:00',
        duration_hours: Number(ex.duration_hours) || 8,
        shift_id: ex.shift_id,
        area_id: ex.area_id,
        position_id: ex.position_id,
      });
    }
    for (let i = 0; i < currentAsgns.length; i++) {
      if (i === skipIdx || currentAsgns[i].personnel_id !== targetId) continue;
      const a = currentAsgns[i];
      out.push({
        date: a.date,
        shift_start: a.shift_start,
        shift_end: a.shift_end,
        duration_hours: shiftDurationById?.get(a.shift_id) ?? 8,
        shift_id: a.shift_id,
        area_id: a.area_id,
        position_id: a.position_id,
      });
    }
    return out;
  };

  const candForA: ScheduledShiftInterval = {
    date: asgnB.date,
    shift_start: asgnB.shift_start,
    shift_end: asgnB.shift_end,
    duration_hours: shiftDurationById?.get(asgnB.shift_id) ?? 8,
    shift_id: asgnB.shift_id,
    area_id: asgnB.area_id,
    position_id: asgnB.position_id,
  };
  const candForB: ScheduledShiftInterval = {
    date: asgnA.date,
    shift_start: asgnA.shift_start,
    shift_end: asgnA.shift_end,
    duration_hours: shiftDurationById?.get(asgnA.shift_id) ?? 8,
    shift_id: asgnA.shift_id,
    area_id: asgnA.area_id,
    position_id: asgnA.position_id,
  };

  for (const v of validateJornadaConstraints(personA, candForA, buildShiftsWithout(personA.personnel_id, idxA), approvedLeaves)) {
    if (v.severity === 'error') errors.push(`${personA.full_name || personA.personnel_id}: ${v.message}`);
    else warnings.push(`${personA.full_name || personA.personnel_id}: ${v.message}`);
  }
  for (const v of validateJornadaConstraints(personB, candForB, buildShiftsWithout(personB.personnel_id, idxB), approvedLeaves)) {
    if (v.severity === 'error') errors.push(`${personB.full_name || personB.personnel_id}: ${v.message}`);
    else warnings.push(`${personB.full_name || personB.personnel_id}: ${v.message}`);
  }

  const nextAssignments = currentAsgns.map((item, idx) => {
    if (idx === idxA) return { ...asgnB, personnel_id: personA.personnel_id };
    if (idx === idxB) return { ...asgnA, personnel_id: personB.personnel_id };
    return item;
  });

  const nextV2 = recomputeV2MetricsFromAssignments(currentV2, nextAssignments);
  const weekH = (asgns: V2PreviewAssignment[], pid: string, dStr: string) => {
    const wk = format(startOfWeek(parseISO(dStr), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    return asgns
      .filter((a) => a.personnel_id === pid && format(startOfWeek(parseISO(a.date), { weekStartsOn: 1 }), 'yyyy-MM-dd') === wk)
      .reduce((acc, a) => acc + (shiftDurationById?.get(a.shift_id) ?? 8), 0);
  };
  const aBefore = weekH(currentAsgns, personA.personnel_id, asgnA.date);
  const aAfter = weekH(nextAssignments, personA.personnel_id, asgnB.date);
  const bBefore = weekH(currentAsgns, personB.personnel_id, asgnB.date);
  const bAfter = weekH(nextAssignments, personB.personnel_id, asgnA.date);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    impact: {
      before: {
        total_covered: currentV2.total_covered,
        total_required: currentV2.total_required,
        total_vacancies: currentV2.total_vacancies,
        by_priority: currentV2.coverage_by_priority,
      },
      after: {
        total_covered: nextV2.total_covered,
        total_required: nextV2.total_required,
        total_vacancies: nextV2.total_vacancies,
        by_priority: nextV2.coverage_by_priority,
      },
      hours_impact: [
        { personnel_id: personA.personnel_id, full_name: personA.full_name, before_hours: aBefore, after_hours: aAfter, delta_hours: aAfter - aBefore },
        { personnel_id: personB.personnel_id, full_name: personB.full_name, before_hours: bBefore, after_hours: bAfter, delta_hours: bAfter - bBefore },
      ],
    },
    nextV2,
  };
}

export interface V2PersonAuditSummary {
  personnel_id: string;
  full_name: string;
  is_ns22_titular: boolean;
  saturdays_worked: string[];
  saturdays_free: string[];
  sundays_worked_dec: string[];
  sundays_free_dec: string[];
  sundays_worked_jan: string[];
  sundays_free_jan: string[];
  dec_free_sundays_count: number;
  dec_sunday_status: 'cumple' | 'incumple' | 'exento_4x4' | 'pendiente_historial';
  weekly_hours: Array<{ week_start: string; hours: number; limit: number; exceeds: boolean }>;
}

export function computeV2AuditSummaries(params: {
  v2: EnginePreviewMetrics;
  personnel: PersonnelScheduleProfile[];
  existingAssignments: RawExistingAssignment[];
  ns22TitularIds?: Set<string>;
  hasDecHistoryFromStart?: boolean;
}): {
  people: V2PersonAuditSummary[];
  dec_compliant_count: number;
  dec_applicable_count: number;
  dec_non_compliant: V2PersonAuditSummary[];
  dec_pending: V2PersonAuditSummary[];
} {
  const {
    v2,
    personnel,
    existingAssignments,
    ns22TitularIds = new Set<string>(),
    hasDecHistoryFromStart = true,
  } = params;

  const simStart = v2.start_date || '2026-12-07';
  const simEnd = v2.end_date || '2027-01-03';
  const decSundays = ['2026-12-06', '2026-12-13', '2026-12-20', '2026-12-27'];
  const janSundays = simEnd >= '2027-01-03' ? ['2027-01-03'] : [];
  const allDaysInSim = eachDayOfInterval({ start: parseISO(simStart), end: parseISO(simEnd) }).map((d) =>
    format(d, 'yyyy-MM-dd')
  );
  const saturdays = allDaysInSim.filter((d) => parseISO(d).getDay() === 6);
  const weekStarts = Array.from(
    new Set(allDaysInSim.map((d) => format(startOfWeek(parseISO(d), { weekStartsOn: 1 }), 'yyyy-MM-dd')))
  );

  const people: V2PersonAuditSummary[] = [];

  for (const p of personnel) {
    const isTitular = ns22TitularIds.has(p.personnel_id);
    const occupiedDates = new Set<string>();
    const hoursByDate = new Map<string, number>();

    for (const ex of existingAssignments) {
      if (ex.status === 'cancelled' || ex.personnel_id !== p.personnel_id) continue;
      const d = String(ex.date).split('T')[0];
      if (d >= simStart && d <= simEnd && !(ex.is_published || ex.is_validated || ex.status === 'confirmed' || ex.is_extra)) {
        continue;
      }
      const occ = getShiftOccupiedDates({
        date: d,
        shift_start: ex.shift_start || '08:00',
        shift_end: ex.shift_end || '16:00',
        duration_hours: Number(ex.duration_hours) || 8,
      });
      for (const od of occ) occupiedDates.add(od);
      hoursByDate.set(d, (hoursByDate.get(d) || 0) + (Number(ex.duration_hours) || 8));
    }

    for (const a of v2.assignments || []) {
      if (a.personnel_id !== p.personnel_id) continue;
      const occ = getShiftOccupiedDates({
        date: a.date,
        shift_start: a.shift_start,
        shift_end: a.shift_end,
        duration_hours: 8,
      });
      for (const od of occ) occupiedDates.add(od);
      hoursByDate.set(a.date, (hoursByDate.get(a.date) || 0) + 8);
    }

    const saturdays_worked = saturdays.filter((d) => occupiedDates.has(d));
    const saturdays_free = saturdays.filter((d) => !occupiedDates.has(d));
    const sundays_worked_dec = decSundays.filter((d) => occupiedDates.has(d));
    const sundays_free_dec = decSundays.filter((d) => !occupiedDates.has(d));
    const sundays_worked_jan = janSundays.filter((d) => occupiedDates.has(d));
    const sundays_free_jan = janSundays.filter((d) => !occupiedDates.has(d));

    const dec_free_sundays_count = sundays_free_dec.length;
    const dec_sunday_status: V2PersonAuditSummary['dec_sunday_status'] = isTitular
      ? 'exento_4x4'
      : !hasDecHistoryFromStart
      ? 'pendiente_historial'
      : dec_free_sundays_count >= 2
      ? 'cumple'
      : 'incumple';

    const limit =
      typeof p.contractual_weekly_hours === 'number' && p.contractual_weekly_hours > 0
        ? Math.min(42, p.contractual_weekly_hours)
        : 42;
    const weekly_hours = weekStarts.map((ws) => {
      const wDays = eachDayOfInterval({ start: parseISO(ws), end: addDays(parseISO(ws), 6) }).map((d) =>
        format(d, 'yyyy-MM-dd')
      );
      const hours = wDays.reduce((s, d) => s + (hoursByDate.get(d) || 0), 0);
      return { week_start: ws, hours, limit, exceeds: hours > limit };
    });

    people.push({
      personnel_id: p.personnel_id,
      full_name: p.full_name || p.first_name || p.personnel_id,
      is_ns22_titular: isTitular,
      saturdays_worked,
      saturdays_free,
      sundays_worked_dec,
      sundays_free_dec,
      sundays_worked_jan,
      sundays_free_jan,
      dec_free_sundays_count,
      dec_sunday_status,
      weekly_hours,
    });
  }

  const applicable = people.filter((p) => !p.is_ns22_titular);
  const dec_compliant_count = applicable.filter((p) => p.dec_sunday_status === 'cumple').length;
  const dec_non_compliant = applicable.filter((p) => p.dec_sunday_status === 'incumple');
  const dec_pending = applicable.filter((p) => p.dec_sunday_status === 'pendiente_historial');

  return {
    people,
    dec_compliant_count,
    dec_applicable_count: applicable.length,
    dec_non_compliant,
    dec_pending,
  };
}

export type V2GridCellClickResolution =
  | { mode: 'operative_select' }
  | { mode: 'blocked_enable_edit' }
  | {
      mode: 'open_editor';
      action: 'add' | 'replace';
      areaId: string;
      positionId: string;
      shiftId: string;
    };

/**
 * Resuelve la acción de un clic en celda de la grilla:
 * en vista previa v2 abre el editor de propuesta (replace en turno existente o add en OFF)
 * sin activar la selección operativa.
 */
export function resolveV2GridCellClick(params: {
  isV2GridPreviewActive: boolean;
  isV2ProposalEditing: boolean;
  hasSavedDraft: boolean;
  previewV2?: EnginePreviewMetrics | null;
  personId: string;
  mainPositionId?: string | null;
  dateStr: string;
  positions: Array<{ id: string; area_id: string }>;
  areas: Array<{ id: string }>;
  shifts: Array<{ id: string }>;
}): V2GridCellClickResolution {
  if (!params.isV2GridPreviewActive || !params.previewV2) {
    return { mode: 'operative_select' };
  }
  if (!params.isV2ProposalEditing && !params.hasSavedDraft) {
    return { mode: 'blocked_enable_edit' };
  }
  const existing = (params.previewV2.assignments || []).find(
    (a) => a.personnel_id === params.personId && a.date === params.dateStr
  );
  const defaultPos = existing?.position_id || params.mainPositionId || params.positions[0]?.id || '';
  const defaultArea =
    existing?.area_id ||
    params.positions.find((p) => p.id === defaultPos)?.area_id ||
    params.areas[0]?.id ||
    '';
  const defaultShift = existing?.shift_id || params.shifts[0]?.id || '';
  return {
    mode: 'open_editor',
    action: existing ? 'replace' : 'add',
    areaId: defaultArea,
    positionId: defaultPos,
    shiftId: defaultShift,
  };
}
