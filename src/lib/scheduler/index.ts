/**
 * Scheduling Engine — Main Entry Point
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { greedyAssign } from './greedy-assign';
import { optimizeAssignments } from './optimizer';
import { isShiftFrozen } from './freeze';
import type { ScheduleResult, PersonnelAvailability, ShiftSlot } from './types';
import { eachDayOfInterval, parseISO, format, startOfMonth, endOfMonth } from 'date-fns';

export { partialRecalculate } from './partial-recalc';
export { isShiftFrozen, canOverrideFreeze, canModifyAssignment, getFreezeStatus } from './freeze';
export { validateAllConstraints } from './constraints';
export { rankCandidates } from './candidates';
export type * from './types';

export async function generateSchedule(
  startDateStr: string,
  endDateStr: string,
  areaId?: string
): Promise<ScheduleResult> {
  console.log(`[AI-DEBUG] Iniciando generación: ${startDateStr} al ${endDateStr}`);
  const supabase = createAdminClient();

  const startDate = parseISO(startDateStr);
  const endDate = parseISO(endDateStr);

  // 1. Fetch data
  const { data: personnelRaw, error: pErr } = await supabase
    .from('personnel')
    .select('*, main_position_obj:positions!personnel_main_position_fkey(*)')
    .is('termination_date', null);
  
  if (pErr) console.error('[AI-DEBUG] Error personal:', pErr);

  const { data: requirements, error: rErr } = await supabase
    .from('shift_requirements')
    .select('*, shift:shifts(*), area:areas(*), position:positions(*)')
    .gte('date', format(startDate, 'yyyy-MM-dd'))
    .lte('date', format(endDate, 'yyyy-MM-dd'));

  if (rErr) console.error('[AI-DEBUG] Error reqs:', rErr);
  console.log(`[AI-DEBUG] Requerimientos brutos: ${requirements?.length || 0}`);

  const { data: existingAssignments } = await supabase
    .from('shift_assignments')
    .select('*, shift:shifts(*)')
    .gte('date', format(startDate, 'yyyy-MM-dd'))
    .lte('date', format(endDate, 'yyyy-MM-dd'));

  console.log(`[AI-DEBUG] Asignaciones existentes: ${existingAssignments?.length || 0}`);

  const { data: leaves } = await supabase
    .from('leaves')
    .select('*')
    .eq('status', 'approved')
    .lte('start_date', format(endDate, 'yyyy-MM-dd'))
    .gte('end_date', format(startDate, 'yyyy-MM-dd'));

  const { data: allShifts } = await supabase.from('shifts').select('*');

  const personnel = (personnelRaw || []).map(p => ({
    ...p,
    fixed_shift_obj: (allShifts || []).find(s => s.id === p.fixed_shift_id)
  }));

  console.log(`[AI-DEBUG] Empleados cargados: ${personnel.length}`);

  const protectedAssignments = (existingAssignments || []).filter(
    (a) => a.is_locked || a.is_manual || a.frozen_by_rule || isShiftFrozen(a.date)
  );

  console.log(`[AI-DEBUG] Asignaciones protegidas: ${protectedAssignments.length}`);

  const slots = (requirements || []).map((req) => {
    const shift = req.shift as any;
    const filled = protectedAssignments.filter(
      (a) => a.date === req.date && a.shift_id === req.shift_id && a.area_id === req.area_id && a.position_id === req.position_id
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
      position_name: (req.position as any)?.name,
      area_name: (req.area as any)?.name,
      shift_name: (req.shift as any)?.name,
    };
  }).filter((s) => s.filled_count < s.required_count);

  console.log(`[AI-DEBUG] Slots finales por llenar: ${slots.length}`);

  if (slots.length === 0) {
    console.warn('[AI-DEBUG] !ATENCIÓN! No hay slots para llenar. Verificando requerimientos...');
    if (requirements && requirements.length > 0) {
       const first = requirements[0];
       console.log(`[AI-DEBUG] Ejemplo req: ID=${first.id}, PosID=${first.position_id}, Count=${first.required_count}`);
    }
  }

  const personnelAvailability: PersonnelAvailability[] = (personnel || []).map((p) => {
    const personLeaves = (leaves || []).filter((l) => l.personnel_id === p.id);
    const leaveDates = new Set<string>();
    personLeaves.forEach(l => {
      try {
        const interval = eachDayOfInterval({ start: parseISO(l.start_date), end: parseISO(l.end_date) });
        interval.forEach(d => leaveDates.add(format(d, 'yyyy-MM-dd')));
      } catch (e) {
        console.error(`[AI-DEBUG] Error en fechas de licencia para ${p.id}:`, l.start_date, l.end_date);
      }
    });

    const protectedForPerson = protectedAssignments.filter(a => a.personnel_id === p.id);

    return {
      personnel_id: p.id,
      first_name: p.first_name,
      birth_date: p.birth_date,
      main_position: p.main_position,
      main_position_obj: p.main_position_obj,
      main_position_name: (p.main_position_obj as any)?.name,
      secondary_positions: p.secondary_positions || [],
      prefers_night: p.prefers_night,
      avoids_night: p.avoids_night,
      fixed_shift_id: p.fixed_shift_id,
      fixed_shift_name: (p.fixed_shift_obj as any)?.name || (p as any).fixed_shift_name,
      rotation_pattern: p.rotation_pattern,
      has_special_contract: p.has_special_contract || false,
      weekly_hours: protectedForPerson.reduce((sum, a) => sum + ((a.shift as any)?.duration_hours || 0), 0),
      days_off_count: 0,
      last_shift_end: null,
      assigned_dates: new Set(protectedForPerson.map((a) => a.date)),
      leave_dates: leaveDates,
    };
  });

  const existingForConstraints = protectedAssignments.map((a) => {
    const shift = a.shift as any;
    return {
      personnel_id: a.personnel_id,
      date: a.date,
      duration_hours: shift?.duration_hours || 8,
      shift_start: shift?.start_time || '00:00',
      shift_end: shift?.end_time || '00:00',
    };
  });

  console.log(`[AI-DEBUG] Entrando a Greedy Assign con ${slots.length} slots...`);
  const greedy = greedyAssign(slots, personnelAvailability, existingForConstraints);
  console.log(`[AI-DEBUG] Asignaciones greedy: ${greedy.assignments.length}`);
  
  const optimized = optimizeAssignments(greedy.assignments, personnelAvailability, slots);
  console.log(`[AI-DEBUG] Asignaciones optimizadas: ${optimized.assignments.length}`);

  const supabaseAdmin = createAdminClient();
  if (optimized.assignments.length > 0) {
    const nonProtectedIds = (existingAssignments || [])
      .filter((a) => !a.is_locked && !a.is_manual && !a.frozen_by_rule && !isShiftFrozen(a.date))
      .map((a) => a.id);

    if (nonProtectedIds.length > 0) {
      await supabaseAdmin.from('shift_assignments').delete().in('id', nonProtectedIds);
    }

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

    await supabaseAdmin.from('shift_assignments').insert(toInsert);
  }

  const totalSlots = (requirements || []).reduce((sum, r) => sum + r.required_count, 0);
  const filledSlots = protectedAssignments.length + optimized.assignments.length;
  const coverage = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;

  return {
    assignments: optimized.assignments,
    coverage,
    count: filledSlots,
    stats: {
      total_slots: totalSlots,
      filled_slots: filledSlots,
      coverage_percent: coverage,
      recalculated_count: 0
    }
  };
}
