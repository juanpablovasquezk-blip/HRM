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

const MAX_SWAP_ITERATIONS = 50;

export interface OptimizationResult {
  assignments: AssignmentCandidate[];
  swaps_made: number;
  violations_before: number;
  violations_after: number;
}

/**
 * Attempt to optimize assignments by swapping to reduce violations.
 * Optimized version: Only recalculates affected personnel.
 */
export function optimizeAssignments(
  assignments: AssignmentCandidate[],
  personnelPool: PersonnelAvailability[],
  slots: ShiftSlot[]
): OptimizationResult {
  let currentAssignments = [...assignments];
  let swapsMade = 0;
  
  // Pre-map slots for fast lookup
  const slotMap = new Map<string, ShiftSlot>();
  for (const s of slots) {
    slotMap.set(`${s.date}-${s.shift_id}-${s.area_id}`, s);
  }

  const initialViolations = countAllViolations(currentAssignments, personnelPool, slotMap);

  for (let iter = 0; iter < MAX_SWAP_ITERATIONS; iter++) {
    let improved = false;

    for (let i = 0; i < currentAssignments.length; i++) {
      for (let j = i + 1; j < currentAssignments.length; j++) {
        const a = currentAssignments[i];
        const b = currentAssignments[j];

        // Only swap if different personnel and same date (to keep requirements met)
        if (a.personnel_id === b.personnel_id) continue;
        if (a.date !== b.date) continue; 

        // Calculate current violations for ONLY these two people
        const vBefore = 
          countPersonViolations(a.personnel_id, currentAssignments, personnelPool, slotMap) +
          countPersonViolations(b.personnel_id, currentAssignments, personnelPool, slotMap);

        // Try the swap
        const p1 = a.personnel_id;
        const p2 = b.personnel_id;
        
        a.personnel_id = p2;
        b.personnel_id = p1;

        const vAfter = 
          countPersonViolations(p1, currentAssignments, personnelPool, slotMap) +
          countPersonViolations(p2, currentAssignments, personnelPool, slotMap);

        if (vAfter < vBefore) {
          swapsMade++;
          improved = true;
          // Swap kept
          break;
        } else {
          // Revert swap
          a.personnel_id = p1;
          b.personnel_id = p2;
        }
      }
      if (improved) break;
    }
    if (!improved) break; 
  }

  return {
    assignments: currentAssignments,
    swaps_made: swapsMade,
    violations_before: initialViolations,
    violations_after: countAllViolations(currentAssignments, personnelPool, slotMap),
  };
}

function countPersonViolations(
  personnelId: string,
  assignments: AssignmentCandidate[],
  personnelPool: PersonnelAvailability[],
  slotMap: Map<string, ShiftSlot>
): number {
  const person = personnelPool.find(p => p.personnel_id === personnelId);
  if (!person) return 0;

  const personAssignments = assignments.filter(a => a.personnel_id === personnelId);
  let errors = 0;

  for (const pa of personAssignments) {
    const slot = slotMap.get(`${pa.date}-${pa.shift_id}-${pa.area_id}`);
    if (!slot) continue;

    const constraintInput = personAssignments.map(a => {
      const s = slotMap.get(`${a.date}-${a.shift_id}-${a.area_id}`);
      return {
        date: a.date,
        duration_hours: s?.shift_duration_hours || 8,
        shift_start: s?.shift_start || '00:00',
        shift_end: s?.shift_end || '00:00',
      };
    });

    const violations = validateAllConstraints(person, slot, constraintInput);
    errors += violations.filter(v => v.severity === 'error').length;
  }

  return errors;
}

function countAllViolations(
  assignments: AssignmentCandidate[],
  personnelPool: PersonnelAvailability[],
  slotMap: Map<string, ShiftSlot>
): number {
  let total = 0;
  const uniquePersonnel = Array.from(new Set(assignments.map(a => a.personnel_id)));
  for (const id of uniquePersonnel) {
    total += countPersonViolations(id, assignments, personnelPool, slotMap);
  }
  return total;
}
