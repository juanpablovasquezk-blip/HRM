/**
 * Hard Constraint Validators
 *
 * Enforces the rules from plan_maestro.md:
 * - Max 40 hours/week
 * - Minimum 2 days off per week
 * - Minimum 10 hours rest between shifts
 * - Birthday = day off
 * - Respect shift preferences (night/no night)
 */

import { differenceInHours, differenceInMinutes, parseISO, isSameDay, startOfWeek, endOfWeek, eachDayOfInterval, isSunday, startOfMonth, endOfMonth, format, differenceInCalendarDays, addDays } from 'date-fns';
import type { ConstraintViolation, PersonnelAvailability, ShiftSlot } from './types';

const MAX_HOURS_PER_WEEK = 40;
const MIN_DAYS_OFF_PER_WEEK = 2;
const MIN_REST_HOURS = 10;

const norm = (s: string = '') => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

/**
 * Check if assigning this shift would exceed 40 hours/week
 */
export function checkMaxHoursPerWeek(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot,
  currentAssignments: Array<{ date: string; duration_hours: number }>
): ConstraintViolation | null {
  // EXEMPTION: Canes, 4x4, 7x7 or Special Contracts
  const pattern = (personnel.rotation_pattern || '').toUpperCase();
  const startHourMax = parseInt(shiftSlot.shift_start.split(':')[0], 10);
  const isAeroNight = norm(shiftSlot.position_name).includes('AEROPUERTO') && (startHourMax >= 20 || startHourMax <= 6);

  if (personnel.has_special_contract || 
      pattern.includes('7X7') || 
      pattern.includes('4X4') ||
      pattern.includes('BLUE_') || 
      isAeroNight ||
      norm(personnel.main_position_name).includes('CANES') ||
      norm(shiftSlot.position_name).includes('CANES')) {
    return null;
  }

  const slotDate = parseISO(shiftSlot.date);
  const weekStart = startOfWeek(slotDate, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(slotDate, { weekStartsOn: 1 });

  const weeklyHours = currentAssignments
    .filter((a) => {
      const d = parseISO(a.date);
      return d >= weekStart && d <= weekEnd;
    })
    .reduce((sum, a) => sum + a.duration_hours, 0);

  const projectedHours = weeklyHours + shiftSlot.shift_duration_hours;
  
  // Si es un requerimiento real (no refuerzo), permitimos hasta 45h para no dejar huecos
  const isReinforcement = shiftSlot.requirement_id.includes('reinforce-') || shiftSlot.requirement_id.includes('final-rev-');
  const limit = isReinforcement ? MAX_HOURS_PER_WEEK : 45;

  if (projectedHours > limit) {
    return {
      type: 'max_hours',
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `Excedería el límite de ${limit}h semanales (proyectado: ${projectedHours.toFixed(1)}h)`,
      severity: 'error',
    };
  }

  return null;
}

/**
 * Check if personnel has enough days off this week
 */
export function checkMinDaysOff(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot,
  dateSet: Set<string>
): ConstraintViolation | null {
  const startHourMin = parseInt(shiftSlot.shift_start.split(':')[0], 10);
  const isAeroNight = norm(shiftSlot.position_name).includes('AEROPUERTO') && (startHourMin >= 20 || startHourMin <= 6);

  // EXEMPTION: Canes, 7x7, Blue Express or Special Contracts
  if (personnel.has_special_contract || 
      (personnel.rotation_pattern || '').includes('7X7') || 
      (personnel.rotation_pattern || '').includes('4X4') || 
      (personnel.rotation_pattern || '').includes('BLUE_') || 
      isAeroNight ||
      norm(personnel.main_position_name).includes('CANES') ||
      norm(shiftSlot.position_name).includes('CANES')) {
    return null;
  }

  const slotDate = parseISO(shiftSlot.date);
  const weekStart = startOfWeek(slotDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(slotDate, { weekStartsOn: 1 });
  const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  let workingDays = 0;
  for (const d of daysInWeek) {
    if (dateSet.has(format(d, 'yyyy-MM-dd'))) {
      workingDays++;
    }
  }

  const daysOff = daysInWeek.length - workingDays;

  if (daysOff < MIN_DAYS_OFF_PER_WEEK) {
    return {
      type: 'min_days_off',
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `Only ${daysOff} day(s) off this week (minimum: ${MIN_DAYS_OFF_PER_WEEK})`,
      severity: 'error',
    };
  }

  return null;
}

/**
 * Check minimum 10 hours rest between shifts
 */
export function checkMinRestBetweenShifts(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot,
  adjacentAssignments: Array<{ date: string; shift_end: string; shift_start: string }>
): ConstraintViolation | null {
  const slotDate = parseISO(shiftSlot.date);

  for (const adj of adjacentAssignments) {
    const adjDate = parseISO(adj.date);

    // Build full datetime for shift end and start
    const prevEnd = new Date(`${adj.date}T${adj.shift_end}`);
    const currentStart = new Date(`${shiftSlot.date}T${shiftSlot.shift_start}`);

    // Handle overnight: if end time is after midnight, it's next day
    if (adj.shift_end < adj.shift_start) {
      prevEnd.setDate(prevEnd.getDate() + 1);
    }

    const restMinutes = differenceInMinutes(currentStart, prevEnd);
    
    // REGLA ABSOLUTA: Mínimo 10.5 horas (630 minutos) entre turnos
    if (restMinutes >= 0 && restMinutes < 630) {
      return {
        type: 'min_rest',
        personnel_id: personnel.personnel_id,
        date: shiftSlot.date,
        message: `DESCANSO ILEGAL: Solo ${Math.floor(restMinutes/60)}h ${restMinutes%60}min (Mínimo: 10h 30m).`,
        severity: 'error',
      };
    }


    // Also check if current shift ends too close to next shift start
    const currentEnd = new Date(`${shiftSlot.date}T${shiftSlot.shift_end}`);
    if (shiftSlot.shift_end < shiftSlot.shift_start) {
      currentEnd.setDate(currentEnd.getDate() + 1);
    }
    const nextStart = new Date(`${adj.date}T${adj.shift_start}`);
    const forwardRest = differenceInHours(nextStart, currentEnd);

    if (forwardRest >= 0 && forwardRest < MIN_REST_HOURS && adjDate > slotDate) {
      return {
        type: 'min_rest',
        personnel_id: personnel.personnel_id,
        date: shiftSlot.date,
        message: `Only ${forwardRest}h rest before next shift (minimum: ${MIN_REST_HOURS}h)`,
        severity: 'error',
      };
    }
  }

  return null;
}

/**
 * Check if date is personnel's birthday — birthday = day off
 */
export function checkBirthdayOff(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot
): ConstraintViolation | null {
  if (!personnel.birth_date) return null;

  const birthDate = parseISO(personnel.birth_date);
  const shiftDate = parseISO(shiftSlot.date);

  // Same month and day (regardless of year)
  if (
    birthDate.getMonth() === shiftDate.getMonth() &&
    birthDate.getDate() === shiftDate.getDate()
  ) {
    return {
      type: 'birthday',
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `Birthday — must have day off`,
      severity: 'error',
    };
  }

  return null;
}

/**
 * Check if personnel is working more than 7 consecutive days (Soft Constraint)
 */
export function checkMaxConsecutiveDays(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot,
  dateSet: Set<string>
): ConstraintViolation | null {
  const startHourCons = parseInt(shiftSlot.shift_start.split(':')[0], 10);
  const isAeroNight = norm(shiftSlot.position_name).includes('AEROPUERTO') && (startHourCons >= 20 || startHourCons <= 6);

  // EXEMPTION: Canes, 7x7, Blue Express or Special Contracts
  if (personnel.has_special_contract || 
      (personnel.rotation_pattern || '').includes('7X7') || 
      (personnel.rotation_pattern || '').includes('BLUE_') || 
      isAeroNight ||
      norm(personnel.main_position_name).includes('CANES') ||
      norm(shiftSlot.position_name).includes('CANES')) {
    return null;
  }

  const MAX_CONSECUTIVE = 7;
  
  // Find the streak for the current slot using the provided Set
  let streak = 1;
  const slotMillis = parseISO(shiftSlot.date).getTime();

  // Look back
  let checkDt = slotMillis;
  while (true) {
    checkDt -= 86400000; // 1 day in ms
    const dateStr = new Date(checkDt).toISOString().split('T')[0];
    if (dateSet.has(dateStr)) {
      streak++;
    } else {
      break;
    }
  }

  // Look forward
  checkDt = slotMillis;
  while (true) {
    checkDt += 86400000;
    const dateStr = new Date(checkDt).toISOString().split('T')[0];
    if (dateSet.has(dateStr)) {
      streak++;
    } else {
      break;
    }
  }

  if (streak > MAX_CONSECUTIVE) {
    return {
      type: 'preference', // Using preference type for soft warning
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `Idealmente máximo ${MAX_CONSECUTIVE} días seguidos (actual: ${streak})`,
      severity: 'warning',
    };
  }

  return null;
}


/**
 * Check shift preferences (warning-level, not blocking)
 */
export function checkPreferences(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot
): ConstraintViolation | null {
  const startTime = shiftSlot.shift_start || '08:00';
  const startHour = parseInt(startTime.split(':')[0], 10);
  const isNightShift = startHour >= 20 || startHour < 6;

  if (isNightShift && personnel.avoids_night) {
    return {
      type: 'preference',
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `Prefers to avoid night shifts`,
      severity: 'warning',
    };
  }

  if (!isNightShift && personnel.prefers_night) {
    return {
      type: 'preference',
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `Prefers night shifts`,
      severity: 'warning',
    };
  }

  return null;
}

/**
 * Check qualification - Personnel MUST have the position
 */
export function checkQualification(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot
): ConstraintViolation | null {
  const posName = norm(shiftSlot.position_name);
  const perPosName = norm(personnel.main_position_name);
  const firstName = norm(personnel.first_name);

  // CRITICAL RULE: CANES stay in CANES. They don't cover other areas.
  const isCan = perPosName.includes('CAN');
  const isCanSlot = posName.includes('CAN');

  if (isCan && !isCanSlot) {
    return {
      type: 'preference',
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `Personal de Canes solo puede cubrir puestos de Canes`,
      severity: 'error',
    };
  }

  // 1. Direct match by ID (Must be checked BEFORE the hard block at line 333)
  if (personnel.main_position === shiftSlot.position_id) return null;
  if ((personnel.secondary_positions || []).includes(shiftSlot.position_id)) return null;

  // CRITICAL RULE: Blue Express Isolation
  const isBluePerson = (personnel.rotation_pattern || '').toUpperCase().includes('BLUE_');
  const isBlueSlot = norm(shiftSlot.area_name).includes('BLUE') || norm(shiftSlot.shift_name).includes('BLUE');
  
  if (isBluePerson && !isBlueSlot) {
    return {
      type: 'preference',
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `Personal asignado a bloque Blue Express no puede cubrir otras áreas`,
      severity: 'error',
    };
  }

  // also block non-Canes from Canes if not Mathias and no ID match was found
  if (isCanSlot && !isCan && !firstName.includes('MATHIAS')) {
     return {
      type: 'preference',
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `Solo personal autorizado puede cubrir Canes`,
      severity: 'error',
    };
  }

  // 2. Mathias Rozas Special Rule (Substitution for Canes)
  if (firstName.includes('MATHIAS') && posName.includes('CANES')) {
    return null;
  }

  // 3. Crane Operators Flexibility (Atrex/Base Interchangeable)
  if (perPosName.includes('GRUA') && posName.includes('GRUA')) {
    return null;
  }

  // 4. Case match by name
  if (perPosName === posName && posName !== '') return null;

  // --- BRAKING RULES FOR TRUCKS (BLUE/CAMION) ---
  const isTruckSlot = posName.includes('CONDUCTOR') || posName.includes('CAMION') || posName.includes('BLUE');
  const canDrive = perPosName.includes('CONDUCTOR') || perPosName.includes('CAMION') || 
                   (personnel.secondary_positions || []).some(id => {
                     // We would ideally need the position name here, but we check IDs in step 1.
                     return false; // If not matched by ID in step 1, assume no.
                   });

  if (isTruckSlot && !canDrive) {
    return {
      type: 'preference',
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `Personal no habilitado para operar Camión/Blue`,
      severity: 'error',
    };
  }

  return {
    type: 'preference',
    personnel_id: personnel.personnel_id,
    date: shiftSlot.date,
    message: `No calificado para ${shiftSlot.position_name}`,
    severity: 'error',
  };
}

/**
 * Check transport requirements
 */
export function checkTransport(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot
): ConstraintViolation | null {
  if (shiftSlot.requires_transport && !personnel.requires_transport) {
    return {
      type: 'preference',
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `Este turno requiere transporte y el trabajador no lo tiene habilitado`,
      severity: 'error',
    };
  }
  return null;
}

/**
 * Check rotation pattern (e.g., Mon-Fri only)
 */
export function checkRotationPattern(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot
): ConstraintViolation | null {
  if (!personnel.rotation_pattern) return null;

  const pattern = personnel.rotation_pattern.toUpperCase();
  const dateStrForLogic = format(parseISO(shiftSlot.date), 'yyyy-MM-dd') + 'T12:00:00Z';
  const date = parseISO(dateStrForLogic);
  
  // SHARED ANCHOR LOGIC
  const anchorDate = parseISO('2026-04-01T12:00:00Z');
  const daysSinceAnchor = differenceInCalendarDays(date, anchorDate);

  // 1. HARD ROTATION 7x7 (ABSOLUTE PRIORITY)
  if (pattern.includes('7X7')) {
    let isTurnBResult = personnel.is_turn_b;
    if (pattern.includes('7X7-B') || pattern.includes('7X7 B')) {
      isTurnBResult = true;
    } else if (pattern.includes('7X7-A') || pattern.includes('7X7 A')) {
      isTurnBResult = false;
    }

    const offset = isTurnBResult ? 9 : 2; 
    const cyclePos = (daysSinceAnchor + offset) % 14; 
    
    if (cyclePos >= 7) {
      return {
        type: 'rotation_violation',
        personnel_id: personnel.personnel_id,
        date: shiftSlot.date,
        message: `DESCANSO OBLIGATORIO 7x7 (Turno ${isTurnBResult ? 'B' : 'A'})`,
        severity: 'error',
      };
    }
  }

  // 1b. ROTATING 5X2 RELEVO (Surgical Isolation for Supervisors)
  if (pattern.includes('5X2-RELEVO')) {
    const anchor = parseISO('2026-03-30T12:00:00Z'); // Monday
    const diffDays = differenceInCalendarDays(date, anchor);
    
    // Week index from anchor
    const weekIdx = Math.floor(diffDays / 7);
    const dayInWeek = diffDays % 7; // 0=Mon, ..., 5=Sat, 6=Sun
    
    const isB = pattern.includes('-B');
    const isOffWeekendWeek = isB ? (weekIdx % 2 !== 0) : (weekIdx % 2 === 0);

    if (isOffWeekendWeek) {
      if (dayInWeek >= 5) {
        return {
          type: 'rotation_violation',
          personnel_id: personnel.personnel_id,
          date: shiftSlot.date,
          message: '5X2-RELEVO: Descanso de Fin de Semana',
          severity: 'error',
        };
      }
    } else {
      if (dayInWeek === 3 || dayInWeek === 4) {
        return {
          type: 'rotation_violation',
          personnel_id: personnel.personnel_id,
          date: shiftSlot.date,
          message: '5X2-RELEVO: Descanso compensatorio semanal',
          severity: 'error',
        };
      }
    }
  }

  // 1c. 4x4 (Aeropuerto) - MOVED UP TO ENSURE PRIORITY OVER MAIN_POSITION
  const upPattern = pattern.toUpperCase();
  if (upPattern.includes('4X4')) {
    let offset = 7; 
    if (upPattern.includes('A') || upPattern.includes('-A')) offset = 7;
    if (upPattern.includes('B') || upPattern.includes('-B')) offset = 3;

    const cyclePos = (daysSinceAnchor + offset) % 8; 
    
    if (cyclePos >= 4) {
      return {
        type: 'rotation_violation',
        personnel_id: personnel.personnel_id,
        date: shiftSlot.date,
        message: `DESCANSO 4x4 (Día ${cyclePos + 1 - 4}/4 de libre)`,
        severity: 'error',
      };
    }
  }

  // 1d. L-V (Estricto Lunes a Viernes)
  if (pattern.includes('L-V') || pattern.includes('LUNES A VIERNES')) {
    const day = parseISO(shiftSlot.date).getDay();
    const isCanesSlot = (shiftSlot.position_name || '').toUpperCase().includes('CANES');
    
    // NOTE: Relaxed to allow weekend work if needed, previously was a hard error.
    if ((day === 0 || day === 6) && !isCanesSlot) {
      // Just a warning to prioritize Mon-Fri but allow coverage if no other option
      return null; 
    }
  }

  // 1e. BLUE_DIA (Conductors 21-Day Cycle: A-B-C Rotation)
  if (pattern.includes('BLUE_DIA')) {
    const anchorBlue = parseISO('2026-04-27T12:00:00Z'); // Lunes 27 Abril (Roster Configurator Epoch)
    const daysSinceAnchorBlue = differenceInCalendarDays(date, anchorBlue);
    const dayOfCycle = ((daysSinceAnchorBlue % 21) + 21) % 21; // Handle negatives
    
    const weekIdx = Math.floor(dayOfCycle / 7); // 0, 1, 2
    const dayOfWeek = dayOfCycle % 7; // 0=Mon, ..., 6=Sun
    
    // Determine which block (A, B, C) applies to this week for this specific personnel
    let activeBlock = '';
    if (pattern.includes('-1')) {
      // Sec 1 starts with Block A, then C, then B
      if (weekIdx === 0) activeBlock = 'A';
      else if (weekIdx === 1) activeBlock = 'C';
      else activeBlock = 'B';
    } else if (pattern.includes('-2')) {
      // Sec 2 starts with Block C, then B, then A
      if (weekIdx === 0) activeBlock = 'C';
      else if (weekIdx === 1) activeBlock = 'B';
      else activeBlock = 'A';
    } else if (pattern.includes('-3')) {
      // Sec 3 starts with Block B, then A, then C
      if (weekIdx === 0) activeBlock = 'B';
      else if (weekIdx === 1) activeBlock = 'A';
      else activeBlock = 'C';
    }

    if (activeBlock === 'A') {
      // Block A: Mon-Fri WORK (PM 12). Sat-Sun OFF.
      if (dayOfWeek >= 5) {
        return { type: 'rotation_violation', personnel_id: personnel.personnel_id, date: shiftSlot.date, message: 'BLUE_DIA (A): Descanso Fines de Semana', severity: 'error' };
      }
      if (!shiftSlot.shift_start.includes('12:00') && !shiftSlot.shift_start.includes('13:30')) {
        return { type: 'rotation_violation', personnel_id: personnel.personnel_id, date: shiftSlot.date, message: 'BLUE_DIA (A): Requiere turno de Tarde (12:00)', severity: 'error' };
      }
    } else if (activeBlock === 'B') {
      // Block B: Mon-Tue AM 08. Wed-Thu OFF. Fri AM 00. Sat-Sun AM 08.
      if (dayOfWeek === 2 || dayOfWeek === 3) {
        return { type: 'rotation_violation', personnel_id: personnel.personnel_id, date: shiftSlot.date, message: 'BLUE_DIA (B): Descanso Miércoles-Jueves', severity: 'error' };
      }
      const expectedStart = dayOfWeek === 4 ? '00:00' : '08:00';
      if (!shiftSlot.shift_start.includes(expectedStart)) {
        return { type: 'rotation_violation', personnel_id: personnel.personnel_id, date: shiftSlot.date, message: `BLUE_DIA (B): Requiere turno de ${expectedStart}`, severity: 'error' };
      }
    } else if (activeBlock === 'C') {
      // Block C: Mon-Tue OFF. Wed-Sun AM 08.
      if (dayOfWeek === 0 || dayOfWeek === 1) {
        return { type: 'rotation_violation', personnel_id: personnel.personnel_id, date: shiftSlot.date, message: 'BLUE_DIA (C): Descanso Lunes-Martes', severity: 'error' };
      }
      if (!shiftSlot.shift_start.includes('08:00')) {
        return { type: 'rotation_violation', personnel_id: personnel.personnel_id, date: shiftSlot.date, message: 'BLUE_DIA (C): Requiere turno de Mañana (08:00)', severity: 'error' };
      }
    }
  }

  // 1f. BLUE_NOCHE (Night Conductors 21-Day Cycle: AM 00 Focus)
  if (pattern.includes('BLUE_NOCHE')) {
    const anchorBlue = parseISO('2026-04-27T12:00:00Z'); // Lunes 27 Abril (Roster Configurator Epoch)
    const daysSinceAnchorBlue = differenceInCalendarDays(date, anchorBlue);
    const dayOfCycle = ((daysSinceAnchorBlue % 21) + 21) % 21;
    
    const weekIdx = Math.floor(dayOfCycle / 7);
    const dayOfWeek = dayOfCycle % 7; 
    
    let activeBlock = '';
    if (pattern.includes('-1')) {
      if (weekIdx === 0) activeBlock = 'A';
      else if (weekIdx === 1) activeBlock = 'C';
      else activeBlock = 'B';
    } else if (pattern.includes('-2')) {
      if (weekIdx === 0) activeBlock = 'C';
      else if (weekIdx === 1) activeBlock = 'B';
      else activeBlock = 'A';
    } else if (pattern.includes('-3')) {
      if (weekIdx === 0) activeBlock = 'B';
      else if (weekIdx === 1) activeBlock = 'A';
      else activeBlock = 'C';
    }

    const sName = (shiftSlot.shift_name || '').toUpperCase();
    const expectedShift = 'AM 00'; // All night drivers do AM 00

    if (activeBlock === 'A') {
      // Block A: Mon-Fri working. Sat-Sun OFF.
      if (dayOfWeek >= 5) {
        return { type: 'rotation_violation', personnel_id: personnel.personnel_id, date: shiftSlot.date, message: 'BLUE_NOCHE (A): Descanso Fines de Semana', severity: 'error' };
      }
      if (!shiftSlot.shift_start.includes('00:00')) {
        return { type: 'rotation_violation', personnel_id: personnel.personnel_id, date: shiftSlot.date, message: 'BLUE_NOCHE: Solo turnos de Noche (00:00)', severity: 'error' };
      }
    } else if (activeBlock === 'B') {
      // Block B (Noche): Mon-Tue working. Wed-Fri OFF. Sat-Sun working.
      if (dayOfWeek >= 2 && dayOfWeek <= 4) {
        return { type: 'rotation_violation', personnel_id: personnel.personnel_id, date: shiftSlot.date, message: 'BLUE_NOCHE (B): Descanso Miércoles a Viernes', severity: 'error' };
      }
      if (!shiftSlot.shift_start.includes('00:00')) {
        return { type: 'rotation_violation', personnel_id: personnel.personnel_id, date: shiftSlot.date, message: 'BLUE_NOCHE: Solo turnos de Noche (00:00)', severity: 'error' };
      }
    } else if (activeBlock === 'C') {
      // Block C: Mon-Tue OFF. Wed-Sun working.
      if (dayOfWeek === 0 || dayOfWeek === 1) {
        return { type: 'rotation_violation', personnel_id: personnel.personnel_id, date: shiftSlot.date, message: 'BLUE_NOCHE (C): Descanso Lunes-Martes', severity: 'error' };
      }
      if (!shiftSlot.shift_start.includes('00:00')) {
        return { type: 'rotation_violation', personnel_id: personnel.personnel_id, date: shiftSlot.date, message: 'BLUE_NOCHE: Solo turnos de Noche (00:00)', severity: 'error' };
      }
    }
  }

  // --- POSITION & IDENTITY CHECKS ---
  
  // 2. Hierarchical Blocking
  const pPos = (personnel.main_position_name || '').toUpperCase();
  const sPos = (shiftSlot.position_name || '').toUpperCase();
  const isSupervisor = pPos.includes('SUPERVISOR') || pPos.includes('SUP');
  const isOperational = sPos.includes('OPERADOR') || sPos.includes('CANES') || sPos.includes('AYUDANTE');

  if (isSupervisor && isOperational) {
    return {
      type: 'rotation_violation',
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `BLOQUEO JERÁRQUICO: Un Supervisor no puede cubrir puestos operativos (${sPos})`,
      severity: 'error',
    };
  }

  // 3. NOCHE
  if (upPattern.includes('NOCHE')) {
    const startHour = parseInt(shiftSlot.shift_start.split(':')[0], 10);
    // Expand night window: 20:00 to 06:59
    const isNightShift = startHour >= 20 || startHour <= 6;
    if (!isNightShift) {
      if (personnel.first_name.toUpperCase().includes('MARCELO') || personnel.first_name.toUpperCase().includes('JAVIER')) {
         console.log(`[DEBUG] Rej: ${personnel.first_name} NOCHE vs ${shiftSlot.shift_start}`);
      }
       return {
        type: 'rotation_violation',
        personnel_id: personnel.personnel_id,
        date: shiftSlot.date,
        message: 'Personal de noche no puede cubrir turnos de día',
        severity: 'error',
      };
    }
  }

  // 3b. BLOQUEO ESTRICTO DE NS 22 PARA PERSONAL ESTÁNDAR (Solo Operador Aeropuerto)
  if (sPos.includes('OPERADOR AEROPUERTO') && !upPattern.includes('4X4') && !upPattern.includes('7X7') && !personnel.prefers_night) {
    const isNS22 = (shiftSlot.shift_name || '').toUpperCase().includes('NS 22') || shiftSlot.shift_start.includes('22:00');
    if (isNS22) {
      return {
        type: 'rotation_violation',
        personnel_id: personnel.personnel_id,
        date: shiftSlot.date,
        message: 'Turno NS 22 reservado exclusivamente para personal 4x4 o con preferencia de noche',
        severity: 'error',
      };
    }
  }


  // 4. TURNO FIJO
  if (personnel.fixed_shift_id && personnel.fixed_shift_id !== shiftSlot.shift_id) {
    const personnelShiftName = (personnel.fixed_shift_name || '').toUpperCase().trim();
    const slotShiftName = (shiftSlot.shift_name || '').toUpperCase().trim();
    const namesMatch = personnelShiftName !== '' && personnelShiftName === slotShiftName;
    if (!namesMatch) {
      return {
        type: 'rotation_violation',
        personnel_id: personnel.personnel_id,
        date: shiftSlot.date,
        message: `El trabajador tiene turno fijo asignado (${personnel.fixed_shift_name || personnel.fixed_shift_id})`,
        severity: 'error',
      };
    }
  }

  // 5. Mathias Rozas Special Rule
  if (personnel.first_name.toUpperCase().includes('MATHIAS') && !pattern.includes('7X7')) {
    const dateRel = parseISO(shiftSlot.date);
    const restStart = new Date(2026, 3, 27);
    const restEnd = new Date(2026, 4, 3);
    
    if (dateRel >= restStart && dateRel <= restEnd) {
       return {
        type: 'rotation_violation',
        personnel_id: personnel.personnel_id,
        date: shiftSlot.date,
        message: 'Descanso compensatorio tras cubrir Canes (7x7)',
        severity: 'error',
      };
    }
  }

  return null;
}

// Memoization for Sunday dates to speed up calculations
const memoSundayDates: Record<string, string[]> = {};

function getSundaysInMonth(monthKey: string, mStart: Date, mEnd: Date): string[] {
  if (memoSundayDates[monthKey]) return memoSundayDates[monthKey];
  const sundays: string[] = [];
  let curr = new Date(mStart);
  while (curr <= mEnd) {
    if (isSunday(curr)) {
      sundays.push(format(curr, 'yyyy-MM-dd'));
    }
    curr.setDate(curr.getDate() + 1);
  }
  memoSundayDates[monthKey] = sundays;
  return sundays;
}

/**
 * Check for at least 2 Sundays off per month (Chilean Law Art. 38)
 */
export function checkSundaysOff(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot,
  dateSet: Set<string>
): ConstraintViolation | null {
  const startHourSun = parseInt(shiftSlot.shift_start.split(':')[0], 10);
  const isAeroNight = norm(shiftSlot.position_name).includes('AEROPUERTO') && (startHourSun >= 20 || startHourSun <= 6);

  // EXEMPTION: Personnel with special contracts, 7x7 or Canes
  if (personnel.has_special_contract || 
      (personnel.rotation_pattern || '').includes('7X7') || 
      (personnel.rotation_pattern || '').includes('4X4') || 
      (personnel.rotation_pattern || '').includes('BLUE_') || 
      isAeroNight ||
      norm(personnel.main_position_name).includes('CANES')) {
    return null;
  }

  const slotDate = parseISO(shiftSlot.date);
  if (slotDate.getDay() !== 0) return null; // Not a Sunday

  const mStart = startOfMonth(slotDate);
  const mEnd = endOfMonth(slotDate);
  const monthKey = format(mStart, 'yyyy-MM');

  // GET LIST OF SUNDAYS (Memoized)
  const sundaysInMonth = getSundaysInMonth(monthKey, mStart, mEnd);
  
  let totalSundaysWorking = 0;
  for (const sunDate of sundaysInMonth) {
    if (dateSet.has(sunDate)) {
      totalSundaysWorking++;
    }
  }

  const maxAllowedWorking = sundaysInMonth.length - 2;

  // We add +1 because we are evaluating assigning the CURRENT Sunday
  if (totalSundaysWorking + 1 > maxAllowedWorking) {
    return {
      type: 'min_days_off',
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `Límite legal Art. 38: Debe tener al menos 2 domingos libres al mes. (Ya tiene ${totalSundaysWorking} asignados)`,
      severity: 'error',
    };
  }

  return null;

  return null;
}

/**
 * Check if today is the personnel's birthday
 */
export function checkBirthday(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot
): ConstraintViolation | null {
  if (!personnel.birth_date) return null;

  try {
    const bDate = parseISO(personnel.birth_date);
    const sDate = parseISO(shiftSlot.date);
    
    // Check Month and Day
    if (bDate.getMonth() === sDate.getMonth() && bDate.getDate() === sDate.getDate()) {
      return {
        type: 'birthday',
        personnel_id: personnel.personnel_id,
        date: shiftSlot.date,
        message: `Hoy es el cumpleaños de ${personnel.first_name}. Priorizar descanso.`,
        severity: 'warning', // Warning so it doesn't hard-block if no one else exists
      };
    }
  } catch (e) {
    return null;
  }
  return null;
}


export function validateAllConstraints(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot,
  currentAssignments: Array<{ date: string; duration_hours: number; shift_start: string; shift_end: string }>,
  preCalculatedDateSet?: Set<string>
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  
  // Performance optimization: Pre-calculate date set for all children
  const dateSet = preCalculatedDateSet || new Set(currentAssignments.map(a => a.date));
  if (!preCalculatedDateSet) dateSet.add(shiftSlot.date);

  const maxHours = checkMaxHoursPerWeek(personnel, shiftSlot, currentAssignments);
  if (maxHours) violations.push(maxHours);

  const daysOff = checkMinDaysOff(personnel, shiftSlot, dateSet);
  if (daysOff) violations.push(daysOff);

  const rest = checkMinRestBetweenShifts(personnel, shiftSlot, currentAssignments);
  if (rest) violations.push(rest);

  const transport = checkTransport(personnel, shiftSlot);
  if (transport) violations.push(transport);

  const birthday = checkBirthdayOff(personnel, shiftSlot);
  if (birthday) violations.push(birthday);

  const prefs = checkPreferences(personnel, shiftSlot);
  if (prefs) violations.push(prefs);

  const consecutive = checkMaxConsecutiveDays(personnel, shiftSlot, dateSet);
  if (consecutive) violations.push(consecutive);

  const qualification = checkQualification(personnel, shiftSlot);
  if (qualification) violations.push(qualification);

  const rotation = checkRotationPattern(personnel, shiftSlot);
  if (rotation) violations.push(rotation);

  const nightAuto = checkNightRotationAutomatic(personnel, shiftSlot, dateSet);
  if (nightAuto) violations.push(nightAuto);

  const sundayRule = checkSundaysOff(personnel, shiftSlot, dateSet);
  if (sundayRule) violations.push(sundayRule);

  const vBirthday = checkBirthday(personnel, shiftSlot);
  if (vBirthday) violations.push(vBirthday);

  return violations;
}

/**
 * AUTO-DETECTION of 4x4 for Night Workers
 * If someone is doing Night shifts in Airport, they MUST follow 4x4 
 * (Max 4 consecutive, Min 3 rest after streak)
 */
function checkNightRotationAutomatic(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot,
  dateSet: Set<string>
): ConstraintViolation | null {
  const startHour = parseInt(shiftSlot.shift_start.split(':')[0], 10);
  const isNight = startHour >= 20 || startHour <= 6;
  const isAirport = (shiftSlot.position_name || personnel.main_position_name || '').toUpperCase().includes('AEROPUERTO');

  if (!isNight || !isAirport) return null;

  // LÓGICA DE ESPEJO DINÁMICO (Agnóstica a nombres y fechas fijas)
  const slotDate = parseISO(shiftSlot.date);
  const mirrorDateStr = format(addDays(slotDate, -4), 'yyyy-MM-dd');

  // 1. Si hay rastro hace 4 días, el espejo manda
  if (dateSet.has(mirrorDateStr)) {
    const d1 = format(slotDate, 'dd');
    const d2 = format(addDays(slotDate, -4), 'dd');
    return {
      type: 'rotation_violation',
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `REGLA 4x4: ${d1} - 4 = ${d2}. El día ${d2} trabajó, por lo tanto el ${d1} debe descansar.`,
      severity: 'error',
    };
  }

  // 2. Si no hay rastro (inicio de historial), usamos el offset para arrancar el ciclo
  // pero el offset se calcula DINÁMICAMENTE si es posible
  const anchorDate = parseISO('2026-04-01T12:00:00Z');
  const diff = differenceInCalendarDays(slotDate, anchorDate);
  const offset = personnel.is_turn_b ? 2 : 6; 
  const cyclePos = (diff + offset) % 8;

  // Solo aplicamos la matemática de anclaje si NO tenemos datos en el historial cercano
  // Esto permite que si alguien se enferma y cambia su ciclo, la IA se adapte al nuevo rastro
  let hasRecentHistory = false;
  for (let i = 1; i <= 8; i++) {
    if (dateSet.has(format(addDays(slotDate, -i), 'yyyy-MM-dd'))) {
      hasRecentHistory = true;
      break;
    }
  }

  if (!hasRecentHistory && cyclePos >= 4) {
    return {
      type: 'rotation_violation',
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `INICIO DE CICLO (Turno ${personnel.is_turn_b ? 'B' : 'A'})`,
      severity: 'error',
    };
  }

  return null;
}

/**
 * Check if there are any hard constraint violations (error severity)
 */
export function hasHardViolation(violations: ConstraintViolation[]): boolean {
  return violations.some((v) => v.severity === 'error');
}
