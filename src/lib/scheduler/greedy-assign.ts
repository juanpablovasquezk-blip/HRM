/**
 * Greedy Assignment Algorithm
 *
 * Phase 2 of the scheduling engine.
 * Sorts requirements by difficulty (fewer candidates = higher priority)
 * For each requirement, picks the top-ranked candidate.
 */

import { rankCandidates } from './candidates';
import { validateAllConstraints, hasHardViolation } from './constraints';
import type {
  PersonnelAvailability,
  ShiftSlot,
  AssignmentCandidate,
  ConstraintViolation,
} from './types';

export interface GreedyResult {
  assignments: AssignmentCandidate[];
  violations: ConstraintViolation[];
  unfilled: ShiftSlot[];
}

/**
 * Run greedy assignment across all shift slots
 */
export function greedyAssign(
  slots: ShiftSlot[],
  personnelPool: PersonnelAvailability[],
  existingAssignments: Array<{
    personnel_id: string;
    date: string;
    duration_hours: number;
    shift_start: string;
    shift_end: string;
  }>
): GreedyResult {
  const assignments: AssignmentCandidate[] = [];
  const allViolations: ConstraintViolation[] = [];
  const unfilled: ShiftSlot[] = [];

  // Track running state per personnel
  const personnelState = new Map<string, {
    assignments: Array<{ date: string; duration_hours: number; shift_start: string; shift_end: string }>;
  }>();

  // Initialize with existing assignments
  for (const p of personnelPool) {
    const pAssignments = existingAssignments.filter(
      (a) => a.personnel_id === p.personnel_id
    );
    personnelState.set(p.personnel_id, { assignments: [...pAssignments] });
  }

  // Sort slots by difficulty: fewest available candidates first
  const sortedSlots = [...slots].sort((a, b) => {
    const aCandidates = personnelPool.filter(
      (p) => !p.assigned_dates.has(a.date) && !p.is_on_leave
    ).length;
    const bCandidates = personnelPool.filter(
      (p) => !p.assigned_dates.has(b.date) && !p.is_on_leave
    ).length;
    return aCandidates - bCandidates;
  });

  for (const slot of sortedSlots) {
    const needed = slot.required_count - slot.filled_count;

    for (let i = 0; i < needed; i++) {
      // Filter available candidates
      const available = personnelPool.filter((p) => {
        if (p.is_on_leave) return false;
        if (p.assigned_dates.has(slot.date)) return false;
        return true;
      });

      if (available.length === 0) {
        unfilled.push(slot);
        continue;
      }

      // Rank candidates
      const ranked = rankCandidates(available, slot);

      let assigned = false;

      for (const candidate of ranked) {
        if (candidate.availability_score === 0) continue;

        const person = personnelPool.find(
          (p) => p.personnel_id === candidate.personnel_id
        )!;
        const state = personnelState.get(candidate.personnel_id)!;

        // Validate hard constraints
        const violations = validateAllConstraints(
          person,
          slot,
          state.assignments
        );

        if (hasHardViolation(violations)) {
          allViolations.push(...violations.filter((v) => v.severity === 'error'));
          continue;
        }

        // Warning-level violations are tracked but don't block
        allViolations.push(...violations.filter((v) => v.severity === 'warning'));

        // Assign
        const assignment: AssignmentCandidate = {
          personnel_id: candidate.personnel_id,
          shift_id: slot.shift_id,
          date: slot.date,
          area_id: slot.area_id,
          position_id: slot.position_id,
          status: 'scheduled',
          is_locked: false,
          is_manual: false,
          frozen_by_rule: false,
        };

        assignments.push(assignment);

        // Update running state
        state.assignments.push({
          date: slot.date,
          duration_hours: slot.shift_duration_hours,
          shift_start: slot.shift_start,
          shift_end: slot.shift_end,
        });

        // Update personnel availability
        person.assigned_dates.add(slot.date);
        person.weekly_hours += slot.shift_duration_hours;

        assigned = true;
        break;
      }

      if (!assigned) {
        unfilled.push(slot);
      }
    }
  }

  return { assignments, violations: allViolations, unfilled };
}
