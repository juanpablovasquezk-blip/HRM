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
  startDate: string,
  endDate: string,
  areaId?: string
): Promise<ScheduleResult> {
  console.log(`[AI] Iniciando generación: ${startDate} al ${endDate}`);
  const supabase = createAdminClient();

  const extendedStart = format(startOfMonth(parseISO(startDate)), 'yyyy-MM-dd');
  const extendedEnd = format(endOfMonth(parseISO(endDate)), 'yyyy-MM-dd');

  console.log(`[AI] Cargando contexto extendido (Mes): ${extendedStart} - ${extendedEnd}`);

  // LABORATORIO AISLADO: 20 y 21 de Abril
  const labStart = '2026-04-20';
  const labEnd = '2026-04-21';

  let reqQuery = supabase
    .from('shift_requirements')
    .select('*, shift:shifts(name, start_time, end_time, duration_hours), area:areas(name), position:positions(name)')
    .gte('date', labStart)
    .lte('date', labEnd);

  const { data: rawRequirements } = await reqQuery;

  // Solo Supervisión y Grúas
  const requirements = (rawRequirements || []).filter(r => {
    const name = (r.position as any)?.name?.toUpperCase() || '';
    return name.includes('SUPERVISOR') || name.includes('GRÚA') || name.includes('HORQUILLA');
  });
  
  console.log(`[AI-LAB] Requerimientos cargados: ${requirements.length}`);
  
  const { data: personnelRaw } = await supabase.from('personnel').select('*');
  const { data: positions } = await supabase.from('positions').select('*');
  const { data: allShifts } = await supabase.from('shifts').select('*');

  const personnel = (personnelRaw || [])
    .map(p => ({
      ...p,
      main_position_obj: (positions || []).find(pos => pos.id === p.main_position),
      fixed_shift_obj: (allShifts || []).find(s => s.id === p.fixed_shift_id)
    }))
    .filter(p => {
       const pName = (p.main_position_obj as any)?.name?.toUpperCase() || '';
       return pName.includes('SUPERVISOR') || pName.includes('GRÚA') || pName.includes('HORQUILLA');
    });

  console.log(`[AI-LAB] Personal cargado: ${personnel.length}`);

  let assignQuery = supabase
    .from('shift_assignments')
    .select('*, shift:shifts(name, start_time, end_time, duration_hours)')
    .gte('date', labStart)
    .lte('date', labEnd);

  const { data: existingAssignments } = await assignQuery;

  const { data: leaves } = await supabase
    .from('leaves')
    .select('*')
    .eq('status', 'approved')
    .lte('start_date', labEnd)
    .gte('end_date', labStart);

  console.log(`[AI-LAB] Iniciando con ${requirements.length} slots y ${personnel.length} personas.`);

  const protectedAssignments = (existingAssignments || []).filter(
    (a) => a.is_locked || a.is_manual || a.frozen_by_rule || isShiftFrozen(a.date)
  );

  const slots: ShiftSlot[] = (requirements || []).map((req) => {
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
      fixed_shift_name: (p.fixed_shift_obj as any)?.name,
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

  console.log(`[AI] Entrando a Greedy Assign...`);
  const greedy = greedyAssign(slots, personnelAvailability, existingForConstraints);
  console.log(`[AI] Asignaciones iniciales listas: ${greedy.assignments.length}`);

  console.log(`[AI] Entrando a Optimizador (Swaps)...`);
  const optimized = optimizeAssignments(greedy.assignments, personnelAvailability, slots);
  console.log(`[AI] Optimización terminada.`);

  if (optimized.assignments.length > 0) {
    const nonProtectedIds = (existingAssignments || [])
      .filter((a) => !a.is_locked && !a.is_manual && !a.frozen_by_rule && !isShiftFrozen(a.date))
      .map((a) => a.id);

    if (nonProtectedIds.length > 0) {
      await supabase.from('shift_assignments').delete().in('id', nonProtectedIds);
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

    console.log(`[AI-SAVE] Preparando para insertar ${toInsert.length} turnos.`);
    if (toInsert.length > 0) {
       // Debug de nombres
       const names = toInsert.map(i => {
         const p = personnelAvailability.find(pa => pa.personnel_id === i.personnel_id);
         return `${p?.first_name} (${i.date})`;
       });
       console.log(`[AI-SAVE] Lista de asignación:`, names.join(', '));
    }

    const { error: insertError } = await supabase.from('shift_assignments').insert(toInsert);
    
    if (insertError) {
      console.error(`[AI-ERROR] Error crítico al insertar:`, insertError);
    } else {
      console.log(`[AI-SAVE] ¡Inserción completada con éxito!`);
    }
  } else {
    console.log(`[AI-SAVE] No hay nuevas asignaciones para insertar.`);
  }

  const totalSlots = (requirements || []).reduce((sum, r) => sum + r.required_count, 0);
  const filledSlots = protectedAssignments.length + optimized.assignments.length;

  return {
    assignments: optimized.assignments,
    violations: greedy.violations,
    stats: {
      total_slots: totalSlots,
      filled_slots: filledSlots,
      coverage_percent: totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 100,
      recalculated_count: optimized.assignments.length,
    },
  };
}
