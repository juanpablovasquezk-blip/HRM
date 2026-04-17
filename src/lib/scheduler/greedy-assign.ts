/**
 * Greedy Assignment Algorithm
 *
 * Phase 2 of the scheduling engine.
 * Sorts requirements by priority and difficulty.
 * For each requirement, picks the top-ranked candidate.
 */

import { rankCandidates } from './candidates';
import { validateAllConstraints, hasHardViolation } from './constraints';
import { getSlotPriority } from './priorities';
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

  // Sort slots by priority (desc) THEN difficulty (asc: fewest available candidates first)
  const sortedSlots = [...slots].sort((a, b) => {
    const prioA = getSlotPriority(a, a.position_name || '', a.area_name || '', a.shift_name || '');
    const prioB = getSlotPriority(b, b.position_name || '', b.area_name || '', b.shift_name || '');

    if (prioA !== prioB) return prioB - prioA;

    const aCandidates = personnelPool.filter(
      (p) => !p.assigned_dates.has(a.date) && !p.leave_dates.has(a.date)
    ).length;
    const bCandidates = personnelPool.filter(
      (p) => !p.assigned_dates.has(b.date) && !p.leave_dates.has(b.date)
    ).length;
    return aCandidates - bCandidates;
  });

  // TIERED MULTI-PASS STRATEGY
  const tiers = [
    { name: 'Critical (Canes/Sup)', minPriority: 95, passes: [0, 1, 2] },
    { name: 'Standard (Airport/Bodega)', minPriority: 0, passes: [0, 1, 2, 3] }
  ];
  
  for (const tier of tiers) {
    const tierSlots = sortedSlots.filter(s => getSlotPriority(s, s.position_name || '', s.area_name || '', s.shift_name || '') >= tier.minPriority);
    
    for (const pass of tier.passes) {
      for (const slot of tierSlots) {
        const alreadyAssigned = assignments.filter(
          (a) => a.date === slot.date && a.shift_id === slot.shift_id && a.area_id === slot.area_id && a.position_id === slot.position_id
        ).length;
        
        const needed = slot.required_count - (slot.filled_count + alreadyAssigned);
        if (needed <= 0) continue;
  
        for (let i = 0; i < needed; i++) {
          const available = personnelPool.filter((p) => {
            if (p.assigned_dates.has(slot.date) || p.leave_dates.has(slot.date)) return false;
  
            // Pass 0: Mandatory Cycle Work or Fixed
            if (pass === 0) {
              const isFixed = p.rotation_pattern?.includes('Fijo');
              const isRotational = p.rotation_pattern && p.rotation_pattern !== 'Rotativo' && !isFixed;
              const isWorkDayInCycle = isRotational && !validateAllConstraints(p, slot, []).some(v => v.type === 'rotation_violation');
              
              const isMatch = p.main_position === slot.position_id || p.secondary_positions.includes(slot.position_id);
              if (!(isFixed || isWorkDayInCycle) || !isMatch) return false;
            }
  
            // Pass 1: Primary Qualification (Main Position)
            if (pass === 1) {
              if (p.main_position !== slot.position_id) return false;
            }
            
            // Pass 2 & 3: Secondary Qualification & Support
            if (pass >= 2) {
              const isMathias = p.first_name.toUpperCase().includes('MATHIAS');
              const isCanesSlot = (slot.position_name || '').toUpperCase().includes('CANES');
              
              if (isMathias && isCanesSlot) {
                // Mathias is ALWAYS qualified for Canes
              } else {
                const isQualified = p.main_position === slot.position_id || p.secondary_positions.includes(slot.position_id);
                if (!isQualified) return false;
              }
            }
            return true;
          });
  
          if (available.length === 0) {
            console.log(`[AI-DEBUG] Paso ${pass}: Sin candidatos base para ${slot.date} ${slot.position_name}`);
            continue;
          }
  
          // TIERED RANKING REFINEMENT: If this is a Canes slot, prioritize Mathias Rozas above everyone else in Pass 2
          let ranked = rankCandidates(available, slot);
          const isCanesSlot = (slot.position_name || '').toUpperCase().includes('CANES');
          if (isCanesSlot && pass >= 2) {
             ranked = [...ranked].sort((a,b) => {
               const pA = personnelPool.find(p => p.personnel_id === a.personnel_id);
               const pB = personnelPool.find(p => p.personnel_id === b.personnel_id);
               const isMathiasA = pA?.first_name.toUpperCase().includes('MATHIAS');
               const isMathiasB = pB?.first_name.toUpperCase().includes('MATHIAS');
               if (isMathiasA && !isMathiasB) return -1;
               if (!isMathiasA && isMathiasB) return 1;
               return b.total_score - a.total_score;
             });
          }
          
          for (const candidate of ranked) {
            if (candidate.availability_score === 0) continue;
            const person = personnelPool.find((p) => p.personnel_id === candidate.personnel_id)!;
            const state = personnelState.get(candidate.personnel_id)!;
  
            const violations = validateAllConstraints(person, slot, state.assignments);
            
            if (hasHardViolation(violations)) continue;
            if (pass < 3 && violations.some(v => v.severity === 'warning')) continue;
  
            allViolations.push(...violations);
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
            state.assignments.push({
              date: slot.date,
              duration_hours: slot.shift_duration_hours,
              shift_start: slot.shift_start,
              shift_end: slot.shift_end,
            });
            person.assigned_dates.add(slot.date);
            person.weekly_hours += slot.shift_duration_hours;
            break;
          }
        }
      }
    }
  }

  // Final check for unfilled slots
  for (const slot of sortedSlots) {
    const totalFilled = assignments.filter(
      (a) => a.date === slot.date && a.shift_id === slot.shift_id && a.area_id === slot.area_id && a.position_id === slot.position_id
    ).length + slot.filled_count;
    if (totalFilled < slot.required_count) unfilled.push(slot);
  }

  return { assignments, violations: allViolations, unfilled };
}
