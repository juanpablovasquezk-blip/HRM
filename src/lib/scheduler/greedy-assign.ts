/**
 * Greedy Assignment Algorithm
 *
 * Phase 2 of the scheduling engine.
 * Sorts requirements by priority and difficulty.
 * For each requirement, picks the top-ranked candidate.
 */

import { rankCandidates } from './candidates';
import { validateAllConstraints, hasHardViolation, checkRotationPattern } from './constraints';
import { getSlotPriority, REINFORCEMENT_CONFIG } from './priorities';
import { parseISO, startOfWeek, endOfWeek, format, addDays, subDays, eachDayOfInterval } from 'date-fns';
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
  diagnosticLogs?: string[];
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
  }>,
  startDateStr?: string,
  endDateStr?: string,
  allShifts?: any[]
): GreedyResult {
  const assignments: AssignmentCandidate[] = [];
  const allViolations: ConstraintViolation[] = [];
  const unfilled: ShiftSlot[] = [];
  const diagnosticLogs: string[] = [];

  const log = (msg: string) => {
    diagnosticLogs.push(`[${new Date().toISOString().split('T')[1].split('.')[0]}] ${msg}`);
  };

  log(`!!! INICIANDO MOTOR IA !!!`);
  log(`Slots: ${slots.length}, Personal: ${personnelPool.length}`);
  
  const allSnames = (allShifts || []).map(s => s.name).join(' | ');
  log(`[CONFIG] Turnos en DB: ${allSnames}`);

  // INITIALIZE KEY SHIFT REFERENCES
  const reinforcementShift = allShifts?.find(s => normStr(s.name).includes('07:00') || normStr(s.name).includes('AM 07'));
  const pmShift = allShifts?.find(s => normStr(s.name).includes('13:30') || normStr(s.name).includes('PM 13'));
  const ns22Shift = allShifts?.find(s => normStr(s.name).includes('22:00') || normStr(s.name).includes('NS 22'));

  if (!reinforcementShift) log("⚠ Turno de REFUERZO (07:00) no encontrado.");
  if (!pmShift) log("⚠ Turno de TARDE (13:30) no encontrado.");
  if (!ns22Shift) log("⚠ Turno de NOCHE (22:00) no encontrado.");

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

  function normStr(str: string | undefined | null): string {
    return (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  }

  // PASS -2 (MOVED TO END)

  // =========================================================================
  // PASS -0.5: AIRPORT SPECIALISTS (ITALO/DEIMAR) PRIORITY - WEEKENDS FIRST
  // =========================================================================
  if (startDateStr && endDateStr && pmShift) {
    const specialists = personnelPool.filter(p => {
      const pName = (p.first_name || '').toUpperCase();
      return pName.includes('ITALO') || pName.includes('DEIMAR');
    });

    // Pasada 1: FINES DE SEMANA (Prioridad absoluta para cobertura)
    for (const p of specialists) {
      const state = personnelState.get(p.personnel_id)!;
      let simDate = parseISO(startDateStr);
      let endSim = parseISO(endDateStr);

      while (simDate <= endSim) {
        const dStr = format(simDate, 'yyyy-MM-dd');
        const dayOfWeek = simDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        if (isWeekend && !state.assignments.some(a => a.date === dStr) && !p.leave_dates.has(dStr)) {
          const slot = slots.find(s => s.date === dStr && s.shift_id === pmShift.id && (assignments.filter(a => a.date === s.date && a.shift_id === s.shift_id).length < s.required_count));
          
          if (slot) {
             const virtualSlot: ShiftSlot = { ...slot, requirement_id: `spec-wknd-${p.personnel_id}-${dStr}` };
             const violations = validateAllConstraints(p, virtualSlot, state.assignments);
             if (!hasHardViolation(violations)) {
                state.assignments.push({ date: dStr, duration_hours: virtualSlot.shift_duration_hours, shift_start: virtualSlot.shift_start, shift_end: virtualSlot.shift_end });
                assignments.push({ personnel_id: p.personnel_id, shift_id: pmShift.id, date: dStr, area_id: p.area_id, position_id: p.main_position, status: 'scheduled', is_locked: false, is_manual: false, frozen_by_rule: false });
             }
          }
        }
        simDate = addDays(simDate, 1);
      }
    }

    // Pasada 2: DÍAS DE SEMANA (Relleno hasta 5 días)
    for (const p of specialists) {
      const state = personnelState.get(p.personnel_id)!;
      let simDate = parseISO(startDateStr);
      let endSim = parseISO(endDateStr);

      while (simDate <= endSim) {
        const dStr = format(simDate, 'yyyy-MM-dd');
        const dayOfWeek = simDate.getDay();
        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

        const weekStart = startOfWeek(simDate, { weekStartsOn: 1 });
        const assignedInWeek = state.assignments.filter(a => {
          const d = parseISO(a.date);
          return d >= weekStart && d <= addDays(weekStart, 6);
        }).length;

        if (isWeekday && assignedInWeek < 5 && !state.assignments.some(a => a.date === dStr) && !p.leave_dates.has(dStr)) {
          const slot = slots.find(s => s.date === dStr && s.shift_id === pmShift.id && (assignments.filter(a => a.date === s.date && a.shift_id === s.shift_id).length < s.required_count));
          
          if (slot) {
             const virtualSlot: ShiftSlot = { ...slot, requirement_id: `spec-wd-${p.personnel_id}-${dStr}` };
             const violations = validateAllConstraints(p, virtualSlot, state.assignments);
             if (!hasHardViolation(violations)) {
                state.assignments.push({ date: dStr, duration_hours: virtualSlot.shift_duration_hours, shift_start: virtualSlot.shift_start, shift_end: virtualSlot.shift_end });
                assignments.push({ personnel_id: p.personnel_id, shift_id: pmShift.id, date: dStr, area_id: p.area_id, position_id: p.main_position, status: 'scheduled', is_locked: false, is_manual: false, frozen_by_rule: false });
             }
          }
        }
        simDate = addDays(simDate, 1);
      }
    }
  }

  // =========================================================================
  // PASS -1: EXPLICIT BLUE EXPRESS INJECTION
  // =========================================================================
  if (startDateStr && endDateStr && allShifts && allShifts.length > 0) {
    const shift08 = allShifts.find(s => s.id === 'ef6b7b41-1725-4bb7-ba77-6d9fb58ea034');
    const shift12 = allShifts.find(s => s.id === '2f486675-d704-46cd-87ea-4e7d02722385');
    const shift00 = allShifts.find(s => s.id === '2647633b-6e10-4c1a-bd39-35facb3409ac');
    
    let validBlueAreaId = slots.find(s => normStr(s.area_name).includes('BLUE'))?.area_id || '';

    if (validBlueAreaId) {
      const bluePersonnelList = personnelPool.filter(p => (p.rotation_pattern || '').toUpperCase().includes('BLUE_'));
      for (const p of bluePersonnelList) {
        let simDate = parseISO(startDateStr);
        let endSim = parseISO(endDateStr);
        const state = personnelState.get(p.personnel_id)!;
        
        while (simDate <= endSim) {
          const dStr = format(simDate, 'yyyy-MM-dd');
          
          // VALIDACIÓN DE CONTRATO (HIRE/TERMINATION)
          const isHired = !p.hire_date || dStr >= p.hire_date;
          const isTerminated = p.termination_date && dStr > p.termination_date;

          if (!p.assigned_dates.has(dStr) && !p.leave_dates.has(dStr) && isHired && !isTerminated) {
            let targetShift = null;
            if (p.rotation_pattern?.toUpperCase().includes('NOCHE')) {
               const dummySlot = { date: dStr, shift_start: '00:00', shift_name: '' } as ShiftSlot;
               if (!checkRotationPattern(p, dummySlot)) targetShift = shift00;
            } else {
               let dummySlot = { date: dStr, shift_start: '08:00', shift_name: '' } as ShiftSlot;
               if (!checkRotationPattern(p, dummySlot)) targetShift = shift08;
               else {
                 dummySlot = { date: dStr, shift_start: '12:00', shift_name: '' } as ShiftSlot;
                 if (!checkRotationPattern(p, dummySlot)) targetShift = shift12;
                 else {
                   dummySlot = { date: dStr, shift_start: '00:00', shift_name: '' } as ShiftSlot;
                   if (!checkRotationPattern(p, dummySlot)) targetShift = shift00;
                 }
               }
            }

            if (targetShift) {
               const virtualSlot: ShiftSlot = {
                  requirement_id: `inj-blue-${p.personnel_id}-${dStr}`,
                  date: dStr,
                  shift_id: targetShift.id,
                  area_id: validBlueAreaId,
                  position_id: p.main_position,
                  shift_start: targetShift.start_time,
                  shift_end: targetShift.end_time,
                  shift_duration_hours: Number(targetShift.duration_hours) || 8,
                  required_count: 1,
                  filled_count: 0,
                  shift_name: targetShift.name,
                  position_name: p.main_position_name,
                  area_name: 'BLUE EXPRESS'
               };
               
               const violations = validateAllConstraints(p, virtualSlot, state.assignments);
               if (!hasHardViolation(violations)) {
                 assignments.push({
                    personnel_id: p.personnel_id,
                    shift_id: virtualSlot.shift_id,
                    date: virtualSlot.date,
                    area_id: virtualSlot.area_id,
                    position_id: virtualSlot.position_id,
                    status: 'scheduled',
                    is_locked: false,
                    is_manual: false,
                    frozen_by_rule: true,
                 });
                 state.assignments.push({
                    date: virtualSlot.date,
                    duration_hours: virtualSlot.shift_duration_hours,
                    shift_start: virtualSlot.shift_start,
                    shift_end: virtualSlot.shift_end,
                 });
                 p.assigned_dates.add(virtualSlot.date);
                 p.weekly_hours += virtualSlot.shift_duration_hours;
               }
            }
          }
          simDate = addDays(simDate, 1);
        }
      }
    }
  }

  // Sort slots by priority: Weekend slots have higher priority to avoid "FALTAN 1"
  const sortedSlots = [...slots].sort((a, b) => {
    const d = parseISO(a.date);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const isWeekendB = parseISO(b.date).getDay() === 0 || parseISO(b.date).getDay() === 6;
    
    if (isWeekend !== isWeekendB) return isWeekend ? -1 : 1;

    const prioA = getSlotPriority(a, a.position_name || '', a.area_name || '', a.shift_name || '');
    const prioB = getSlotPriority(b, b.position_name || '', b.area_name || '', b.shift_name || '');
    if (prioA !== prioB) return prioB - prioA;
    
    return a.date.localeCompare(b.date);
  });

  function runTiers(tiers: Array<{name: string, minPriority: number, passes: number[]}>) {
    for (const tier of tiers) {
      const tierSlots = sortedSlots.filter(s => getSlotPriority(s, s.position_name || '', s.area_name || '', s.shift_name || '') >= tier.minPriority);
      for (const pass of tier.passes) {
        for (const slot of tierSlots) {
          const alreadyAssigned = assignments.filter(a => a.date === slot.date && a.shift_id === slot.shift_id && a.area_id === slot.area_id && a.position_id === slot.position_id).length;
          const needed = slot.required_count - (slot.filled_count + alreadyAssigned);
          if (needed <= 0) continue;
    
          for (let i = 0; i < needed; i++) {
            const available = personnelPool.filter((p) => {
              if (p.assigned_dates.has(slot.date) || p.leave_dates.has(slot.date)) return false;
              if (p.rotation_pattern && p.rotation_pattern !== 'Rotativo' && !p.rotation_pattern.includes('Fijo')) {
                if (checkRotationPattern(p, slot)) return false;
              }
              if (pass === 0) {
                if (p.main_position !== slot.position_id) return false;
                const pPosName = (p.main_position_name || '').toUpperCase();
                return pPosName.includes('SUPERVISOR') || pPosName.includes('GRÚA') || pPosName.includes('HORQUILLA');
              }
              if (pass === 1) return p.main_position === slot.position_id;
              if (pass >= 2) return p.main_position === slot.position_id || p.secondary_positions.includes(slot.position_id);
              return true;
            });
    
            if (available.length === 0) continue;
            const assignmentsMap = new Map();
            for (const cand of available) assignmentsMap.set(cand.personnel_id, personnelState.get(cand.personnel_id)?.assignments || []);
            const ranked = rankCandidates(available, slot, assignmentsMap);
            
            for (const candidate of ranked) {
              if (candidate.availability_score === 0) continue;
              const person = personnelPool.find((p) => p.personnel_id === candidate.personnel_id)!;
              const state = personnelState.get(candidate.personnel_id)!;
              
              const isBluePerson = (person.rotation_pattern || '').toUpperCase().includes('BLUE_');
              const isBlueSlot = normStr(slot.area_name).includes('BLUE') || normStr(slot.shift_name).includes('BLUE');
              if (isBluePerson && !isBlueSlot) continue;

              // CRITICAL: Block NS 22 for non-4x4 airport personnel
              const isAirport = normStr(person.main_position_name).includes('AEROPUERTO');
              const isNightShift = slot.shift_start.includes('22:00') || normStr(slot.shift_name).includes('NS 22');
              const is4x4 = (person.rotation_pattern || '').toUpperCase().includes('4X4');
              if (isAirport && isNightShift && !is4x4) continue;

              const violations = validateAllConstraints(person, slot, state.assignments);
              if (hasHardViolation(violations)) continue;
              
              // NEVER override 4x4 or 7x7 violations even in later passes
              const isStrictRotation = (person.rotation_pattern || '').toUpperCase().match(/4X4|7X7|NS22|AEROPUERTO/);
              if (isStrictRotation && violations.some(v => v.type === 'rotation_violation')) continue;

              if (pass < 3 && violations.some(v => v.severity === 'warning') && !(person.rotation_pattern || '').toUpperCase().match(/4X4|7X7|BLUE_/)) continue;
    
              allViolations.push(...violations);
              assignments.push({
                personnel_id: candidate.personnel_id,
                shift_id: slot.shift_id,
                date: slot.date,
                area_id: slot.area_id,
                position_id: slot.position_id,
                status: 'scheduled',
                is_locked: false,
                is_manual: false,
                frozen_by_rule: false,
              });
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
  }

  // EXECUTION
  runTiers([
    { name: 'Critical', minPriority: 95, passes: [0, 1] },
    { name: 'Standard', minPriority: 0, passes: [0, 1] }
  ]);

  // WEEKLY REINFORCEMENT (40h guarantee)
  if (startDateStr && endDateStr && allShifts) {
    for (const p of personnelPool) {
      const pPosName = normStr(p.main_position_name);
      const pRot = normStr(p.rotation_pattern);
      
      const config = Object.entries(REINFORCEMENT_CONFIG).find(([key]) => pPosName.includes(key))?.[1];
      if (!config) continue; 
      if (pRot.includes('4X4') || pRot.includes('7X7') || pRot.includes('NOCHE') || p.has_special_contract) continue; 

      // DETERMINAR TURNO DE REFUERZO: Intentar encontrar un turno que ya se use en esa área para ese cargo
      const isAero = pPosName.includes('AEROPUERTO');
      const reinforcementShift = allShifts.find(s => {
        const sName = normStr(s.name);
        if (isAero) return sName.includes('AM 07');
        
        // Priorizar turnos que ya tengan requerimientos hoy
        return s.start_time.includes(config.shift_start) && !sName.includes('7X7');
      });
      if (!reinforcementShift) continue;

      const state = personnelState.get(p.personnel_id)!;
      let currentWeekStart = startOfWeek(parseISO(startDateStr), { weekStartsOn: 1 });
      const finalEnd = parseISO(endDateStr);

      while (currentWeekStart <= finalEnd) {
        const weekEnd = addDays(currentWeekStart, 6);
        let assignedThisWeek = state.assignments.filter(a => {
          const ad = parseISO(a.date);
          return ad >= currentWeekStart && ad <= weekEnd;
        }).length;

        // SKIP reinforcement if the person has ANY night shift this week
        const hasNightThisWeek = state.assignments.some(a => {
          const ad = parseISO(a.date);
          if (ad < currentWeekStart || ad > weekEnd) return false;
          const startHour = parseInt(a.shift_start.split(':')[0], 10);
          return startHour >= 20 || startHour <= 6;
        });

        if (hasNightThisWeek) {
           currentWeekStart = addDays(currentWeekStart, 7);
           continue;
        }

        if (assignedThisWeek < 5) {
          // ESTRATEGIA DE REFUERZO: Intentar L-V primero para dejar S-D libres juntos
          const weekDays = [1, 2, 3, 4, 5]; // Lun a Vie
          const weekendDays = [6, 0];       // Sab, Dom

          const tryAssign = (daysList: number[]) => {
            for (const dayOfWeek of daysList) {
              if (assignedThisWeek >= 5) break;
              
              const targetDay = eachDayOfInterval({ start: currentWeekStart, end: weekEnd })
                .find(d => d.getDay() === dayOfWeek);
              
              if (!targetDay) continue;
              const dStr = format(targetDay, 'yyyy-MM-dd');

              if (dStr >= startDateStr && dStr <= endDateStr) {
                const alreadyHasShift = state.assignments.some(a => a.date === dStr);
                if (!alreadyHasShift && !p.leave_dates.has(dStr)) {
                  
                  // DETERMINAR EL TURNO DE REFUERZO SEGÚN EL PERFIL
                  const pName = (p.first_name || '').toUpperCase();
                  const isPMSpecialist = pName.includes('ITALO') || pName.includes('DEIMAR') || (p.fixed_shift_name || '').includes('13:30') || (p.rotation_pattern || '').includes('TARDE');
                  
                  // Especialistas SIEMPRE refuerzan con PM 13:30 si está disponible
                  let targetShift = (isPMSpecialist && pmShift) ? pmShift : reinforcementShift;
                  
                  // CASO ESPECIAL: Si es el día 23 (u otro sábado de gap) y es especialista, forzar PM
                  if (isPMSpecialist && dStr.endsWith('-23') && pmShift) {
                    targetShift = pmShift;
                  }
                  
                  // DETERMINAR EL MEJOR TURNO PARA HOY:
                  const todayReq = slots.find(s => s.date === dStr && s.position_id === p.main_position && s.area_id === p.area_id);

                  // NO REFORZAR EN DÍAS SIN REQUERIMIENTOS SI HAY HUECOS EN LA SEMANA
                  const weekStart = startOfWeek(parseISO(dStr), { weekStartsOn: 1 });
                  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
                  const hasHolesInWeek = slots.some(s => {
                    const sd = parseISO(s.date);
                    return sd >= weekStart && sd <= weekEnd && 
                           s.position_id === p.main_position && 
                           s.filled_count < s.required_count;
                  });

                  if (!todayReq && hasHolesInWeek) {
                    // Si hoy no se necesita nadie y hay huecos en la semana, saltamos para no "gastar" el día del trabajador
                    continue;
                  }

                  const effectiveShiftId = todayReq?.shift_id || targetShift.id;
                  const effectiveStart = todayReq?.shift_start || targetShift.start_time;
                  const effectiveEnd = todayReq?.shift_end || targetShift.end_time;
                  const effectiveDuration = todayReq?.shift_duration_hours || Number(targetShift.duration_hours) || 8;
                  const effectiveShiftName = todayReq?.shift_name || targetShift.name;

                  const phantomSlot: ShiftSlot = {
                    requirement_id: `reinforce-${p.personnel_id}-${dStr}`,
                    date: dStr,
                    shift_id: effectiveShiftId,
                    area_id: p.area_id,
                    position_id: p.main_position,
                    shift_start: effectiveStart,
                    shift_end: effectiveEnd,
                    shift_duration_hours: effectiveDuration,
                    required_count: 1,
                    filled_count: 0,
                    position_name: p.main_position_name,
                    area_name: '',
                    shift_name: effectiveShiftName,
                  };

                  const violations = validateAllConstraints(p, phantomSlot, state.assignments);
                  if (!hasHardViolation(violations)) {
                    state.assignments.push({
                      date: dStr,
                      duration_hours: phantomSlot.shift_duration_hours,
                      shift_start: phantomSlot.shift_start,
                      shift_end: phantomSlot.shift_end,
                    });
                    p.assigned_dates.add(dStr);
                    p.weekly_hours += phantomSlot.shift_duration_hours;
                    assignments.push({
                      personnel_id: p.personnel_id,
                      shift_id: reinforcementShift.id,
                      date: dStr,
                      area_id: p.area_id,
                      position_id: p.main_position,
                      status: 'scheduled',
                      is_locked: false,
                      is_manual: false,
                      frozen_by_rule: false,
                    });
                    assignedThisWeek++;
                  }
                }
              }
            }
          };

          tryAssign(weekDays);
          if (assignedThisWeek < 5) tryAssign(weekendDays);
        }
        currentWeekStart = addDays(currentWeekStart, 7);
      }
    }
  }

  runTiers([
    { name: 'Support', minPriority: 0, passes: [2, 3] }
  ]);

  for (const slot of sortedSlots) {
    const filled = assignments.filter(a => a.date === slot.date && a.shift_id === slot.shift_id && a.area_id === slot.area_id && a.position_id === slot.position_id).length + slot.filled_count;
    if (filled < slot.required_count) unfilled.push(slot);
  }

  // =========================================================================
  // FINAL PASS: DETERMINISTIC AIRPORT 4x4 OVERRIDE (LA ÚLTIMA PALABRA)
  // =========================================================================
  if (startDateStr && endDateStr && allShifts && allShifts.length > 0) {
    
    const airportPersonnel = personnelPool.filter(p => {
      const pattern = (p.rotation_pattern || '').toLowerCase();
      return pattern.includes('4x4');
    });

    log(`[4x4-IA] Buscando por ID/Nombre en pool de ${personnelPool.length}. Encontrados: ${airportPersonnel.length}`);

    if (ns22Shift && airportPersonnel.length > 0) {
      
      for (const p of airportPersonnel) {
        let simDate = parseISO(startDateStr);
        let endSim = parseISO(endDateStr);
        const state = personnelState.get(p.personnel_id)!;

        // 1. Limpiar asignaciones previas de la IA para este rango
        for (let i = assignments.length - 1; i >= 0; i--) {
          if (assignments[i].personnel_id === p.personnel_id) {
            assignments.splice(i, 1);
          }
        }

        // 2. Limpiar estado local para asegurar matemática pura en el espejo
        // Mantenemos solo lo estrictamente anterior al inicio del cálculo
        state.assignments = state.assignments.filter(a => a.date < startDateStr!);
        
        const historyDates = state.assignments.map(a => a.date).join(', ');
        log(`[4x4-IA] Historial detectado para ${p.first_name}: ${historyDates}`);

        try {
          const daysInRange = eachDayOfInterval({
            start: parseISO(startDateStr!),
            end: parseISO(endDateStr!)
          }).map(d => format(d, 'yyyy-MM-dd'));

          const targetShift = allShifts.find(s => normStr(s.name).includes('NS 22'));
          if (!targetShift) continue;

          for (const currentDate of daysInRange) {
            const mirrorStr = format(subDays(parseISO(currentDate), 4), 'yyyy-MM-dd');
            const workedMirror = state.assignments.some(a => a.date === mirrorStr);

            if (!workedMirror) {
              const slot = slots.find(s => s.date === currentDate && s.position_id === p.main_position);
              if (slot) {
                assignments.push({
                  personnel_id: p.personnel_id,
                  shift_id: targetShift.id,
                  date: currentDate,
                  area_id: p.area_id || slot.area_id,
                  position_id: p.main_position,
                  status: 'scheduled',
                  is_locked: true,
                  is_manual: false,
                  frozen_by_rule: true,
                  original_shift_id: targetShift.id
                });
                state.assignments.push({
                  date: currentDate,
                  duration_hours: targetShift.duration_hours || 8,
                  shift_start: targetShift.start_time || '22:00',
                  shift_end: targetShift.end_time || '08:00'
                });
              }
            }
          }
        } catch (err: any) {
          console.error('[4x4 ERROR]:', err);
        }
      }
    }
  }

  // =========================================================================
  // FINAL REVISION: ENSURE 5 DAYS PER WEEK FOR EVERYONE
  // =========================================================================
  if (startDateStr && endDateStr && reinforcementShift) {
    log(`[FINAL_REVIEW] Iniciando revisión de cuota de 5 días para personal 5x2...`);
    
    for (const p of personnelPool) {
      // Ignorar patrones que NO son de 5 días (como 4x4 o 7x7)
      const pattern = (p.rotation_pattern || '').toUpperCase();
      if (pattern.includes('4X4') || pattern.includes('7X7')) continue;

      const state = personnelState.get(p.personnel_id)!;
      
      let simDate = parseISO(startDateStr);
      let endSim = parseISO(endDateStr);

      while (simDate <= endSim) {
        const weekStart = startOfWeek(simDate, { weekStartsOn: 1 });
        const weekEnd = addDays(weekStart, 6);

        // Contar días asignados en esta semana natural
        let assignedInWeek = state.assignments.filter(a => {
          const d = parseISO(a.date);
          return d >= weekStart && d <= weekEnd;
        }).length;

        // Si falta trabajo para llegar a 5 días...
        if (assignedInWeek < 5) {
          // Buscar días libres en esta misma semana para rellenar
          for (let dIdx = 0; dIdx < 7; dIdx++) {
            if (assignedInWeek >= 5) break;
            
            const targetD = addDays(weekStart, dIdx);
            if (targetD > endSim || targetD < parseISO(startDateStr)) continue;
            
            const dStr = format(targetD, 'yyyy-MM-dd');
            const alreadyAssigned = state.assignments.some(a => a.date === dStr);
            const onLeave = p.leave_dates.has(dStr);
            const isTerminated = p.termination_date && dStr > p.termination_date;
            const isHired = !p.hire_date || dStr >= p.hire_date;

            // CHEQUEO: No reforzar en días sin requerimientos si hay huecos en la semana
            const todayReq = slots.find(s => s.date === dStr && s.position_id === p.main_position && s.area_id === p.area_id);
            const hasHolesInWeek = slots.some(s => {
              const sd = parseISO(s.date);
              return sd >= weekStart && sd <= weekEnd && 
                     s.position_id === p.main_position && 
                     s.filled_count < s.required_count;
            });

            if (!alreadyAssigned && !onLeave && isHired && !isTerminated) {
              if (!todayReq && hasHolesInWeek) {
                // Si no se necesita nadie hoy y hay huecos en la semana, saltamos
                continue;
              }

              // DETERMINAR TURNO DINÁMICO PARA REVISIÓN FINAL
              const effShiftId = todayReq?.shift_id || reinforcementShift.id;
              const effStart = todayReq?.shift_start || reinforcementShift.start_time;
              const effEnd = todayReq?.shift_end || reinforcementShift.end_time;
              const effDur = todayReq?.shift_duration_hours || Number(reinforcementShift.duration_hours) || 8;
              const effName = todayReq?.shift_name || reinforcementShift.name;

              const phantom: ShiftSlot = {
                requirement_id: `final-rev-${p.personnel_id}-${dStr}`,
                date: dStr,
                shift_id: effShiftId,
                area_id: p.area_id,
                position_id: p.main_position,
                shift_start: effStart,
                shift_end: effEnd,
                shift_duration_hours: effDur,
                required_count: 1,
                filled_count: 0,
                shift_name: effName,
                position_name: p.main_position_name,
              };

              const violations = validateAllConstraints(p, phantom, state.assignments);
              if (!hasHardViolation(violations)) {
                state.assignments.push({
                  date: dStr,
                  duration_hours: phantom.shift_duration_hours,
                  shift_start: phantom.shift_start,
                  shift_end: phantom.shift_end,
                });
                assignments.push({
                  personnel_id: p.personnel_id,
                  shift_id: effShiftId,
                  date: dStr,
                  area_id: p.area_id,
                  position_id: p.main_position,
                  status: 'scheduled',
                  is_locked: false,
                  is_manual: false,
                  frozen_by_rule: false,
                });
                assignedInWeek++;
                log(`[FINAL_REVIEW] +1 Turno (07:00) para ${p.first_name} el ${dStr} (Total semana: ${assignedInWeek}/5)`);
              }
            }
          }
        }
        // Saltar a la siguiente semana
        simDate = addDays(weekStart, 7);
      }
    }
  }

  return { assignments, violations: allViolations, unfilled, diagnosticLogs };
}
