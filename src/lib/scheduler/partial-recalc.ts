/**
 * Partial Recalculation Engine
 *
 * Recalculates only affected parts of the schedule without breaking stable assignments.
 *
 * Algorithm:
 * 1. Identify impacted assignments
 * 2. Exclude locked/manual/frozen
 * 3. Remove affected
 * 4. Build candidate pool
 * 5. Rank candidates
 * 6. Assign
 * 7. Validate
 * 8. Save & notify
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { greedyAssign } from './greedy-assign';
import { optimizeAssignments } from './optimizer';
import { isShiftFrozen } from './freeze';
import type {
  RecalculationInput,
  ScheduleResult,
  PersonnelAvailability,
  ShiftSlot,
} from './types';
import { eachDayOfInterval, parseISO, format } from 'date-fns';

/**
 * Run partial recalculation on affected assignments
 */
export async function partialRecalculate(
  input: RecalculationInput
): Promise<ScheduleResult> {
  const supabase = createAdminClient();
  const [startDate, endDate] = input.date_range;

  // 1. Load existing assignments in the date range
  let assignmentQuery = supabase
    .from('shift_assignments')
    .select('*, shift:shifts(start_time, end_time, duration_hours)')
    .gte('date', startDate)
    .lte('date', endDate);

  if (input.area_id) assignmentQuery = assignmentQuery.eq('area_id', input.area_id);
  if (input.position_id) assignmentQuery = assignmentQuery.eq('position_id', input.position_id);

  const { data: existingAssignments } = await assignmentQuery;

  // 2. Separate protected vs. modifiable assignments
  const protectedAssignments = (existingAssignments || []).filter((a) => {
    if (a.is_locked) return true;
    if (a.is_manual) return true;
    if (a.frozen_by_rule && !input.override_freeze) return true;
    if (isShiftFrozen(a.date) && !input.override_freeze) return true;
    
    // REGLA DE TURNO FIJO (Desde la ficha personal)
    const p = (personnel || []).find(p => p.id === a.personnel_id);
    if (p?.fixed_shift_id && p.fixed_shift_id !== a.shift_id) {
      return true;
    }

    return false;
  });

  const modifiableAssignments = (existingAssignments || []).filter((a) => {
    // If specifically affected
    if (input.affected_personnel_id && a.personnel_id === input.affected_personnel_id) {
      // Can only modify if not locked
      return !a.is_locked;
    }
    // Otherwise only modify non-protected
    if (a.is_locked) return false;
    if (a.is_manual) return false;
    if (a.frozen_by_rule && !input.override_freeze) return false;
    if (isShiftFrozen(a.date) && !input.override_freeze) return false;
    return true;
  });

  // 3. Load requirements for the date range
  let reqQuery = supabase
    .from('shift_requirements')
    .select('*, shift:shifts(start_time, end_time, duration_hours, requires_transport)')
    .gte('date', startDate)
    .lte('date', endDate);

  if (input.area_id) reqQuery = reqQuery.eq('area_id', input.area_id);
  if (input.position_id) reqQuery = reqQuery.eq('position_id', input.position_id);

  const { data: requirements } = await reqQuery;

  // 4. Load personnel pool
  const { data: personnel } = await supabase
    .from('personnel')
    .select('*')
    .eq('is_active', true);

  // 5. Load leaves for the date range
  const { data: leaves } = await supabase
    .from('leaves')
    .select('*')
    .eq('status', 'approved')
    .lte('start_date', endDate)
    .gte('end_date', startDate);

  const { data: positions } = await supabase.from('positions').select('*');
  const { data: allShifts } = await supabase.from('shifts').select('*');

  // Build available slots (requirements minus protected fulfillment)
  const slots: ShiftSlot[] = (requirements || []).map((req) => {
    const shift = req.shift as { start_time: string; end_time: string; duration_hours: number; requires_transport: boolean } | null;
    const filledByProtected = protectedAssignments.filter(
      (a) =>
        a.date === req.date &&
        a.shift_id === req.shift_id &&
        a.area_id === req.area_id &&
        a.position_id === req.position_id
    ).length;

    return {
      requirement_id: req.id,
      date: req.date,
      shift_id: req.shift_id,
      area_id: req.area_id,
      position_id: req.position_id,
      shift_start: shift?.start_time || '00:00',
      shift_end: shift?.end_time || '00:00',
      shift_duration_hours: shift?.duration_hours || 8,
      required_count: req.required_count,
      filled_count: filledByProtected,
      requires_transport: shift?.requires_transport ?? false,
    };
  }).filter((s) => s.filled_count < s.required_count); // Only slots that need filling

  // Build personnel availability
  const dates = eachDayOfInterval({
    start: parseISO(startDate),
    end: parseISO(endDate),
  });

  const personnelAvailability: PersonnelAvailability[] = (personnel || []).map((p) => {
    const personLeaves = (leaves || []).filter((l) => l.personnel_id === p.id);
    const leaveDates = new Set<string>();
    personLeaves.forEach(l => {
      try {
        const interval = eachDayOfInterval({ start: parseISO(l.start_date), end: parseISO(l.end_date) });
        interval.forEach(d => leaveDates.add(format(d, 'yyyy-MM-dd')));
      } catch (e) {
        console.error(`[AI] Error en fechas de licencia para ${p.id}:`, l.start_date, l.end_date);
      }
    });

    const protectedForPerson = protectedAssignments.filter(
      (a) => a.personnel_id === p.id
    );

    return {
      personnel_id: p.id,
      first_name: p.first_name,
      birth_date: p.birth_date,
      main_position: p.main_position,
      main_position_name: ((positions || []).find(pos => pos.id === p.main_position) as any)?.name || '',
      secondary_positions: p.secondary_positions || [],
      prefers_night: p.prefers_night,
      avoids_night: p.avoids_night,
      fixed_shift_id: p.fixed_shift_id,
      rotation_pattern: p.rotation_pattern,
      has_special_contract: p.has_special_contract || false,
      hire_date: p.hire_date,
      termination_date: p.termination_date,
      area_id: p.area_id || '',
      is_turn_b: p.is_turn_b || false,
      requires_transport: p.requires_transport ?? true,
      weekly_hours: protectedForPerson.reduce((sum, a) => {
        const shift = a.shift as { duration_hours: number } | null;
        return sum + (shift?.duration_hours || 0);
      }, 0),
      days_off_count: 0,
      last_shift_end: null,
      assigned_dates: new Set(protectedForPerson.map((a) => a.date)),
      leave_dates: leaveDates,
    };
  });

  // 6. Existing (protected) assignments for constraint checking
  const existingForConstraints = protectedAssignments.map((a) => {
    const shift = a.shift as { start_time: string; end_time: string; duration_hours: number } | null;
    return {
      personnel_id: a.personnel_id,
      date: a.date,
      duration_hours: shift?.duration_hours || 8,
      shift_start: shift?.start_time || '00:00',
      shift_end: shift?.end_time || '00:00',
    };
  });

  // 7. Run greedy assignment
  const greedy = greedyAssign(
    slots, 
    personnelAvailability, 
    existingForConstraints, 
    startDate, 
    endDate, 
    allShifts || []
  );

  // 8. Optimize
  const optimized = optimizeAssignments(
    greedy.assignments,
    personnelAvailability,
    slots
  );

  // 9. Delete modifiable assignments from DB
  if (modifiableAssignments.length > 0) {
    const idsToDelete = modifiableAssignments.map((a) => a.id);
    await supabase
      .from('shift_assignments')
      .delete()
      .in('id', idsToDelete);
  }

  // 10. Insert new assignments
  if (optimized.assignments.length > 0) {
    const toInsert = optimized.assignments.map((a) => ({
      personnel_id: a.personnel_id,
      shift_id: a.shift_id,
      date: a.date,
      area_id: a.area_id,
      position_id: a.position_id,
      status: 'scheduled',
      is_locked: false,
      is_manual: false,
      frozen_by_rule: false,
      original_shift_id: a.shift_id,
    }));

    await supabase.from('shift_assignments').insert(toInsert);
  }

  // Build result
  const totalSlots = (requirements || []).reduce(
    (sum, r) => sum + r.required_count,
    0
  );
  const filledSlots =
    protectedAssignments.length + optimized.assignments.length;

  return {
    assignments: optimized.assignments,
    violations: greedy.violations,
    diagnosticLogs: greedy.diagnosticLogs,
    coverage: totalSlots > 0 ? (filledSlots / totalSlots) : 1,
    count: optimized.assignments.length,
    stats: {
      total_slots: totalSlots,
      filled_slots: filledSlots,
      coverage_percent:
        totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 100,
      recalculated_count: optimized.assignments.length,
    },
  };
}
