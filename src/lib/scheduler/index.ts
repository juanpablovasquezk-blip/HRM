/**
 * Scheduling Engine — Main Entry Point
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { greedyAssign } from './greedy-assign';
import { optimizeAssignments } from './optimizer';
import { isShiftFrozen } from './freeze';
import type { ScheduleResult, PersonnelAvailability, ShiftSlot } from './types';
import { eachDayOfInterval, parseISO, format, startOfMonth, endOfMonth, subDays, addDays } from 'date-fns';

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
  const supabase = createAdminClient();

  const startDate = parseISO(startDateStr);
  const endDate = parseISO(endDateStr);

  // Expand the search window by 7 days to cover boundary weeks for constraints
  const extendedStart = format(subDays(startDate, 7), 'yyyy-MM-dd');
  const extendedEnd = format(addDays(endDate, 7), 'yyyy-MM-dd');

  // 1. CARGA DE DATOS (ESTILO ESTABLE)
  const { data: rawRequirements } = await supabase
    .from('shift_requirements')
    .select('*, shift:shifts(name, start_time, end_time, duration_hours), area:areas(name), positions(name)')
    .gte('date', format(startDate, 'yyyy-MM-dd'))
    .lte('date', format(endDate, 'yyyy-MM-dd'));

  const { data: personnelRaw } = await supabase.from('personnel').select('*');
  const { data: positions } = await supabase.from('positions').select('*');
  const { data: allShifts } = await supabase.from('shifts').select('*');

  const { data: existingAssignments } = await supabase
    .from('shift_assignments')
    .select('*, shift:shifts(name, start_time, end_time, duration_hours)')
    .gte('date', extendedStart)
    .lte('date', extendedEnd);

  const { data: leaves } = await supabase
    .from('leaves')
    .select('*')
    .eq('status', 'approved')
    .lte('start_date', extendedEnd)
    .gte('end_date', extendedStart);

  const personnel = (personnelRaw || []).map(p => ({
    ...p,
    main_position_obj: (positions || []).find(pos => pos.id === p.main_position),
    fixed_shift_obj: (allShifts || []).find(s => s.id === p.fixed_shift_id)
  }));

  const protectedAssignments = (existingAssignments || []).filter(
    (a) => a.is_locked || a.is_manual || a.frozen_by_rule || isShiftFrozen(a.date)
  );

  const tStart = performance.now();

  const personnelAvailability: PersonnelAvailability[] = personnel.map((p) => {
    // 1. Calcular ADN de Rotación (Paridad estable)
    const hash = (p.id || '').split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
    const isTurnB = (hash % 2 !== 0);

    // 2. Calcular Fechas de Licencia
    const personLeaves = (leaves || []).filter((l) => l.personnel_id === p.id);
    const leaveDates = new Set<string>();
    
    personLeaves.forEach(l => {
      try {
        const lStart = parseISO(l.start_date);
        const lEnd = parseISO(l.end_date);
        const clipStart = lStart < startDate ? startDate : lStart;
        const clipEnd = lEnd > endDate ? endDate : lEnd;
        if (clipStart <= clipEnd) {
          const interval = eachDayOfInterval({ start: clipStart, end: clipEnd });
          interval.forEach(d => leaveDates.add(format(d, 'yyyy-MM-dd')));
        }
      } catch (e) {
        console.error(`[AI] Error en fechas de licencia para ${p.id}:`, l.start_date, l.end_date);
      }
    });

    return {
      personnel_id: p.id,
      first_name: p.first_name,
      birth_date: p.birth_date,
      main_position: p.main_position,
      main_position_name: (p.main_position_obj as any)?.name,
      secondary_positions: p.secondary_positions || [],
      prefers_night: p.prefers_night || false,
      avoids_night: p.avoids_night || false,
      fixed_shift_id: p.fixed_shift_id,
      fixed_shift_name: (p.fixed_shift_obj as any)?.name,
      rotation_pattern: p.rotation_pattern,
      has_special_contract: p.has_special_contract || false,
      weekly_hours: 0,
      days_off_count: 0,
      last_shift_end: null,
      assigned_dates: new Set(
        protectedAssignments
          .filter((a) => a.personnel_id === p.id)
          .map((a) => a.date)
      ),
      leave_dates: leaveDates,
      is_turn_b: isTurnB,
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

  try {
    const slots: ShiftSlot[] = (rawRequirements || []).map((req) => {
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
        position_name: (req.positions as any)?.name,
        area_name: (req.area as any)?.name,
        shift_name: (req.shift as any)?.name,
      };
    }).filter((s) => s.filled_count < s.required_count);

    const tData = performance.now();
    console.log(`[PERF] Datos preparados en ${(tData - tStart).toFixed(0)}ms. Slots a cubrir: ${slots.length}`);

    // 4. RUN AI ENGINE
    const result = greedyAssign(slots, personnelAvailability, existingForConstraints);
    const tGreedy = performance.now();
    const coverageInt = slots.length > 0 ? Math.round((result.assignments.length / slots.length) * 100) : 100;
    console.log(`[PERF] Motor Greedy completado en ${(tGreedy - tData).toFixed(0)}ms (Cobertura en este pase: ${coverageInt}%)`);

    const optimized = optimizeAssignments(result.assignments, personnelAvailability, slots);
    const tOptim = performance.now();

    // 6. SAVE RESULTS
    const supabaseAdmin = createAdminClient();
    const nonProtectedIds = (existingAssignments || [])
      .filter((a) => !a.is_locked && !a.is_manual && !a.frozen_by_rule && !isShiftFrozen(a.date))
      .map((a) => a.id);

    if (nonProtectedIds.length > 0) {
      const { error: delErr } = await supabaseAdmin.from('shift_assignments').delete().in('id', nonProtectedIds);
      if (delErr) throw new Error(`Failed to clear old assignments: ${delErr.message}`);
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

    if (toInsert.length > 0) {
      const CHUNK_SIZE = 50;
      for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
        const chunk = toInsert.slice(i, i + CHUNK_SIZE);
        let retries = 3;
        let success = false;

        while (retries > 0 && !success) {
          try {
            const { error: insErr } = await supabaseAdmin.from('shift_assignments').insert(chunk);
            if (insErr) throw insErr;
            success = true;
          } catch (err: any) {
            retries--;
            console.warn(`[RETRY] Error guardando bloque ${i/CHUNK_SIZE + 1}. Reintentos restantes: ${retries}. Error: ${err.message || err}`);
            if (retries === 0) throw new Error(`DB Error: No se pudo guardar el bloque ${i/CHUNK_SIZE + 1}: ${err.message || err}`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1s antes de reintentar
          }
        }
      }
    }

    const tFinal = performance.now();
    const executionTimeMs = tFinal - tStart;
    console.log(`[PERF] Guardado completado en ${(tFinal - tOptim).toFixed(0)}ms. Total Turnos: ${toInsert.length}`);

    const totalSlots = (rawRequirements || []).reduce((sum, r) => sum + r.required_count, 0);
    const totalFilled = protectedAssignments.length + optimized.assignments.length;
    const finalCoverage = totalSlots > 0 ? Math.round((totalFilled / totalSlots) * 100) : 0;

    return {
      assignments: optimized.assignments,
      coverage: finalCoverage,
      count: optimized.assignments.length, // Turnos nuevos creados
      stats: {
        total_slots: totalSlots,
        filled_slots: totalFilled,
        coverage_percent: finalCoverage,
        recalculated_count: optimized.assignments.length,
        execution_time_ms: executionTimeMs
      }
    };
  } catch (error) {
    console.error('[SCHEDULER-ERROR]', error);
    throw error;
  }
}



