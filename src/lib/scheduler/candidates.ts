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
  availability: 0.30,
  preference: 0.15,
  hours_balance: 0.25,
  position_match: 0.20,
  fairness: 0.10,
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
  const fairness = scoreFairness(personnel, avgAssignmentCount);

  const total =
    availability * WEIGHTS.availability +
    preference * WEIGHTS.preference +
    hoursBalance * WEIGHTS.hours_balance +
    positionMatch * WEIGHTS.position_match +
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
  // Not available if on leave
  if (personnel.is_on_leave) return 0;

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
    return 500; 
  }

  const startHour = parseInt(shiftSlot.shift_start.split(':')[0], 10);
  const isNightShift = startHour >= 20 || startHour < 6;

  if (isNightShift && personnel.prefers_night) return 100;
  if (isNightShift && personnel.avoids_night) return 10;
  if (!isNightShift && personnel.avoids_night) return 100;
  if (!isNightShift && personnel.prefers_night) return 50;

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
  // We match against position_id — but we use position names stored on personnel
  // In real implementation, this would match against the position record
  // For now, we prioritize primary position match

  if (personnel.main_position === shiftSlot.position_id) return 100;
  if (personnel.secondary_positions.includes(shiftSlot.position_id)) return 70;

  return 30; // Can still be assigned if no match, but low priority
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
