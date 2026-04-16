/**
 * Post-Assignment Optimizer
 *
 * Phase 4 of the scheduling engine.
 * Finds constraint violations and attempts swaps to reduce total violations.
 */

import { validateAllConstraints, hasHardViolation } from './constraints';
import type {
  AssignmentCandidate,
  PersonnelAvailability,
  ShiftSlot,
  ConstraintViolation,
} from './types';

const MAX_SWAP_ITERATIONS = 100;

export interface OptimizationResult {
  assignments: AssignmentCandidate[];
  swaps_made: number;
  violations_before: number;
  violations_after: number;
}

/**
 * Attempt to optimize assignments by swapping to reduce violations
 */
export function optimizeAssignments(
  assignments: AssignmentCandidate[],
  personnelPool: PersonnelAvailability[],
  slots: ShiftSlot[]
): OptimizationResult {
  let currentAssignments = [...assignments];
  let swapsMade = 0;
  const initialViolations = countViolations(currentAssignments, personnelPool, slots);

  for (let iter = 0; iter < MAX_SWAP_ITERATIONS; iter++) {
    let improved = false;

    for (let i = 0; i < currentAssignments.length; i++) {
      for (let j = i + 1; j < currentAssignments.length; j++) {
        const a = currentAssignments[i];
        const b = currentAssignments[j];

        // Only swap if different personnel, same date or same position
        if (a.personnel_id === b.personnel_id) continue;
        if (a.date !== b.date && a.position_id !== b.position_id) continue;

        // Try the swap
        const swapped = [...currentAssignments];
        swapped[i] = {
          ...a,
          personnel_id: b.personnel_id,
        };
        swapped[j] = {
          ...b,
          personnel_id: a.personnel_id,
        };

        const newViolations = countViolations(swapped, personnelPool, slots);
        const currentViolations = countViolations(currentAssignments, personnelPool, slots);

        if (newViolations < currentViolations) {
          currentAssignments = swapped;
          swapsMade++;
          improved = true;
          break;
        }
      }

      if (improved) break;
    }

    if (!improved) break; // No more improvements possible
  }

  return {
    assignments: currentAssignments,
    swaps_made: swapsMade,
    violations_before: initialViolations,
    violations_after: countViolations(currentAssignments, personnelPool, slots),
  };
}

function countViolations(
  assignments: AssignmentCandidate[],
  personnelPool: PersonnelAvailability[],
  slots: ShiftSlot[]
): number {
  let count = 0;

  for (const assignment of assignments) {
    const person = personnelPool.find(
      (p) => p.personnel_id === assignment.personnel_id
    );
    if (!person) continue;

    const slot = slots.find(
      (s) =>
        s.shift_id === assignment.shift_id &&
        s.date === assignment.date &&
        s.area_id === assignment.area_id
    );
    if (!slot) continue;

    const personAssignments = assignments
      .filter((a) => a.personnel_id === assignment.personnel_id)
      .map((a) => {
        const s = slots.find(
          (sl) => sl.shift_id === a.shift_id && sl.date === a.date
        );
        return {
          date: a.date,
          duration_hours: s?.shift_duration_hours || 0,
          shift_start: s?.shift_start || '00:00',
          shift_end: s?.shift_end || '00:00',
        };
      });

    const violations = validateAllConstraints(person, slot, personAssignments);
    count += violations.filter((v) => v.severity === 'error').length;
  }

  return count;
}
