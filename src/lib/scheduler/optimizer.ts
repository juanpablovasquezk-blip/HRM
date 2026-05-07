/**
 * Post-Assignment Optimizer
 *
 * Phase 4 of the scheduling engine.
 * Finds constraint violations and attempts swaps to reduce total violations.
 */

import { validateAllConstraints } from './constraints';
import type {
  AssignmentCandidate,
  PersonnelAvailability,
  ShiftSlot,
} from './types';

const MAX_SWAP_ITERATIONS = 5; 
const MAX_TOTAL_SWAPS = 200; 
const MAX_OPTIMIZATION_TIME_MS = 10000; // 10 seconds hard limit

export interface OptimizationResult {
  assignments: AssignmentCandidate[];
  swaps_made: number;
  violations_before: number;
  violations_after: number;
}

/**
 * Attempt to optimize assignments by swapping to reduce violations.
 */
export function optimizeAssignments(
  assignments: AssignmentCandidate[],
  personnelPool: PersonnelAvailability[],
  slots: ShiftSlot[]
): OptimizationResult {
  let currentAssignments = [...assignments];
  let swapsMade = 0;
  
  if (currentAssignments.length === 0) {
    return { assignments, swaps_made: 0, violations_before: 0, violations_after: 0 };
  }

  // 1. Pre-map slots for fast lookup
  const slotMap = new Map<string, ShiftSlot>();
  for (const s of slots) {
    slotMap.set(`${s.date}-${s.shift_id}-${s.area_id}`, s);
  }

  // 2. Pre-group assignments by person
  const assignmentsByPerson = new Map<string, AssignmentCandidate[]>();
  for (const a of currentAssignments) {
    if (!assignmentsByPerson.has(a.personnel_id)) assignmentsByPerson.set(a.personnel_id, []);
    assignmentsByPerson.get(a.personnel_id)!.push(a);
  }

  // 3. Group assignments by DATE to reduce search space
  const assignmentsByDate = new Map<string, AssignmentCandidate[]>();
  for (const a of currentAssignments) {
    if (!assignmentsByDate.has(a.date)) assignmentsByDate.set(a.date, []);
    assignmentsByDate.get(a.date)!.push(a);
  }

  // 4. Pre-calculate initial violations per person
  const personErrors = new Map<string, number>();
  let totalViolations = 0;
  
  const uniquePersonnelInit = Array.from(new Map(currentAssignments.map(a => [a.personnel_id, a])).keys());
  for (const id of uniquePersonnelInit) {
    const pAss = assignmentsByPerson.get(id) || [];
    const errs = countPersonViolations(id, pAss, personnelPool, slotMap);
    personErrors.set(id, errs);
    totalViolations += errs;
  }
  
  const initialViolations = totalViolations;
  const startTime = performance.now();
  console.log(`[OPTIMIZER] Iniciando optimización. Violaciones base: ${initialViolations}`);

  for (let iter = 0; iter < MAX_SWAP_ITERATIONS; iter++) {
    let iterationSwaps = 0;

    for (const [date, dayAssignments] of assignmentsByDate.entries()) {
      if (dayAssignments.length < 2) continue;

      for (let i = 0; i < dayAssignments.length; i++) {
        for (let j = i + 1; j < dayAssignments.length; j++) {
          if (swapsMade >= MAX_TOTAL_SWAPS) break;
          if (performance.now() - startTime > MAX_OPTIMIZATION_TIME_MS) break;

          const a = dayAssignments[i];
          const b = dayAssignments[j];

          if (a.personnel_id === b.personnel_id) continue;
          if (a.frozen_by_rule || b.frozen_by_rule || a.is_manual || b.is_manual || a.is_locked || b.is_locked) continue;

          const errA = personErrors.get(a.personnel_id) || 0;
          const errB = personErrors.get(b.personnel_id) || 0;
          if (errA === 0 && errB === 0) continue;

          const vBefore = errA + errB;
          const p1 = a.personnel_id;
          const p2 = b.personnel_id;

          const p1Ass = assignmentsByPerson.get(p1)!;
          const p2Ass = assignmentsByPerson.get(p2)!;
          
          const idxA = p1Ass.indexOf(a);
          const idxB = p2Ass.indexOf(b);
          p1Ass[idxA] = b;
          p2Ass[idxB] = a;

          const vAfter = 
            countPersonViolations(p1, p1Ass, personnelPool, slotMap) +
            countPersonViolations(p2, p2Ass, personnelPool, slotMap);

          if (vAfter < vBefore) {
            a.personnel_id = p2;
            b.personnel_id = p1;
            swapsMade++;
            iterationSwaps++;
            personErrors.set(p1, countPersonViolations(p1, p1Ass, personnelPool, slotMap));
            personErrors.set(p2, countPersonViolations(p2, p2Ass, personnelPool, slotMap));
          } else {
            p1Ass[idxA] = a;
            p2Ass[idxB] = b;
          }
        }
        if (swapsMade >= MAX_TOTAL_SWAPS) break;
        if (performance.now() - startTime > MAX_OPTIMIZATION_TIME_MS) break;
      }
      if (swapsMade >= MAX_TOTAL_SWAPS) break;
      if (performance.now() - startTime > MAX_OPTIMIZATION_TIME_MS) break;
    }

    if (iterationSwaps === 0) break; 
    console.log(`[OPTIMIZER] Iteración ${iter+1} completada. Swaps: ${iterationSwaps}.`);
  }

  const finalViolations = Array.from(personErrors.values()).reduce((a, b) => a + b, 0);
  console.log(`[OPTIMIZER] Finalizado. Total swaps: ${swapsMade}. Reducción: ${initialViolations} -> ${finalViolations}`);

  return {
    assignments: currentAssignments,
    swaps_made: swapsMade,
    violations_before: initialViolations,
    violations_after: finalViolations,
  };
}

/**
 * Counts total error-level violations for a single person's assignments.
 */
function countPersonViolations(
  personnelId: string,
  personAssignments: AssignmentCandidate[],
  personnelPool: PersonnelAvailability[],
  slotMap: Map<string, ShiftSlot>
): number {
  const person = personnelPool.find(p => p.personnel_id === personnelId);
  if (!person) return 0;

  // Pre-calculate date set for performance
  const dateSet = new Set(personAssignments.map(a => a.date));

  const constraintInput = personAssignments.map(a => {
    const s = slotMap.get(`${a.date}-${a.shift_id}-${a.area_id}`);
    return {
      date: a.date,
      duration_hours: s?.shift_duration_hours || 8,
      shift_start: s?.shift_start || '00:00',
      shift_end: s?.shift_end || '00:00',
    };
  });

  let errors = 0;
  for (const pa of personAssignments) {
    const slot = slotMap.get(`${pa.date}-${pa.shift_id}-${pa.area_id}`);
    if (!slot) continue;

    // Pass the pre-calculated dateSet to validateAllConstraints
    const violations = (validateAllConstraints as any)(person, slot, constraintInput, dateSet);
    for (const v of violations) {
      if (v.severity === 'error') errors++;
    }
  }

  return errors;
}
