/**
 * Greedy Assignment Algorithm
 *
 * Phase 2 of the scheduling engine.
 * Sorts requirements by priority and difficulty.
 * For each requirement, picks the top-ranked candidate.
 */

import { rankCandidates } from './candidates';
import { validateAllConstraints, hasHardViolation, checkRotationPattern } from './constraints';
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
  
            const isFixed = p.rotation_pattern?.includes('Fijo');
            const isRotational = p.rotation_pattern && p.rotation_pattern !== 'Rotativo' && !isFixed;
            
            // 1. HARD ROTATION CHECK (Top Priority)
            if (isRotational) {
              const rotationViolation = checkRotationPattern(p, slot);
              if (rotationViolation) return false; // If resting, ignore completely
            }

            // Pass 0: Strategic Roles & Main Matches
            if (pass === 0) {
              const isMatch = p.main_position === slot.position_id;
              const pPosName = (p.main_position_name || '').toUpperCase();
              const isStrategic = pPosName.includes('SUPERVISOR') || pPosName.includes('GRÚA') || pPosName.includes('HORQUILLA');

              if (isStrategic && isMatch) return true;
              if (!isMatch || (!isRotational && !isFixed)) return false;
            }
  
            // Pass 1: Primary Qualification (Main Position)
            if (pass === 1) {
              if (p.main_position !== slot.position_id) return false;
            }
            
            // Pass 2 & 3: Secondary Qualification & Support
            if (pass >= 2) {
              const isQualified = p.main_position === slot.position_id || p.secondary_positions.includes(slot.position_id);
              if (!isQualified) return false;
            }
            return true;
          });

  
          if (available.length === 0) {
            console.log(`[AI-DEBUG] Paso ${pass}: Sin candidatos base para ${slot.date} ${slot.position_name}`);
            continue;
          }
  
          const ranked = rankCandidates(available, slot);
          
          for (const candidate of ranked) {
            if (candidate.availability_score === 0) continue;
            const person = personnelPool.find((p) => p.personnel_id === candidate.personnel_id)!;
            const state = personnelState.get(candidate.personnel_id)!;
  
            const violations = validateAllConstraints(person, slot, state.assignments);
            
            // DIAGNÓSTICO DE CAUSA RAÍZ
            if (person.first_name.toUpperCase().includes('LIZARDO') || person.first_name.toUpperCase().includes('EMILIO')) {
              if (violations.length > 0) {
                 console.log(`[ROOT-CAUSE-LOG] Rechazando a ${person.first_name} para ${slot.date} (${slot.position_name}): ${violations[0].message}`);
              }
            }

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
