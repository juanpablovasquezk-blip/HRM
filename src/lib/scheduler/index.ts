/**
 * Scheduling Engine — Main Entry Point
 *
 * Orchestrates the full scheduling pipeline:
 * 1. Data preparation
 * 2. Greedy assignment
 * 3. Constraint validation
 * 4. Optimization (swap logic)
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { greedyAssign } from './greedy-assign';
import { optimizeAssignments } from './optimizer';
import { isShiftFrozen } from './freeze';
import type { ScheduleResult, PersonnelAvailability, ShiftSlot } from './types';
import { eachDayOfInterval, parseISO, format } from 'date-fns';

export { partialRecalculate } from './partial-recalc';
export { isShiftFrozen, canOverrideFreeze, canModifyAssignment, getFreezeStatus } from './freeze';
export { validateAllConstraints } from './constraints';
export { rankCandidates } from './candidates';
export type * from './types';

/**
 * Generate a full schedule for a given date range
 */
export async function generateSchedule(
  startDate: string,
  endDate: string,
  areaId?: string
): Promise<ScheduleResult> {
  const supabase = createAdminClient();

  // 1. Load requirements
  let reqQuery = supabase
    .from('shift_requirements')
    .select('*, shift:shifts(start_time, end_time, duration_hours)')
    .gte('date', startDate)
    .lte('date', endDate);

  if (areaId) reqQuery = reqQuery.eq('area_id', areaId);

  const { data: requirements } = await reqQuery;

  // 2. Load existing assignments (locked, manual, frozen)
  let assignQuery = supabase
    .from('shift_assignments')
    .select('*, shift:shifts(start_time, end_time, duration_hours)')
    .gte('date', startDate)
    .lte('date', endDate);

  if (areaId) assignQuery = assignQuery.eq('area_id', areaId);

  const { data: existingAssignments } = await assignQuery;

  // 3. Load personnel
  const { data: personnel } = await supabase
    .from('personnel')
    .select('*')
    .eq('is_active', true);

  // 4. Load approved leaves
  const { data: leaves } = await supabase
    .from('leaves')
    .select('*')
    .eq('status', 'approved')
    .lte('start_date', endDate)
    .gte('end_date', startDate);

  // 5. Build slots
  const protectedAssignments = (existingAssignments || []).filter(
    (a) => a.is_locked || a.is_manual || a.frozen_by_rule || isShiftFrozen(a.date)
  );

  const slots: ShiftSlot[] = (requirements || []).map((req) => {
    const shift = req.shift as { start_time: string; end_time: string; duration_hours: number } | null;
    const filled = protectedAssignments.filter(
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
      filled_count: filled,
    };
  }).filter((s) => s.filled_count < s.required_count);

  // 6. Build personnel availability
  const dates = eachDayOfInterval({
    start: parseISO(startDate),
    end: parseISO(endDate),
  });

  const personnelAvailability: PersonnelAvailability[] = (personnel || []).map((p) => {
    const personLeaves = (leaves || []).filter((l) => l.personnel_id === p.id);
    const isOnLeave = personLeaves.some((l) =>
      dates.some((d) => {
        const dateStr = format(d, 'yyyy-MM-dd');
        return dateStr >= l.start_date && dateStr <= l.end_date;
      })
    );

    const protectedForPerson = protectedAssignments.filter(
      (a) => a.personnel_id === p.id
    );

    return {
      personnel_id: p.id,
      birth_date: p.birth_date,
      main_position: p.main_position,
      secondary_positions: p.secondary_positions || [],
      prefers_night: p.prefers_night,
      avoids_night: p.avoids_night,
      weekly_hours: protectedForPerson.reduce((sum, a) => {
        const shift = a.shift as { duration_hours: number } | null;
        return sum + (shift?.duration_hours || 0);
      }, 0),
      days_off_count: 0,
      last_shift_end: null,
      assigned_dates: new Set(protectedForPerson.map((a) => a.date)),
      is_on_leave: isOnLeave,
    };
  });

  // 7. Run greedy algorithm
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

  const greedy = greedyAssign(slots, personnelAvailability, existingForConstraints);

  // 8. Optimize
  const optimized = optimizeAssignments(
    greedy.assignments,
    personnelAvailability,
    slots
  );

  // 9. Save to database (non-conflicting upsert)
  if (optimized.assignments.length > 0) {
    // Delete old non-protected assignments in range
    const nonProtectedIds = (existingAssignments || [])
      .filter((a) => !a.is_locked && !a.is_manual && !a.frozen_by_rule && !isShiftFrozen(a.date))
      .map((a) => a.id);

    if (nonProtectedIds.length > 0) {
      await supabase
        .from('shift_assignments')
        .delete()
        .in('id', nonProtectedIds);
    }

    // Insert new assignments
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
    }));

    await supabase.from('shift_assignments').insert(toInsert);
  }

  // Build stats
  const totalSlots = (requirements || []).reduce(
    (sum, r) => sum + r.required_count,
    0
  );
  const filledSlots =
    protectedAssignments.length + optimized.assignments.length;

  return {
    assignments: optimized.assignments,
    violations: greedy.violations,
    stats: {
      total_slots: totalSlots,
      filled_slots: filledSlots,
      coverage_percent:
        totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 100,
      recalculated_count: optimized.assignments.length,
    },
  };
}
