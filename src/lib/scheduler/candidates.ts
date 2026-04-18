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

const WEIGHTS = {
  availability: 0.25,
  preference: 0.10,
  hours_balance: 0.20,
  position_match: 0.25,
  area_match: 0.15, // New weight
  fairness: 0.05,
};

/**
 * Score a single candidate for a given shift slot
 */
export function scoreCandidate(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot,
  maxWeeklyHours: number, // Max hours among all candidates this week
  avgAssignmentCount: number // Average assignment count for fairness
): CandidateScore {
  const availability = scoreAvailability(personnel, shiftSlot);
  const preference = scorePreference(personnel, shiftSlot);
  const hoursBalance = scoreHoursBalance(personnel, maxWeeklyHours);
  const positionMatch = scorePositionMatch(personnel, shiftSlot);
  const areaMatch = scoreAreaMatch(personnel, shiftSlot);
  const fairness = scoreFairness(personnel, avgAssignmentCount);

  const total =
    availability * WEIGHTS.availability +
    preference * WEIGHTS.preference +
    hoursBalance * WEIGHTS.hours_balance +
    positionMatch * WEIGHTS.position_match +
    areaMatch * WEIGHTS.area_match +
    fairness * WEIGHTS.fairness;

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

/**
 * Rank all candidates for a shift slot, sorted by total score descending
 */
export function rankCandidates(
  candidates: PersonnelAvailability[],
  shiftSlot: ShiftSlot
): CandidateScore[] {
  const maxHours = Math.max(...candidates.map((c) => c.weekly_hours), 1);
  const avgAssignments =
    candidates.reduce((sum, c) => sum + c.assigned_dates.size, 0) / (candidates.length || 1);

  return candidates
    .map((c) => scoreCandidate(c, shiftSlot, maxHours, avgAssignments))
    .sort((a, b) => b.total_score - a.total_score);
}

// ---------------------------------------------------------------------------
// Scoring functions (each returns 0-100)
// ---------------------------------------------------------------------------

function scoreAvailability(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot
): number {
  // Not available if on leave on this specific date
  if (personnel.leave_dates.has(shiftSlot.date)) return 0;

  // Not available if already assigned this date
  if (personnel.assigned_dates.has(shiftSlot.date)) return 0;

  // Available
  return 100;
}

function scorePreference(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot
): number {
  // FIXED SHIFT PRIORITY: If this is their designated fixed shift, enormous score boost
  if (personnel.fixed_shift_id && personnel.fixed_shift_id === shiftSlot.shift_id) {
    return 1000; // Even higher boost
  }

  const startHour = parseInt(shiftSlot.shift_start.split(':')[0], 10);
  const isNightShift = startHour >= 20 || startHour < 6;

  if (isNightShift && personnel.prefers_night) return 100;
  if (isNightShift && personnel.avoids_night) return 10;
  if (!isNightShift && personnel.avoids_night) return 100;
  if (!isNightShift && personnel.prefers_night) return 50;

  // UNIVERSAL PRIORITY SYSTEM: Higher score for specifically tagged personnel
  const hasPrio04 = (personnel.rotation_pattern || '').includes('PRIO-04');
  const isSupervisor04 = (shiftSlot.position_name || '').toUpperCase().includes('SUPERVISOR') && shiftSlot.shift_start.includes('04');
  
  if (hasPrio04 && isSupervisor04) return 800; // Strongest preference
  
  // STANDARD PRIORITY: If qualified but not specifically prioritized
  if (!hasPrio04 && isSupervisor04) return 300;

  return 75;
}

function scoreHoursBalance(
  personnel: PersonnelAvailability,
  maxWeeklyHours: number
): number {
  if (maxWeeklyHours === 0) return 100;

  // Lower hours = higher score (so they get more shifts for fairness)
  const ratio = personnel.weekly_hours / maxWeeklyHours;
  return Math.round((1 - ratio) * 100);
}

function scorePositionMatch(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot
): number {
  const isMatch = personnel.main_position === shiftSlot.position_id || personnel.secondary_positions.includes(shiftSlot.position_id);
  
  // PRIMARY MATCH: Huge boost
  if (personnel.main_position === shiftSlot.position_id) return 10000;
  
  // CROSS-ASSIGNMENT PROTECTION: 
  // If the person is a Supervisor, they CANNOT work in anything else. Period.
  const norm = (s: string = '') => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
  const pName = norm(personnel.main_position_name);
  const isSupervisorMan = pName.includes('SUPERVISOR') || pName.includes('SUP');
  
  if (isSupervisorMan && !isMatch) {
    return -1000000; // Impossible score
  }

  if (isMatch) return 70;

  return -1000000; // Total block if not in main or secondary positions
}

function scoreFairness(
  personnel: PersonnelAvailability,
  avgAssignmentCount: number
): number {
  if (avgAssignmentCount === 0) return 100;

  const assignmentCount = personnel.assigned_dates.size;
  const ratio = assignmentCount / avgAssignmentCount;

  // Below average = higher score (should get more assignments)
  if (ratio <= 0.5) return 100;
  if (ratio <= 1.0) return 75;
  if (ratio <= 1.5) return 50;
  return 25;
}

function scoreAreaMatch(personnel: PersonnelAvailability, shiftSlot: ShiftSlot): number {
  const personAreaId = personnel.main_position_obj?.area_id;
  
  // GLOBAL POSITION (No area assigned): Can work anywhere!
  if (!personAreaId) return 100;
  
  // Specific area match
  if (personAreaId === shiftSlot.area_id) return 100;
  
  return 0;
}
