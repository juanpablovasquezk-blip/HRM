/**
 * Candidate Ranking System
 *
 * Scores candidates for shift assignment based on multiple factors:
 * 1. Availability (is the person free?)
 * 2. Preference match (night/day preference)
 * 3. Hours balance (fewer hours = higher priority for fairness)
 * 4. Position match (primary vs secondary position)
 * 5. Historical fairness (equitable distribution)
 */

import type { CandidateScore, PersonnelAvailability, ShiftSlot } from './types';

import { parseISO, addDays, format, startOfWeek } from 'date-fns';

const WEIGHTS = {
  availability: 0.15,
  preference: 0.10,
  hours_balance: 0.25,
  position_match: 0.25,
  area_match: 0.10,
  fairness: 0.10,
  grouping: 0.05,
};

/**
 * Score a single candidate for a given shift slot
 */
export function scoreCandidate(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot,
  maxWeeklyHours: number, // Max hours among all candidates this week
  avgAssignmentCount: number, // Average assignment count for fairness
  personnelAssignments: Array<{ date: string; shift_start: string; shift_name?: string }> = []
): CandidateScore {
  const availability = scoreAvailability(personnel, shiftSlot);
  const preference = scorePreference(personnel, shiftSlot);
  const hoursBalance = scoreHoursBalance(personnel, maxWeeklyHours);
  const positionMatch = scorePositionMatch(personnel, shiftSlot);
  const areaMatch = scoreAreaMatch(personnel, shiftSlot);
  const fairness = scoreFairness(personnel, avgAssignmentCount, shiftSlot.date, personnelAssignments);
  const grouping = scoreGrouping(shiftSlot.date, personnelAssignments);
  const weekendFairness = scoreWeekendFairness(shiftSlot.date, personnelAssignments);

  const total =
    availability * WEIGHTS.availability +
    preference * WEIGHTS.preference +
    hoursBalance * WEIGHTS.hours_balance +
    positionMatch * WEIGHTS.position_match +
    areaMatch * WEIGHTS.area_match +
    (fairness * 2.0) + // DOUBLED Fairness influence
    grouping * WEIGHTS.grouping +
    weekendFairness; // Add directly as a modifier

  return {
    personnel_id: personnel.personnel_id,
    availability_score: availability,
    preference_score: preference,
    hours_balance_score: hoursBalance,
    position_match_score: positionMatch,
    fairness_score: fairness,
    total_score: Math.round(total * 100) / 100,
  };
}

function scoreWeekendFairness(
  dateStr: string,
  assignments: Array<{ date: string }>
): number {
  const d = parseISO(dateStr);
  if (d.getDay() !== 0) return 0; // Only applies to Sundays

  // Count how many Sundays this person already has assigned
  const sundaysWorked = assignments.filter(a => parseISO(a.date).getDay() === 0).length;

  // HEAVY Penalty for each Sunday already worked (to force rotation)
  return -(sundaysWorked * 200);
}

function scoreGrouping(
  dateStr: string,
  assignments: Array<{ date: string }>
): number {
  if (assignments.length === 0) return 50;

  const d = parseISO(dateStr);
  const prevStr = format(addDays(d, -1), 'yyyy-MM-dd');
  const nextStr = format(addDays(d, 1), 'yyyy-MM-dd');

  const hasAdjacent = assignments.some(a => a.date === prevStr || a.date === nextStr);
  if (hasAdjacent) return 100;

  return 0;
}

/**
 * Rank all candidates for a shift slot, sorted by total score descending
 */
export function rankCandidates(
  candidates: PersonnelAvailability[],
  shiftSlot: ShiftSlot,
  allPersonnelAssignments: Map<string, Array<{ date: string; shift_start: string; shift_name?: string }>> = new Map()
): CandidateScore[] {
  const maxHours = Math.max(...candidates.map((c) => c.weekly_hours), 1);
  const avgAssignments =
    candidates.reduce((sum, c) => sum + c.assigned_dates.size, 0) / (candidates.length || 1);

  return candidates
    .map((c) => {
      const pAssignments = allPersonnelAssignments.get(c.personnel_id) || [];
      return scoreCandidate(c, shiftSlot, maxHours, avgAssignments, pAssignments);
    })
    .sort((a, b) => b.total_score - a.total_score);
}

// ---------------------------------------------------------------------------
// Scoring functions (each returns 0-100)
// ---------------------------------------------------------------------------

function scoreAvailability(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot
): number {
  // 1. Contract Date Check
  if (personnel.hire_date && shiftSlot.date < personnel.hire_date) return 0;
  if (personnel.termination_date && shiftSlot.date > personnel.termination_date) return 0;

  // 2. Existing assignments or leaves
  if (personnel.leave_dates.has(shiftSlot.date)) return 0;
  if (personnel.assigned_dates.has(shiftSlot.date)) return 0;

  return 100;
}

function scorePreference(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot
): number {
  if (personnel.fixed_shift_id && personnel.fixed_shift_id === shiftSlot.shift_id) {
    return 1000;
  }

  const startHour = parseInt(shiftSlot.shift_start.split(':')[0], 10);
  const isNightShift = startHour >= 20 || startHour < 6;
  const hasNightInPattern = (personnel.rotation_pattern || '').toUpperCase().includes('NOCHE');

  if (isNightShift && (personnel.prefers_night || hasNightInPattern)) return 100;
  if (isNightShift && personnel.avoids_night) return 10;
  if (!isNightShift && personnel.avoids_night) return 100;
  if (!isNightShift && (personnel.prefers_night || hasNightInPattern)) return 50;

  const hasPrio04 = (personnel.rotation_pattern || '').includes('PRIO-04');
  const isSupervisor04 = (shiftSlot.position_name || '').toUpperCase().includes('SUPERVISOR') && shiftSlot.shift_start.includes('04');

  if (hasPrio04 && isSupervisor04) return 800;
  if (!hasPrio04 && isSupervisor04) return 300;

  return 75;
}

function scoreHoursBalance(
  personnel: PersonnelAvailability,
  maxWeeklyHours: number
): number {
  if (maxWeeklyHours === 0) return 100;
  const ratio = personnel.weekly_hours / maxWeeklyHours;
  return Math.round((1 - ratio) * 100);
}

function scorePositionMatch(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot
): number {
  const isMatch = personnel.main_position === shiftSlot.position_id || personnel.secondary_positions.includes(shiftSlot.position_id);
  if (personnel.main_position === shiftSlot.position_id) return 500;

  const norm = (s: string = '') => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
  const pName = norm(personnel.main_position_name);
  const isSupervisorMan = pName.includes('SUPERVISOR') || pName.includes('SUP');

  if (isSupervisorMan && !isMatch) return -1000000;

  const isTruckPerson = pName.includes('CONDUCTOR') || pName.includes('CAMION');
  const sName = norm(shiftSlot.position_name);
  const isTruckSlot = sName.includes('CONDUCTOR') || sName.includes('CAMION') || sName.includes('BLUE') || sName.includes('COLINA');

  if (isTruckPerson && !isTruckSlot) return -1000000;
  if (!isTruckPerson && isTruckSlot) return -1000000;

  if (isMatch) return 70;
  return -1000000;
}

function scoreFairness(
  personnel: PersonnelAvailability,
  avgAssignmentCount: number,
  targetDate: string,
  personnelAssignments: Array<{ date: string }> = []
): number {
  if (avgAssignmentCount === 0) return 100;

  const totalAssignmentCount = personnel.assigned_dates.size;
  const ratio = totalAssignmentCount / avgAssignmentCount;

  let score = 75;
  if (ratio <= 0.8) score = 100;
  if (ratio > 1.2) score = 40;

  // WORKLOAD BALANCING: Heavy penalty if worked yesterday to force alternating days off
  if (personnelAssignments.length > 0) {
    const targetDateObj = parseISO(targetDate);
    const yesterdayStr = format(addDays(targetDateObj, -1), 'yyyy-MM-dd');
    const workedYesterday = personnelAssignments.some(a => a.date === yesterdayStr);

    if (workedYesterday) {
      score -= 50; // Give space to others
    } else {
      score += 30; // High priority if was off yesterday
    }
  }

  // WEEKLY BALANCE: Count assignments in the SAME week as targetDate
  const weekStart = startOfWeek(parseISO(targetDate), { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);
  const assignmentsInWeek = personnelAssignments.filter(a => {
    const d = parseISO(a.date);
    return d >= weekStart && d <= weekEnd;
  }).length;

  if (assignmentsInWeek >= 5) score -= 10000; // Strong discouragement to go over 5
  if (assignmentsInWeek <= 3) score += 5000;   // HEAVY Priority for under-scheduled people (Marco fix)
  if (assignmentsInWeek <= 1) score += 5000;   // Extra boost if almost zero work

  return score;
}

function scoreAreaMatch(personnel: PersonnelAvailability, shiftSlot: ShiftSlot): number {
  const personAreaId = personnel.area_id;
  if (!personAreaId) return 100;
  if (personAreaId === shiftSlot.area_id) return 100;
  return 0;
}

/**
 * Score Stability - Prefer same shift as yesterday (or last work day)
 */
function scoreStability(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot,
  assignments: Array<{ date: string; shift_start: string; shift_name?: string }>
): number {
  if (assignments.length === 0) return 100;
  const recent = [...assignments]
    .filter(a => a.date < shiftSlot.date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];

  if (!recent) return 100;
  if (recent.shift_name && shiftSlot.shift_name && recent.shift_name === shiftSlot.shift_name) return 100;

  const isTargetAM = shiftSlot.shift_start.includes('04:') || shiftSlot.shift_start.includes('07:');
  const wasPrevPM = recent.shift_start.includes('12:') || recent.shift_start.includes('13:');

  if (wasPrevPM && isTargetAM) return -500;
  if (recent.shift_start !== shiftSlot.shift_start) return 60;

  return 85;
}
