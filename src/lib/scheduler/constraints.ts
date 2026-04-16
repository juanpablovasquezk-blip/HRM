/**
 * Hard Constraint Validators
 *
 * Enforces the rules from plan_maestro.md:
 * - Max 40 hours/week
 * - Minimum 2 days off per week
 * - Minimum 10 hours rest between shifts
 * - Birthday = day off
 * - Respect shift preferences (night/no night)
 */

import { differenceInHours, parseISO, isSameDay, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import type { ConstraintViolation, PersonnelAvailability, ShiftSlot } from './types';

const MAX_HOURS_PER_WEEK = 40;
const MIN_DAYS_OFF_PER_WEEK = 2;
const MIN_REST_HOURS = 10;

/**
 * Check if assigning this shift would exceed 40 hours/week
 */
export function checkMaxHoursPerWeek(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot,
  currentAssignments: Array<{ date: string; duration_hours: number }>
): ConstraintViolation | null {
  const slotDate = parseISO(shiftSlot.date);
  const weekStart = startOfWeek(slotDate, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(slotDate, { weekStartsOn: 1 });

  const weeklyHours = currentAssignments
    .filter((a) => {
      const d = parseISO(a.date);
      return d >= weekStart && d <= weekEnd;
    })
    .reduce((sum, a) => sum + a.duration_hours, 0);

  const projectedHours = weeklyHours + shiftSlot.shift_duration_hours;

  if (projectedHours > MAX_HOURS_PER_WEEK) {
    return {
      type: 'max_hours',
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `Would exceed ${MAX_HOURS_PER_WEEK}h/week (projected: ${projectedHours.toFixed(1)}h)`,
      severity: 'error',
    };
  }

  return null;
}

/**
 * Check if personnel has enough days off this week
 */
export function checkMinDaysOff(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot,
  currentAssignments: Array<{ date: string }>
): ConstraintViolation | null {
  const slotDate = parseISO(shiftSlot.date);
  const weekStart = startOfWeek(slotDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(slotDate, { weekStartsOn: 1 });

  const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const assignedDates = new Set(
    currentAssignments
      .filter((a) => {
        const d = parseISO(a.date);
        return d >= weekStart && d <= weekEnd;
      })
      .map((a) => a.date)
  );

  // Adding this day
  assignedDates.add(shiftSlot.date);

  const workingDays = assignedDates.size;
  const daysOff = daysInWeek.length - workingDays;

  if (daysOff < MIN_DAYS_OFF_PER_WEEK) {
    return {
      type: 'min_days_off',
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `Only ${daysOff} day(s) off this week (minimum: ${MIN_DAYS_OFF_PER_WEEK})`,
      severity: 'error',
    };
  }

  return null;
}

/**
 * Check minimum 10 hours rest between shifts
 */
export function checkMinRestBetweenShifts(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot,
  adjacentAssignments: Array<{ date: string; shift_end: string; shift_start: string }>
): ConstraintViolation | null {
  const slotDate = parseISO(shiftSlot.date);

  for (const adj of adjacentAssignments) {
    const adjDate = parseISO(adj.date);

    // Build full datetime for shift end and start
    const prevEnd = new Date(`${adj.date}T${adj.shift_end}`);
    const currentStart = new Date(`${shiftSlot.date}T${shiftSlot.shift_start}`);

    // Handle overnight: if end time is after midnight, it's next day
    if (adj.shift_end < adj.shift_start) {
      prevEnd.setDate(prevEnd.getDate() + 1);
    }

    const restHours = differenceInHours(currentStart, prevEnd);

    if (restHours >= 0 && restHours < MIN_REST_HOURS) {
      return {
        type: 'min_rest',
        personnel_id: personnel.personnel_id,
        date: shiftSlot.date,
        message: `Only ${restHours}h rest after previous shift (minimum: ${MIN_REST_HOURS}h)`,
        severity: 'error',
      };
    }

    // Also check if current shift ends too close to next shift start
    const currentEnd = new Date(`${shiftSlot.date}T${shiftSlot.shift_end}`);
    if (shiftSlot.shift_end < shiftSlot.shift_start) {
      currentEnd.setDate(currentEnd.getDate() + 1);
    }
    const nextStart = new Date(`${adj.date}T${adj.shift_start}`);
    const forwardRest = differenceInHours(nextStart, currentEnd);

    if (forwardRest >= 0 && forwardRest < MIN_REST_HOURS && adjDate > slotDate) {
      return {
        type: 'min_rest',
        personnel_id: personnel.personnel_id,
        date: shiftSlot.date,
        message: `Only ${forwardRest}h rest before next shift (minimum: ${MIN_REST_HOURS}h)`,
        severity: 'error',
      };
    }
  }

  return null;
}

/**
 * Check if date is personnel's birthday — birthday = day off
 */
export function checkBirthdayOff(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot
): ConstraintViolation | null {
  if (!personnel.birth_date) return null;

  const birthDate = parseISO(personnel.birth_date);
  const shiftDate = parseISO(shiftSlot.date);

  // Same month and day (regardless of year)
  if (
    birthDate.getMonth() === shiftDate.getMonth() &&
    birthDate.getDate() === shiftDate.getDate()
  ) {
    return {
      type: 'birthday',
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `Birthday — must have day off`,
      severity: 'error',
    };
  }

  return null;
}

/**
 * Check if personnel is working more than 7 consecutive days (Soft Constraint)
 */
export function checkMaxConsecutiveDays(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot,
  allAssignments: Array<{ date: string }>
): ConstraintViolation | null {
  const MAX_CONSECUTIVE = 7;
  const slotDate = parseISO(shiftSlot.date);
  
  // Combine current assignments with the new one
  const sortedDates = [...allAssignments.map(a => parseISO(a.date)), slotDate]
    .sort((a, b) => a.getTime() - b.getTime())
    .map(d => d.toISOString().split('T')[0]);

  // Find the streak for the current slot
  let streak = 1;
  const currentIdx = sortedDates.indexOf(shiftSlot.date);

  // Look back
  let checkDate = new Date(slotDate);
  while (true) {
    checkDate.setDate(checkDate.getDate() - 1);
    const dateStr = checkDate.toISOString().split('T')[0];
    if (sortedDates.includes(dateStr)) {
      streak++;
    } else {
      break;
    }
  }

  // Look forward
  checkDate = new Date(slotDate);
  while (true) {
    checkDate.setDate(checkDate.getDate() + 1);
    const dateStr = checkDate.toISOString().split('T')[0];
    if (sortedDates.includes(dateStr)) {
      streak++;
    } else {
      break;
    }
  }

  if (streak > MAX_CONSECUTIVE) {
    return {
      type: 'preference', // Using preference type for soft warning
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `Idealmente máximo ${MAX_CONSECUTIVE} días seguidos (actual: ${streak})`,
      severity: 'warning',
    };
  }

  return null;
}

/**
 * Check shift preferences (warning-level, not blocking)
 */
export function checkPreferences(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot
): ConstraintViolation | null {
  const startHour = parseInt(shiftSlot.shift_start.split(':')[0], 10);
  const isNightShift = startHour >= 20 || startHour < 6;

  if (isNightShift && personnel.avoids_night) {
    return {
      type: 'preference',
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `Prefers to avoid night shifts`,
      severity: 'warning',
    };
  }

  if (!isNightShift && personnel.prefers_night) {
    return {
      type: 'preference',
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `Prefers night shifts`,
      severity: 'warning',
    };
  }

  return null;
}

/**
 * Run all constraints and return violations
 */
export function validateAllConstraints(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot,
  currentAssignments: Array<{ date: string; duration_hours: number; shift_start: string; shift_end: string }>
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  const maxHours = checkMaxHoursPerWeek(personnel, shiftSlot, currentAssignments);
  if (maxHours) violations.push(maxHours);

  const daysOff = checkMinDaysOff(personnel, shiftSlot, currentAssignments);
  if (daysOff) violations.push(daysOff);

  const rest = checkMinRestBetweenShifts(personnel, shiftSlot, currentAssignments);
  if (rest) violations.push(rest);

  const birthday = checkBirthdayOff(personnel, shiftSlot);
  if (birthday) violations.push(birthday);

  const prefs = checkPreferences(personnel, shiftSlot);
  if (prefs) violations.push(prefs);

  const consecutive = checkMaxConsecutiveDays(personnel, shiftSlot, currentAssignments);
  if (consecutive) violations.push(consecutive);

  return violations;
}

/**
 * Check if there are any hard constraint violations (error severity)
 */
export function hasHardViolation(violations: ConstraintViolation[]): boolean {
  return violations.some((v) => v.severity === 'error');
}
