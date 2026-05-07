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
  areaId?: string,
  personnelIds?: string[],
  positionFilter?: string,
  shouldValidate: boolean = false
): Promise<ScheduleResult> {
  const dbLogs: string[] = [];
  try {
    // [AI] Forcing compilation to bust Next.js module cache (v2)
  const supabase = createAdminClient();

  const startDate = parseISO(startDateStr);
  const endDate = parseISO(endDateStr);

  // Expand the search window by 7 days to cover boundary weeks for constraints
  const extendedStart = format(subDays(startDate, 7), 'yyyy-MM-dd');
  const extendedEnd = format(addDays(endDate, 7), 'yyyy-MM-dd');

  // 1. CARGA DE DATOS (ESTILO ESTABLE)
  let targetPositionId: string | undefined;
  
  if (positionFilter && positionFilter !== 'none') {
    const cleanFilter = positionFilter.trim();
    // Búsqueda ultra-flexible para evitar fallos de tildes o espacios
    const { data: posData } = await supabase.from('positions')
      .select('id')
      .or(`name.ilike.%${cleanFilter}%,name.ilike.%${cleanFilter.split(' ').join('%')}%`)
      .limit(1)
      .maybeSingle();
    
    if (posData) {
      targetPositionId = posData.id;
    }
  }

  let reqQuery = supabase
    .from('shift_requirements')
    .select('*, shift:shifts(name, start_time, end_time, duration_hours), area:areas(name), positions(name)')
    .gte('date', format(startDate, 'yyyy-MM-dd'))
    .lte('date', format(endDate, 'yyyy-MM-dd'));

  if (targetPositionId) {
    dbLogs.push(`[DEBUG] Cargo encontrado: ${targetPositionId}`);
    reqQuery = reqQuery.eq('position_id', targetPositionId);
  }
  
  if (areaId && areaId !== 'all') {
    reqQuery = reqQuery.eq('area_id', areaId);
  }

  const { data: rawRequirements } = await reqQuery;
  dbLogs.push(`[DEBUG] Requerimientos cargados: ${rawRequirements?.length || 0}`);

  const { data: personnelRaw } = await supabase.from('personnel').select('*');
  const { data: positions } = await supabase.from('positions').select('*');
  
  // 1. Intentar por ID exacto
  let filteredPersonnel = (personnelRaw || []).filter(p => {
    if (!targetPositionId) return true;
    return String(p.main_position) === String(targetPositionId);
  });

  // 2. Si falló, intentar por NOMBRE del cargo (Salvavidas)
  if (filteredPersonnel.length === 0 && targetPositionId) {
    const targetPos = (positions || []).find(pos => pos.id === targetPositionId);
    if (targetPos) {
       filteredPersonnel = (personnelRaw || []).filter(p => {
         const pPos = (positions || []).find(pos => pos.id === p.main_position);
         return pPos && pPos.name === targetPos.name;
       });
    }
  }

  const personnelCount = filteredPersonnel.length;
  dbLogs.push(`[DEBUG] Personal final para procesar: ${personnelCount}`);
  
  if (personnelCount === 0 && targetPositionId) {
    return {
      assignments: [],
      coverage: 0,
      count: 0,
      diagnosticLogs: [...dbLogs, "ERROR: No hay personal disponible para este cargo."],
      stats: { total_slots: 0, filled_slots: 0, coverage_percent: 0, recalculated_count: 0, execution_time_ms: 0 }
    };
  }

  // Unir en memoria
  let personnelWithPositions = filteredPersonnel.map(p => ({
    ...p,
    main_position_obj: (positions || []).find(pos => pos.id === p.main_position)
  }));

  // Aplicar filtro de IDs seleccionados si existe
  if (personnelIds && personnelIds.length > 0) {
    personnelWithPositions = personnelWithPositions.filter(p => personnelIds.includes(p.id));
  }
  
  const { data: allShifts } = await supabase.from('shifts').select('*');

  const { data: existingAssignments, error: dbErr } = await supabase
    .from('shift_assignments')
    .select('*, shift:shifts!shift_id(name, start_time, end_time, duration_hours), area:areas(name)')
    .gte('date', extendedStart)
    .lte('date', extendedEnd);

  if (dbErr) {
    dbLogs.push(`[DB-ERROR] Fallo al consultar shift_assignments: ${dbErr.message}`);
  }
  
  dbLogs.push(`[DB-AUDIT] Buscando entre ${extendedStart} y ${extendedEnd}`);
  dbLogs.push(`[DB-AUDIT] Registros crudos devueltos por DB: ${existingAssignments?.length || 0}`);
  
  // ID logs movidos abajo

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
    (a) => a.is_locked || a.is_manual || a.frozen_by_rule || a.is_validated || isShiftFrozen(a.date)
  );

  const normalizeDate = (d: string | null | undefined): string => {
    if (!d) return '';
    const clean = d.split('T')[0];
    if (clean.includes('-')) {
      const parts = clean.split('-');
      if (parts[0].length === 2 && parts[2].length === 4) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
    return clean;
  };

  const allAssignmentsForState = (existingAssignments || []).map(a => {
    const shift = a.shift as any;
    const area = (a as any).area?.name || 'Area Desconocida';
    return {
      ...a,
      date: normalizeDate(a.date),
      info: `${shift?.name || 'Turno'} en ${area}`
    };
  });

  // Historial completo se calculará más abajo con normalización de fechas

  const tStart = performance.now();

  const personnelAvailability: PersonnelAvailability[] = (personnelWithPositions || []).map(p => {
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

    const hasManualNight = protectedAssignments.some(a => {
      if (a.personnel_id !== p.id) return false;
      const shift = a.shift as any;
      const startHour = parseInt((shift?.start_time || '08:00').split(':')[0], 10);
      return startHour >= 20 || startHour <= 6;
    });

    return {
      personnel_id: p.id,
      first_name: p.first_name,
      birth_date: p.birth_date,
      main_position: p.main_position,
      main_position_name: (p.main_position_obj as any)?.name,
      secondary_positions: p.secondary_positions || [],
      prefers_night: p.prefers_night || hasManualNight || (p.rotation_pattern || '').toUpperCase().includes('NOCHE'),
      avoids_night: p.avoids_night || false,
      fixed_shift_id: p.fixed_shift_id,
      fixed_shift_name: (p.fixed_shift_obj as any)?.name,
      rotation_pattern: p.rotation_pattern,
      has_special_contract: p.has_special_contract || false,
      hire_date: p.hire_date,
      termination_date: p.termination_date,
      weekly_hours: 0,
      days_off_count: 0,
      last_shift_end: null,
      assigned_dates: new Set(
        allAssignmentsForState
          .filter((a) => a.personnel_id === p.id)
          .map((a) => a.date)
      ),
      leave_dates: leaveDates,
      area_id: (p.main_position_obj as any)?.area_id || '',
      is_turn_b: isTurnB,
    };
  });

  // We must include ALL existing assignments for the constraint engine, 
  // especially past ones from the lookback window, regardless of whether they are protected.
  const existingForConstraints = (existingAssignments || []).map((a) => {
    const shift = a.shift as any;
    return {
      personnel_id: a.personnel_id,
      date: normalizeDate(a.date),
      duration_hours: shift?.duration_hours || 8,
      shift_start: shift?.start_time || '00:00',
      shift_end: shift?.end_time || '00:00',
    };
  });

    const slots: ShiftSlot[] = (rawRequirements || []).map((req) => {
      const shift = req.shift as any;
      // We only count protected assignments as "already filled" for the current run
      const filled = protectedAssignments.filter(
        (a) => a.date === req.date && a.shift_id === req.shift_id && a.area_id === req.area_id && a.position_id === req.position_id
      ).length;

      return {
        requirement_id: req.id,
        date: (req.date || '').split('T')[0],
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
    }).filter((s) => {
      // FORZAR: No filtrar NUNCA los slots de Aeropuerto para que la matemática 4x4 vea el historial completo
      if ((s.position_name || '').toUpperCase().includes('AEROPUERTO')) return true;
      return s.filled_count < s.required_count;
    });

    // 4. SORT SLOTS (Prioritize weekends for Aeropuerto to ensure fair rotation)
    const sortedSlots = [...slots].sort((a, b) => {
      const isSpecialA = (a.position_name || '').toUpperCase().includes('AEROPUERTO') || 
                         (a.position_name || '').toUpperCase().includes('DHL') || 
                         (a.position_name || '').toUpperCase().includes('FEDEX');
      const isSpecialB = (b.position_name || '').toUpperCase().includes('AEROPUERTO') || 
                         (b.position_name || '').toUpperCase().includes('DHL') || 
                         (b.position_name || '').toUpperCase().includes('FEDEX');
      
      // If both are special roles, prioritize weekends
      if (isSpecialA && isSpecialB) {
        const dateA = parseISO(a.date);
        const dateB = parseISO(b.date);
        const isWeekendA = dateA.getDay() === 0 || dateA.getDay() === 6;
        const isWeekendB = dateB.getDay() === 0 || dateB.getDay() === 6;
        
        if (isWeekendA && !isWeekendB) return -1;
        if (!isWeekendA && isWeekendB) return 1;
        return a.date.localeCompare(b.date);
      }
      
      // If only one is special, put it first (optional, but keeps logic grouped)
      if (isSpecialA && !isSpecialB) return -1;
      if (!isSpecialA && isSpecialB) return 1;
      
      // Otherwise, keep chronological order (Standard)
      return a.date.localeCompare(b.date);
    });

    const tData = performance.now();
    console.log(`[PERF] Datos preparados en ${(tData - tStart).toFixed(0)}ms. Slots a cubrir: ${sortedSlots.length}`);

    // 5. RUN AI ENGINE
    const result = greedyAssign(
      sortedSlots, 
      personnelAvailability, 
      existingForConstraints, 
      startDateStr,
      endDateStr,
      allShifts || []
    );
    const tGreedy = performance.now();
    const coverageInt = slots.length > 0 ? Math.round((result.assignments.length / slots.length) * 100) : 100;
    console.log(`[PERF] Motor Greedy completado en ${(tGreedy - tData).toFixed(0)}ms (Cobertura en este pase: ${coverageInt}%)`);

    const optimized = optimizeAssignments(result.assignments, personnelAvailability, slots);
    const tOptim = performance.now();

    // 6. SAVE RESULTS
    const supabaseAdmin = createAdminClient();
    
    // Si personnelIds viene como array (aunque esté vacío), respetamos ese filtro estrictamente
    const hasFilter = Array.isArray(personnelIds);
    const targetIds = hasFilter ? personnelIds : personnel.map(p => p.id);

    const nonProtectedIds = (existingAssignments || [])
      .filter((a) => {
        const isInRange = a.date >= startDateStr && a.date <= endDateStr;
        // Solo es persona objetivo si no hay filtro o si está en el filtro
        const isTargetPerson = hasFilter ? personnelIds.includes(a.personnel_id) : true;
        
        // Borramos SOLO lo que no sea oficial (ni validado ni publicado) de las personas objetivo
        return isInRange && isTargetPerson && !a.is_validated && !a.is_published;
      })
      .map((a) => a.id);

    if (nonProtectedIds.length > 0) {
      const DELETE_CHUNK_SIZE = 100;
      for (let i = 0; i < nonProtectedIds.length; i += DELETE_CHUNK_SIZE) {
        const chunk = nonProtectedIds.slice(i, i + DELETE_CHUNK_SIZE);
        const { error: delErr } = await supabaseAdmin.from('shift_assignments').delete().in('id', chunk);
        if (delErr) throw new Error(`Failed to clear old assignments chunk: ${delErr.message}`);
      }
    }

    // NEW: If we are publishing, officialize EVERYTHING already in the range for these people
    if (shouldValidate) {
      const { error: pubErr } = await supabaseAdmin
        .from('shift_assignments')
        .update({ is_validated: true, is_published: true, is_confirmed: true })
        .gte('date', startDateStr)
        .lte('date', endDateStr)
        .in('personnel_id', targetIds);
      
      if (pubErr) {
        console.error('[PUBLISH-ERROR] Failed to officialize existing assignments:', pubErr.message);
      } else {
        dbLogs.push(`[PUBLISH] Sincronizados turnos existentes como oficiales.`);
      }
    }

    const toInsertRaw = optimized.assignments.map((a) => ({
      personnel_id: a.personnel_id,
      shift_id: a.shift_id,
      date: a.date,
      area_id: a.area_id,
      position_id: a.position_id,
      status: 'scheduled',
      is_locked: false,
      is_manual: false,
      is_confirmed: shouldValidate,
      is_validated: shouldValidate,
      is_published: shouldValidate,
      frozen_by_rule: false,
      original_shift_id: a.shift_id,
    }));

    // DE-DUPLICATE: Ensure we don't try to insert the same person/date/shift twice
    const seen = new Set<string>();
    const toInsert = toInsertRaw.filter(a => {
      const key = `${a.personnel_id}-${a.date}-${a.shift_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (toInsert.length > 0) {
      const CHUNK_SIZE = 50;
      for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
        const chunk = toInsert.slice(i, i + CHUNK_SIZE);
        let retries = 3;
        let success = false;

        while (retries > 0 && !success) {
          try {
            const { error: insErr } = await supabaseAdmin
              .from('shift_assignments')
              .upsert(chunk, { 
                onConflict: 'personnel_id,date,shift_id',
                ignoreDuplicates: false 
              });
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
    
    // Simplificar conteo: Solo ver si el día tiene asignaciones para ese cargo
    let totalFilled = 0;
    const finalAllAssignments = [...(allAssignmentsForState || []), ...optimized.assignments];
    
    (rawRequirements || []).forEach(req => {
      const dayStr = (req.date || '').split('T')[0];
      const matching = finalAllAssignments.filter(a => 
        a.date === dayStr && 
        String(a.position_id) === String(req.position_id)
      ).length;
      totalFilled += Math.min(matching, req.required_count);
    });

    const finalCoverage = totalSlots > 0 ? Math.round((totalFilled / totalSlots) * 100) : 100;
    
    // SI EL RESULTADO ES 0, DEVOLVER UN ERROR CON LOS LOGS PARA SABER QUÉ PASA
    if (totalSlots > 0 && totalFilled === 0 && optimized.assignments.length === 0) {
      return {
        assignments: [],
        coverage: 0,
        count: 0,
        diagnosticLogs: dbLogs,
        error: `Error: No se generó cobertura. Logs: ${dbLogs.slice(-5).join(' | ')}`
      };
    }

    dbLogs.push(`[FINAL-STATS] Slots: ${totalSlots}, Filled: ${totalFilled}, %: ${finalCoverage}`);

    return {
      assignments: optimized.assignments,
      coverage: finalCoverage,
      count: optimized.assignments.length,
      diagnosticLogs: dbLogs,
      stats: {
        total_slots: totalSlots,
        filled_slots: totalFilled,
        coverage_percent: finalCoverage,
        recalculated_count: optimized.assignments.length,
        execution_time_ms: executionTimeMs
      }
    };
  } catch (error: any) {
    console.error('[SCHEDULER-ERROR]', error);
    return {
      assignments: [],
      coverage: 0,
      count: 0,
      diagnosticLogs: [...dbLogs, `[FATAL-ENGINE] ${error.message || error}`],
      stats: {
        total_slots: 0,
        filled_slots: 0,
        coverage_percent: 0,
        recalculated_count: 0,
        execution_time_ms: 0
      }
    };
  }
}



