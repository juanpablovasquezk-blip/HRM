import {
  addDays,
  differenceInMinutes,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSunday,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
} from 'date-fns';
import { normalizeIsoDate } from './dotacion';
import type {
  JornadaViolation,
  LeaveCategory,
  PermissionRelocationCase,
  PersonnelScheduleProfile,
  RawLeaveRecord,
  ScheduledShiftInterval,
} from './types';

export const GENERAL_ORDINARY_WEEKLY_HOURS = 42;
export const MIN_REST_HOURS_BETWEEN_SHIFTS = 12;
export const MIN_DAYS_OFF_FIVE_DAY_WEEK = 2;
export const MIN_SUNDAYS_OFF_PER_MONTH = 2;
export const MAX_PREFERRED_CONSECUTIVE_DAYS = 7;

function normUpper(value?: string | null): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

export function isExclusiveItaloGuerra(
  person: Pick<PersonnelScheduleProfile, 'first_name' | 'full_name' | 'exclusive_shift_start'>
): boolean {
  if (person.exclusive_shift_start === '13:30') return true;
  const candidateNames = [person.full_name, person.first_name].filter(Boolean);
  for (const raw of candidateNames) {
    const n = normUpper(raw);
    if (n.includes('ITALO') && n.includes('GUERRA')) return true;
  }
  return false;
}

/**
 * Enforces personal schedule exclusivities in v2:
 * - Only Aeropuerto 4x4 titulares (NS22 only, handled via titular exclusion)
 *   and Ítalo Guerra (PM 13:30 only) have exclusive schedules.
 * - Legacy fixed_shift_id, prefers_night, avoids_night, and rotation_pattern
 *   do NOT block compatible assignments for any other worker.
 */
export function canPersonTakeShiftInterval(
  person: PersonnelScheduleProfile,
  shift: { shift_id?: string | null; shift_start?: string | null; shift_name?: string | null }
): boolean {
  if (isExclusiveItaloGuerra(person)) {
    const start = (shift.shift_start || '').slice(0, 5);
    const name = normUpper(shift.shift_name);
    if (start) return start === '13:30';
    if (name) return name.includes('13:30') || name.includes('PM 13');
    if (person.exclusive_shift_id && shift.shift_id) {
      return person.exclusive_shift_id === shift.shift_id;
    }
    return false;
  }
  if (person.exclusive_shift_start) {
    return (shift.shift_start || '').slice(0, 5) === person.exclusive_shift_start.slice(0, 5);
  }
  if (person.exclusive_shift_id && shift.shift_id) {
    return person.exclusive_shift_id === shift.shift_id;
  }
  return true;
}

/**
 * Identifies workers who have legacy indicators (has_special_contract or special rotation_pattern)
 * without an explicit confirmed_regime, so they can be reviewed rather than silently exempted.
 */
export function identifyUnconfirmedRegimeCases(
  personnelList: PersonnelScheduleProfile[]
): Array<{ personnel_id: string; first_name?: string; reason: string }> {
  const unconfirmed: Array<{ personnel_id: string; first_name?: string; reason: string }> = [];

  for (const p of personnelList) {
    if (p.confirmed_regime && p.confirmed_regime.exemption_type !== 'none') continue;
    const pattern = normUpper(p.rotation_pattern);
    const posName = normUpper(p.main_position_name);
    const flags: string[] = [];

    if (p.has_special_contract) flags.push('has_special_contract=true');
    if (pattern.includes('4X4')) flags.push(`rotation_pattern=${p.rotation_pattern}`);
    if (pattern.includes('7X7')) flags.push(`rotation_pattern=${p.rotation_pattern}`);
    if (pattern.includes('BLUE_')) flags.push(`rotation_pattern=${p.rotation_pattern}`);
    if (posName.includes('CANES')) flags.push(`cargo=${p.main_position_name}`);

    if (flags.length > 0) {
      unconfirmed.push({
        personnel_id: p.personnel_id,
        first_name: p.first_name,
        reason: `Sin régimen confirmado (${flags.join(', ')}); se aplican reglas generales hasta confirmación.`,
      });
    }
  }

  return unconfirmed;
}

/**
 * Returns the applicable weekly ordinary hours limit for a worker:
 * 42h general ordinary limit, or contractual limit if lower.
 */
export function getApplicableWeeklyHoursLimit(
  personnel: PersonnelScheduleProfile
): number {
  const contractual = personnel.contractual_weekly_hours;
  if (
    typeof contractual === 'number' &&
    contractual > 0 &&
    contractual < GENERAL_ORDINARY_WEEKLY_HOURS
  ) {
    return contractual;
  }
  return GENERAL_ORDINARY_WEEKLY_HOURS;
}

const shiftRangeCache = new Map<string, { startMs: number; endMs: number }>();
const shiftOccupiedCache = new Map<string, string[]>();
const shiftWeekSplitCache = new Map<string, Map<string, number>>();

/**
 * Parses a date (YYYY-MM-DD) + time (HH:MM or HH:MM:SS) into local Date timestamps,
 * adding 1 day to end when endTime <= startTime (overnight / crossing midnight).
 */
export function buildShiftDateTimeRange(
  dateStr: string,
  shiftStart: string,
  shiftEnd: string
): { start: Date; end: Date } {
  const normalizedDate = normalizeIsoDate(dateStr);
  const startTime = (shiftStart || '00:00').slice(0, 5);
  const endTime = (shiftEnd || '00:00').slice(0, 5);
  const key = `${normalizedDate}|${startTime}|${endTime}`;
  const cached = shiftRangeCache.get(key);
  if (cached) {
    return { start: new Date(cached.startMs), end: new Date(cached.endMs) };
  }

  const start = parseISO(`${normalizedDate}T${startTime}:00`);
  let end = parseISO(`${normalizedDate}T${endTime}:00`);

  if (endTime <= startTime) {
    end = addDays(end, 1);
  }

  if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
    if (shiftRangeCache.size > 5000) shiftRangeCache.clear();
    shiftRangeCache.set(key, { startMs: start.getTime(), endMs: end.getTime() });
  }

  return { start, end };
}

/**
 * Returns all calendar dates (YYYY-MM-DD) with actual work for a shift interval [start, end).
 * A shift ending strictly after 00:00 on the following day (e.g. 22:00 -> 07:00)
 * occupies both the entry day and the outgoing day. A shift ending at 00:00 sharp
 * does not occupy the following day.
 */
export function getShiftOccupiedDates(shift: ScheduledShiftInterval): string[] {
  const key = `${normalizeIsoDate(shift.date)}|${(shift.shift_start || '00:00').slice(0, 5)}|${(shift.shift_end || '00:00').slice(0, 5)}`;
  const cached = shiftOccupiedCache.get(key);
  if (cached) return cached;

  const { start, end } = buildShiftDateTimeRange(
    shift.date,
    shift.shift_start,
    shift.shift_end
  );
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];

  const dates: string[] = [];
  let cursor = startOfDay(start);
  const lastDay = startOfDay(end);

  while (cursor <= lastDay) {
    // Only include lastDay if the shift actually extends past 00:00 on that day
    if (cursor.getTime() === lastDay.getTime() && end.getTime() === lastDay.getTime()) {
      break;
    }
    dates.push(format(cursor, 'yyyy-MM-dd'));
    cursor = addDays(cursor, 1);
  }

  if (shiftOccupiedCache.size > 5000) shiftOccupiedCache.clear();
  shiftOccupiedCache.set(key, dates);
  return dates;
}

/**
 * Imputes a shift's duration_hours across Monday-Sunday calendar weeks
 * proportionally to the actual minutes of [start, end) falling in each week.
 *
 * Criterion for cross-week ordinary shifts (e.g. Sunday 22:00 -> Monday 07:00):
 * - Overlap minutes in each [weekStart 00:00, nextWeekStart 00:00) window determine
 *   the fraction of `duration_hours` imputed to that week.
 */
export function splitShiftHoursByWeek(
  shift: ScheduledShiftInterval
): Map<string, number> {
  const totalDuration = Number(shift.duration_hours) || 0;
  const cacheKey = `${normalizeIsoDate(shift.date)}|${(shift.shift_start || '00:00').slice(0, 5)}|${(shift.shift_end || '00:00').slice(0, 5)}|${totalDuration}`;
  const cached = shiftWeekSplitCache.get(cacheKey);
  if (cached) return cached;

  const { start, end } = buildShiftDateTimeRange(
    shift.date,
    shift.shift_start,
    shift.shift_end
  );
  const byWeek = new Map<string, number>();
  const totalSpanMinutes = differenceInMinutes(end, start);

  if (totalSpanMinutes <= 0 || totalDuration <= 0) {
    return byWeek;
  }

  let weekCursor = startOfWeek(start, { weekStartsOn: 1 });
  const endWeek = startOfWeek(end, { weekStartsOn: 1 });

  while (weekCursor <= endWeek) {
    const nextWeek = addDays(weekCursor, 7);
    const overlapStart = start > weekCursor ? start : weekCursor;
    const overlapEnd = end < nextWeek ? end : nextWeek;
    const overlapMinutes = differenceInMinutes(overlapEnd, overlapStart);

    if (overlapMinutes > 0) {
      const weekKey = format(weekCursor, 'yyyy-MM-dd');
      const imputedHours = (totalDuration * overlapMinutes) / totalSpanMinutes;
      byWeek.set(weekKey, (byWeek.get(weekKey) || 0) + imputedHours);
    }

    weekCursor = nextWeek;
  }

  if (shiftWeekSplitCache.size > 5000) shiftWeekSplitCache.clear();
  shiftWeekSplitCache.set(cacheKey, byWeek);
  return byWeek;
}

export function isBirthdayOnDate(
  birthDateStr: string | null | undefined,
  dateStr: string
): boolean {
  if (!birthDateStr || !dateStr) return false;
  const birthNorm = normalizeIsoDate(birthDateStr);
  const dateNorm = normalizeIsoDate(dateStr);
  if (birthNorm.length < 10 || dateNorm.length < 10) return false;
  return birthNorm.slice(5, 10) === dateNorm.slice(5, 10);
}

export function synthesizeBirthdayLeavesForRange(
  personnel: PersonnelScheduleProfile,
  startDate: string,
  endDate: string
): RawLeaveRecord[] {
  if (!personnel.birth_date || !startDate || !endDate) return [];
  const birthNorm = normalizeIsoDate(personnel.birth_date);
  const normStart = normalizeIsoDate(startDate);
  const normEnd = normalizeIsoDate(endDate);
  if (birthNorm.length < 10 || normStart.length < 10 || normEnd.length < 10 || normStart > normEnd) {
    return [];
  }

  const mmDd = birthNorm.slice(5, 10);
  const startYear = Number(normStart.slice(0, 4));
  const endYear = Number(normEnd.slice(0, 4));
  if (isNaN(startYear) || isNaN(endYear)) return [];

  const out: RawLeaveRecord[] = [];
  for (let year = startYear; year <= endYear; year++) {
    const candidate = `${year}-${mmDd}`;
    if (candidate >= normStart && candidate <= normEnd) {
      const parsed = parseISO(candidate);
      if (!isNaN(parsed.getTime()) && format(parsed, 'yyyy-MM-dd') === candidate) {
        out.push({
          id: `birthday-${personnel.personnel_id}-${candidate}`,
          personnel_id: personnel.personnel_id,
          type: 'birthday',
          start_date: candidate,
          end_date: candidate,
          status: 'approved',
          reason: 'Cumpleaños (día libre obligatorio)',
        });
      }
    }
  }
  return out;
}

/**
 * Classifies an approved leave:
 * - monthly_free_choice: Solicitud mensual de días libres (free_request or other with matching reason)
 * - birthday: Cumpleaños obligatorio del trabajador
 * - generic_personal: Permiso personal/administrativo genérico (type === 'personal')
 * - medical_or_vacation: Licencia médica, vacaciones o fuero maternal
 * - other_absence: Otros permisos
 */
export function classifyLeave(leave: RawLeaveRecord): LeaveCategory {
  const type = (leave.type || '').trim().toLowerCase();
  const reason = normUpper(leave.reason);

  if (type === 'birthday') {
    return 'birthday';
  }
  if (type === 'sick' || type === 'vacation' || type === 'maternity') {
    return 'medical_or_vacation';
  }
  if (
    type === 'free_request' ||
    (type === 'other' && reason.includes('SOLICITUD MENSUAL DE DIAS LIBRES'))
  ) {
    return 'monthly_free_choice';
  }
  if (type === 'personal') {
    return 'generic_personal';
  }
  return 'other_absence';
}

type ExpandedLeavesResult = {
  allLeaveDates: Set<string>;
  monthlyFreeChoiceDates: Set<string>;
  birthdayDates: Set<string>;
  genericPersonalDates: Set<string>;
  medicalOrVacationDates: Set<string>;
  leaveByDate: Map<string, RawLeaveRecord>;
};

const expandedLeavesCache = new WeakMap<
  RawLeaveRecord[],
  { length: number; byPerson: Map<string, ExpandedLeavesResult> }
>();

export function expandApprovedLeaves(
  leaves: RawLeaveRecord[],
  personnelId: string
): ExpandedLeavesResult {
  let cachedEntry = expandedLeavesCache.get(leaves);
  if (!cachedEntry || cachedEntry.length !== leaves.length) {
    cachedEntry = { length: leaves.length, byPerson: new Map() };
    expandedLeavesCache.set(leaves, cachedEntry);
  }
  const hit = cachedEntry.byPerson.get(personnelId);
  if (hit) return hit;

  const allLeaveDates = new Set<string>();
  const monthlyFreeChoiceDates = new Set<string>();
  const birthdayDates = new Set<string>();
  const genericPersonalDates = new Set<string>();
  const medicalOrVacationDates = new Set<string>();
  const leaveByDate = new Map<string, RawLeaveRecord>();

  for (const leave of leaves) {
    if (leave.personnel_id !== personnelId) continue;
    if (leave.status !== 'approved') continue;

    const start = parseISO(normalizeIsoDate(leave.start_date));
    const end = parseISO(normalizeIsoDate(leave.end_date));
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) continue;

    const category = classifyLeave(leave);
    for (const day of eachDayOfInterval({ start, end })) {
      const dStr = format(day, 'yyyy-MM-dd');
      allLeaveDates.add(dStr);
      if (category === 'monthly_free_choice') {
        monthlyFreeChoiceDates.add(dStr);
      } else if (category === 'birthday') {
        birthdayDates.add(dStr);
      } else if (category === 'generic_personal') {
        genericPersonalDates.add(dStr);
      } else if (category === 'medical_or_vacation') {
        medicalOrVacationDates.add(dStr);
      }
      if (!leaveByDate.has(dStr) || category === 'medical_or_vacation') {
        leaveByDate.set(dStr, leave);
      }
    }
  }

  const result: ExpandedLeavesResult = {
    allLeaveDates,
    monthlyFreeChoiceDates,
    birthdayDates,
    genericPersonalDates,
    medicalOrVacationDates,
    leaveByDate,
  };
  cachedEntry.byPerson.set(personnelId, result);
  return result;
}

/**
 * Checks weekly ordinary hours limit across all Monday-Sunday weeks touched
 * by the shift's real interval [start, end).
 */
export function checkWeeklyHoursLimit(
  personnel: PersonnelScheduleProfile,
  candidate: ScheduledShiftInterval,
  existingShifts: ScheduledShiftInterval[]
): JornadaViolation | null {
  if (personnel.confirmed_regime?.exempt_weekly_hours_limit) return null;

  const limit = getApplicableWeeklyHoursLimit(personnel);
  const existingByWeek = new Map<string, number>();

  for (const s of existingShifts) {
    for (const [wk, hrs] of splitShiftHoursByWeek(s).entries()) {
      existingByWeek.set(wk, (existingByWeek.get(wk) || 0) + hrs);
    }
  }

  for (const [wk, candHrs] of splitShiftHoursByWeek(candidate).entries()) {
    const projected = (existingByWeek.get(wk) || 0) + candHrs;
    if (projected > limit + 1e-6) {
      return {
        type: 'max_hours',
        severity: 'error',
        personnel_id: personnel.personnel_id,
        date: normalizeIsoDate(candidate.date),
        message: `Excede el tope semanal de ${limit}h ordinarias en semana ${wk} (proyectado: ${projected.toFixed(1)}h).`,
      };
    }
  }

  return null;
}

/**
 * Checks minimum rest between actual shift end (including overnight shifts)
 * and next shift start (>= 12h or stricter contractual minimum).
 */
export function checkMinRestBetweenShifts(
  personnel: PersonnelScheduleProfile,
  candidate: ScheduledShiftInterval,
  existingShifts: ScheduledShiftInterval[]
): JornadaViolation | null {
  const minRestHours = Math.max(
    MIN_REST_HOURS_BETWEEN_SHIFTS,
    Number(personnel.min_rest_hours) || 0
  );
  const minRestMinutes = minRestHours * 60;
  const candRange = buildShiftDateTimeRange(
    candidate.date,
    candidate.shift_start,
    candidate.shift_end
  );
  const candDateStr = normalizeIsoDate(candidate.date);

  for (const existing of existingShifts) {
    const existRange = buildShiftDateTimeRange(
      existing.date,
      existing.shift_start,
      existing.shift_end
    );

    if (candRange.start < existRange.end && existRange.start < candRange.end) {
      return {
        type: 'min_rest',
        severity: 'error',
        personnel_id: personnel.personnel_id,
        date: candDateStr,
        message: `Solapamiento horario con turno existente el ${normalizeIsoDate(existing.date)}.`,
      };
    }

    if (existRange.end <= candRange.start) {
      const restMinutes = differenceInMinutes(candRange.start, existRange.end);
      if (restMinutes < minRestMinutes) {
        return {
          type: 'min_rest',
          severity: 'error',
          personnel_id: personnel.personnel_id,
          date: candDateStr,
          message: `Descanso insuficiente: ${(restMinutes / 60).toFixed(1)}h desde salida real (mínimo: ${minRestHours}h).`,
        };
      }
    }

    if (candRange.end <= existRange.start) {
      const restMinutes = differenceInMinutes(existRange.start, candRange.end);
      if (restMinutes < minRestMinutes) {
        return {
          type: 'min_rest',
          severity: 'error',
          personnel_id: personnel.personnel_id,
          date: candDateStr,
          message: `Descanso insuficiente: ${(restMinutes / 60).toFixed(1)}h antes del siguiente turno (mínimo: ${minRestHours}h).`,
        };
      }
    }
  }

  return null;
}

function collectOccupiedDatesSet(shifts: ScheduledShiftInterval[]): Set<string> {
  const set = new Set<string>();
  for (const s of shifts) {
    for (const d of getShiftOccupiedDates(s)) {
      set.add(d);
    }
  }
  return set;
}

/**
 * Checks 2 days off Monday-Sunday for every week touched by the shift's occupied dates.
 */
export function checkWeeklyDaysOff(
  personnel: PersonnelScheduleProfile,
  candidate: ScheduledShiftInterval,
  occupiedDates: Set<string>
): JornadaViolation | null {
  if (personnel.confirmed_regime?.exempt_five_day_week) return null;

  const candOccupied = getShiftOccupiedDates(candidate);
  const combined = new Set(occupiedDates);
  for (const d of candOccupied) combined.add(d);

  const checkedWeeks = new Set<string>();
  for (const occDate of candOccupied) {
    const weekStart = startOfWeek(parseISO(occDate), { weekStartsOn: 1 });
    const weekKey = format(weekStart, 'yyyy-MM-dd');
    if (checkedWeeks.has(weekKey)) continue;
    checkedWeeks.add(weekKey);

    const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
    let workingDays = 0;
    for (const d of weekDays) {
      if (combined.has(format(d, 'yyyy-MM-dd'))) workingDays++;
    }

    const daysOff = weekDays.length - workingDays;
    if (daysOff < MIN_DAYS_OFF_FIVE_DAY_WEEK) {
      return {
        type: 'min_days_off',
        severity: 'error',
        personnel_id: personnel.personnel_id,
        date: normalizeIsoDate(candidate.date),
        message: `Solo quedarían ${daysOff} día(s) libre(s) en la semana ${weekKey} (mínimo: ${MIN_DAYS_OFF_FIVE_DAY_WEEK}).`,
      };
    }
  }

  return null;
}

/**
 * Checks 2 Sundays off per calendar month across all calendar days/months
 * occupied by the shift's real interval (e.g. Saturday 22:00 -> Sunday 07:00 occupies Sunday).
 */
export function checkMonthlySundaysOff(
  personnel: PersonnelScheduleProfile,
  candidate: ScheduledShiftInterval,
  occupiedDates: Set<string>
): JornadaViolation | null {
  if (personnel.confirmed_regime?.exempt_monthly_sundays) return null;

  const candOccupied = getShiftOccupiedDates(candidate);
  const combined = new Set(occupiedDates);
  for (const d of candOccupied) combined.add(d);

  const checkedMonths = new Set<string>();

  for (const occDate of candOccupied) {
    const d = parseISO(occDate);
    if (!isSunday(d)) continue;

    const monthKey = format(d, 'yyyy-MM');
    if (checkedMonths.has(monthKey)) continue;
    checkedMonths.add(monthKey);

    const mStart = startOfMonth(d);
    const mEnd = endOfMonth(d);
    const sundaysInMonth = eachDayOfInterval({ start: mStart, end: mEnd }).filter((s) =>
      isSunday(s)
    );

    let workingSundays = 0;
    for (const sun of sundaysInMonth) {
      if (combined.has(format(sun, 'yyyy-MM-dd'))) {
        workingSundays++;
      }
    }

    const maxAllowedWorkingSundays = Math.max(
      0,
      sundaysInMonth.length - MIN_SUNDAYS_OFF_PER_MONTH
    );
    if (workingSundays > maxAllowedWorkingSundays) {
      return {
        type: 'sundays_off',
        severity: 'error',
        personnel_id: personnel.personnel_id,
        date: normalizeIsoDate(candidate.date),
        message: `Debe reservar al menos ${MIN_SUNDAYS_OFF_PER_MONTH} domingos libres en ${monthKey} (${workingSundays}/${sundaysInMonth.length} domingos con trabajo).`,
      };
    }
  }

  return null;
}

/**
 * Evaluates consecutive working days across week and month boundaries
 * using real occupied dates. Treated as preference (warning) subject to
 * stricter mandatory limits.
 */
export function evaluateConsecutiveDaysStreak(
  personnel: PersonnelScheduleProfile,
  candidate: ScheduledShiftInterval,
  occupiedDates: Set<string>
): { maxStreak: number; violation: JornadaViolation | null } {
  const candOccupied = getShiftOccupiedDates(candidate);
  const combined = new Set(occupiedDates);
  for (const d of candOccupied) combined.add(d);

  let maxStreak = 0;

  for (const occDate of candOccupied) {
    const base = parseISO(occDate);
    let streak = 1;

    let cursor = subDays(base, 1);
    while (combined.has(format(cursor, 'yyyy-MM-dd'))) {
      streak++;
      cursor = subDays(cursor, 1);
    }

    cursor = addDays(base, 1);
    while (combined.has(format(cursor, 'yyyy-MM-dd'))) {
      streak++;
      cursor = addDays(cursor, 1);
    }

    if (streak > maxStreak) maxStreak = streak;
  }

  if (maxStreak > MAX_PREFERRED_CONSECUTIVE_DAYS) {
    return {
      maxStreak,
      violation: {
        type: 'consecutive_days',
        severity: 'warning',
        personnel_id: personnel.personnel_id,
        date: normalizeIsoDate(candidate.date),
        message: `Racha continua de ${maxStreak} días (preferencia: máximo ${MAX_PREFERRED_CONSECUTIVE_DAYS} días corridos).`,
      },
    };
  }

  return { maxStreak, violation: null };
}

/**
 * Evaluates whether assigning candidate leaves non-consecutive rest days
 * in any touched Monday-Sunday week (preference warning when avoidable).
 */
export function evaluateConsecutiveRestPreference(
  personnel: PersonnelScheduleProfile,
  candidate: ScheduledShiftInterval,
  occupiedDates: Set<string>
): JornadaViolation | null {
  if (personnel.confirmed_regime?.exempt_five_day_week) return null;

  const candOccupied = getShiftOccupiedDates(candidate);
  const combined = new Set(occupiedDates);
  for (const d of candOccupied) combined.add(d);

  const checkedWeeks = new Set<string>();
  for (const occDate of candOccupied) {
    const weekStart = startOfWeek(parseISO(occDate), { weekStartsOn: 1 });
    const weekKey = format(weekStart, 'yyyy-MM-dd');
    if (checkedWeeks.has(weekKey)) continue;
    checkedWeeks.add(weekKey);

    const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
    const freeIndices: number[] = [];
    weekDays.forEach((d, idx) => {
      if (!combined.has(format(d, 'yyyy-MM-dd'))) {
        freeIndices.push(idx);
      }
    });

    if (freeIndices.length === 2 && freeIndices[1] - freeIndices[0] > 1) {
      return {
        type: 'non_consecutive_rest',
        severity: 'warning',
        personnel_id: personnel.personnel_id,
        date: normalizeIsoDate(candidate.date),
        message: `Descansos semanales separados en semana ${weekKey} (preferir días libres consecutivos).`,
      };
    }
  }

  return null;
}

/**
 * Full ROSTER-03 validation for assigning a shift interval to a worker,
 * checking all calendar days, weeks, and months occupied by [start, end).
 */
export function validateJornadaConstraints(
  personnel: PersonnelScheduleProfile,
  candidate: ScheduledShiftInterval,
  existingShifts: ScheduledShiftInterval[],
  approvedLeaves: RawLeaveRecord[] = []
): JornadaViolation[] {
  const violations: JornadaViolation[] = [];
  const candOccupied = getShiftOccupiedDates(candidate);
  const { allLeaveDates, leaveByDate } = expandApprovedLeaves(
    approvedLeaves,
    personnel.personnel_id
  );

  for (const occDate of candOccupied) {
    if (allLeaveDates.has(occDate)) {
      const leave = leaveByDate.get(occDate);
      violations.push({
        type: 'leave_conflict',
        severity: 'error',
        personnel_id: personnel.personnel_id,
        date: occDate,
        message: `El intervalo del turno invade ausencia aprobada el ${occDate} (${leave?.type || 'ausencia'}).`,
      });
    } else if (isBirthdayOnDate(personnel.birth_date, occDate)) {
      violations.push({
        type: 'leave_conflict',
        severity: 'error',
        personnel_id: personnel.personnel_id,
        date: occDate,
        message: `El intervalo del turno invade el cumpleaños obligatorio el ${occDate} (día libre).`,
      });
    }
  }

  const occupiedDates = collectOccupiedDatesSet(existingShifts);

  const hoursV = checkWeeklyHoursLimit(personnel, candidate, existingShifts);
  if (hoursV) violations.push(hoursV);

  const restV = checkMinRestBetweenShifts(personnel, candidate, existingShifts);
  if (restV) violations.push(restV);

  const daysOffV = checkWeeklyDaysOff(personnel, candidate, occupiedDates);
  if (daysOffV) violations.push(daysOffV);

  const sundayV = checkMonthlySundaysOff(personnel, candidate, occupiedDates);
  if (sundayV) violations.push(sundayV);

  const streakResult = evaluateConsecutiveDaysStreak(personnel, candidate, occupiedDates);
  if (streakResult.violation) violations.push(streakResult.violation);

  const restPrefV = evaluateConsecutiveRestPreference(personnel, candidate, occupiedDates);
  if (restPrefV) violations.push(restPrefV);

  return violations;
}

export function hasMandatoryJornadaViolation(violations: JornadaViolation[]): boolean {
  return violations.some((v) => v.severity === 'error');
}

/**
 * Evaluates approved permissions in a Monday-Sunday week:
 * - Distinguishes monthly free-choice requests from generic personal permissions.
 * - Uses the operator's real base calendar (`baseCalendarDates`) to determine if a shift is displaced.
 * - Evaluates real `compatibleSlots` directly (without synthetic 08:00-16:00 assumptions).
 * - Reserves `relocated` exclusively for assignments confirmed by the generator in
 *   `confirmedRosterAssignments`; otherwise reports `proposed_relocation`.
 */
export function evaluatePermissionsForWeek(params: {
  personnel: PersonnelScheduleProfile;
  weekStartStr: string;
  baseCalendarDates?: Set<string> | null;
  compatibleSlots?: ScheduledShiftInterval[] | null;
  existingShifts: ScheduledShiftInterval[];
  confirmedRosterAssignments?: ScheduledShiftInterval[] | null;
  approvedLeaves: RawLeaveRecord[];
}): PermissionRelocationCase[] {
  const {
    personnel,
    weekStartStr,
    baseCalendarDates,
    compatibleSlots,
    existingShifts,
    confirmedRosterAssignments,
    approvedLeaves,
  } = params;

  const weekStart = startOfWeek(parseISO(normalizeIsoDate(weekStartStr)), { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
  const weekDayStrings = weekDays.map((wd) => format(wd, 'yyyy-MM-dd'));
  const syntheticBirthdays = synthesizeBirthdayLeavesForRange(
    personnel,
    weekDayStrings[0],
    weekDayStrings[weekDayStrings.length - 1]
  );
  const existingKeys = new Set(
    approvedLeaves.map(
      (l) => `${l.personnel_id}|${normalizeIsoDate(l.start_date)}|${(l.type || '').toLowerCase()}`
    )
  );
  const mergedLeaves = [
    ...approvedLeaves,
    ...syntheticBirthdays.filter(
      (b) => !existingKeys.has(`${b.personnel_id}|${normalizeIsoDate(b.start_date)}|birthday`)
    ),
  ];

  const { monthlyFreeChoiceDates, birthdayDates, genericPersonalDates, leaveByDate } =
    expandApprovedLeaves(mergedLeaves, personnel.personnel_id);

  const simulatedShifts = [...existingShifts];
  const consumedSlotKeys = new Set<string>();
  const results: PermissionRelocationCase[] = [];

  const matchesSlot = (a: ScheduledShiftInterval, b: ScheduledShiftInterval): boolean => {
    if (normalizeIsoDate(a.date) !== normalizeIsoDate(b.date)) return false;
    if (a.slot_key && b.slot_key) return a.slot_key === b.slot_key;
    return (
      (a.shift_start || '').slice(0, 5) === (b.shift_start || '').slice(0, 5) &&
      (a.shift_end || '').slice(0, 5) === (b.shift_end || '').slice(0, 5) &&
      (a.shift_id ?? '') === (b.shift_id ?? '')
    );
  };

  for (const day of weekDays) {
    const dStr = format(day, 'yyyy-MM-dd');
    const leave = leaveByDate.get(dStr);

    if (genericPersonalDates.has(dStr)) {
      results.push({
        personnel_id: personnel.personnel_id,
        permission_date: dStr,
        leave_type: leave?.type || 'personal',
        leave_category: 'generic_personal',
        reason: leave?.reason ?? null,
        status: 'generic_personal_no_relocation',
        reason_code: 'generic_personal',
        respected_permission: true,
        requires_relocation: false,
        relocated_to: null,
        message: `Permiso personal genérico el ${dStr} respetado; no corresponde a solicitud mensual de libre elección ni reubica descanso.`,
      });
      continue;
    }

    const isBirthday = birthdayDates.has(dStr);
    const isMonthlyFree = monthlyFreeChoiceDates.has(dStr);
    if (!isMonthlyFree && !isBirthday) continue;

    const category: LeaveCategory = isBirthday ? 'birthday' : 'monthly_free_choice';
    const leaveType = isBirthday ? 'birthday' : leave?.type || 'other';
    const subject = isBirthday ? 'Cumpleaños' : 'Solicitud mensual de libre elección';
    const subjectShort = isBirthday ? 'Cumpleaños' : 'Solicitud mensual';

    if (!baseCalendarDates) {
      results.push({
        personnel_id: personnel.personnel_id,
        permission_date: dStr,
        leave_type: leaveType,
        leave_category: category,
        reason: leave?.reason ?? (isBirthday ? 'Cumpleaños (día libre obligatorio)' : null),
        status: 'pending_relocation',
        reason_code: 'missing_base_calendar',
        respected_permission: true,
        requires_relocation: true,
        relocated_to: null,
        message: `${subject} el ${dStr} respetado; reubicación pendiente por falta de calendario base real del operador.`,
      });
      continue;
    }

    if (!baseCalendarDates.has(dStr)) {
      results.push({
        personnel_id: personnel.personnel_id,
        permission_date: dStr,
        leave_type: leaveType,
        leave_category: category,
        reason: leave?.reason ?? (isBirthday ? 'Cumpleaños (día libre obligatorio)' : null),
        status: 'on_free_day',
        respected_permission: true,
        requires_relocation: false,
        relocated_to: null,
        message: `${subject} el ${dStr} coincide con día libre del calendario base; no hay turno que mover.`,
      });
      continue;
    }

    // Displaces a working shift in the base calendar: evaluate real compatible slots directly
    const candidateSlots = (compatibleSlots || []).filter((slot) => {
      const slotDate = normalizeIsoDate(slot.date);
      const slotId =
        slot.slot_key ||
        `${slotDate}|${(slot.shift_start || '').slice(0, 5)}|${slot.shift_id ?? ''}`;
      if (consumedSlotKeys.has(slotId)) return false;
      return weekDayStrings.includes(slotDate) && slotDate !== dStr;
    });

    if (candidateSlots.length === 0) {
      results.push({
        personnel_id: personnel.personnel_id,
        permission_date: dStr,
        leave_type: leaveType,
        leave_category: category,
        reason: leave?.reason ?? (isBirthday ? 'Cumpleaños (día libre obligatorio)' : null),
        status: 'pending_relocation',
        reason_code: 'no_compatible_slot',
        respected_permission: true,
        requires_relocation: true,
        relocated_to: null,
        message: `${subjectShort} el ${dStr} respetado; quedó pendiente la reubicación porque no hay cupos reales compatibles en la semana.`,
      });
      continue;
    }

    const validSlots: Array<{ slot: ScheduledShiftInterval; warningCount: number }> = [];
    const blockingReasons: string[] = [];

    for (const slot of candidateSlots) {
      const violations = validateJornadaConstraints(
        personnel,
        slot,
        simulatedShifts,
        mergedLeaves
      );
      if (hasMandatoryJornadaViolation(violations)) {
        const errors = violations
          .filter((v) => v.severity === 'error')
          .map((v) => `${normalizeIsoDate(slot.date)} (${(slot.shift_start || '').slice(0, 5)}): ${v.message}`);
        blockingReasons.push(...errors);
        continue;
      }
      const warningCount = violations.filter((v) => v.severity === 'warning').length;
      validSlots.push({ slot, warningCount });
    }

    if (validSlots.length === 0) {
      results.push({
        personnel_id: personnel.personnel_id,
        permission_date: dStr,
        leave_type: leaveType,
        leave_category: category,
        reason: leave?.reason ?? (isBirthday ? 'Cumpleaños (día libre obligatorio)' : null),
        status: 'unrelocatable',
        reason_code: 'jornada_blocked',
        respected_permission: true,
        requires_relocation: true,
        relocated_to: null,
        blocking_reasons: blockingReasons,
        message: `${subjectShort} el ${dStr} respetado sin reubicación viable (pendiente); todos los cupos incumplen restricciones obligatorias (${blockingReasons.join(' | ')}).`,
      });
      continue;
    }

    validSlots.sort((a, b) => a.warningCount - b.warningCount);

    // Check if the generator confirmed one of the valid compatible slots in the resulting roster
    const confirmedMatch = (confirmedRosterAssignments || []).find((confirmed) =>
      validSlots.some((v) => matchesSlot(v.slot, confirmed))
    );

    if (confirmedMatch) {
      const matchedValid = validSlots.find((v) => matchesSlot(v.slot, confirmedMatch))!.slot;
      simulatedShifts.push(matchedValid);
      const matchedId =
        matchedValid.slot_key ||
        `${normalizeIsoDate(matchedValid.date)}|${(matchedValid.shift_start || '').slice(0, 5)}|${matchedValid.shift_id ?? ''}`;
      consumedSlotKeys.add(matchedId);
      const targetDate = normalizeIsoDate(matchedValid.date);
      results.push({
        personnel_id: personnel.personnel_id,
        permission_date: dStr,
        leave_type: leaveType,
        leave_category: category,
        reason: leave?.reason ?? (isBirthday ? 'Cumpleaños (día libre obligatorio)' : null),
        status: 'relocated',
        respected_permission: true,
        requires_relocation: true,
        relocated_to: targetDate,
        relocated_slot_key: matchedValid.slot_key ?? null,
        assigned_shift: matchedValid,
        message: `${subjectShort} el ${dStr} respetado; turno reubicado y confirmado en el roster del ${targetDate}.`,
      });
    } else {
      const proposed = validSlots[0].slot;
      const proposedDate = normalizeIsoDate(proposed.date);
      results.push({
        personnel_id: personnel.personnel_id,
        permission_date: dStr,
        leave_type: leaveType,
        leave_category: category,
        reason: leave?.reason ?? (isBirthday ? 'Cumpleaños (día libre obligatorio)' : null),
        status: 'proposed_relocation',
        reason_code: 'proposed_unconfirmed',
        respected_permission: true,
        requires_relocation: true,
        relocated_to: null,
        relocated_slot_key: proposed.slot_key ?? null,
        proposed_slot: proposed,
        message: `Solicitud mensual el ${dStr} respetada; cupo propuesto en ${proposedDate} (${(proposed.shift_start || '').slice(0, 5)}), pendiente de confirmación del generador.`,
      });
    }
  }

  return results;
}
