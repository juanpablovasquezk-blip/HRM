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

import { differenceInHours, parseISO, isSameDay, startOfWeek, endOfWeek, eachDayOfInterval, isSunday, startOfMonth, endOfMonth, format, differenceInCalendarDays } from 'date-fns';
import type { ConstraintViolation, PersonnelAvailability, ShiftSlot } from './types';

const MAX_HOURS_PER_WEEK = 40;
const MIN_DAYS_OFF_PER_WEEK = 2;
const MIN_REST_HOURS = 10;

/**
 * Check if assigning this shift would exceed 40 hours/week
 */
export function checkMaxHoursPerWeek(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot,
  currentAssignments: Array<{ date: string; duration_hours: number }>
): ConstraintViolation | null {
  // EXEMPTION: Canes, 7x7 or Special Contracts
  if (personnel.has_special_contract || 
      (personnel.rotation_pattern || '').includes('7X7') || 
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

  if (projectedHours > MAX_HOURS_PER_WEEK) {
    return {
      type: 'max_hours',
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `Would exceed ${MAX_HOURS_PER_WEEK}h/week (projected: ${projectedHours.toFixed(1)}h)`,
      severity: 'warning',
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
  currentAssignments: Array<{ date: string }>
): ConstraintViolation | null {
  // EXEMPTION: Canes, 7x7 or Special Contracts
  if (personnel.has_special_contract || 
      (personnel.rotation_pattern || '').includes('7X7') || 
      norm(personnel.main_position_name).includes('CANES') ||
      norm(shiftSlot.position_name).includes('CANES')) {
    return null;
  }

  const slotDate = parseISO(shiftSlot.date);
  const weekStart = startOfWeek(slotDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(slotDate, { weekStartsOn: 1 });

  const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const assignedDates = new Set(
    currentAssignments
      .filter((a) => {
        const d = parseISO(a.date);
        return d >= weekStart && d <= weekEnd;
      })
      .map((a) => a.date)
  );

  // Adding this day
  assignedDates.add(shiftSlot.date);

  const workingDays = assignedDates.size;
  const daysOff = daysInWeek.length - workingDays;

  if (daysOff < MIN_DAYS_OFF_PER_WEEK) {
    return {
      type: 'min_days_off',
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `Only ${daysOff} day(s) off this week (minimum: ${MIN_DAYS_OFF_PER_WEEK})`,
      severity: 'warning',
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

    const restHours = differenceInHours(currentStart, prevEnd);

    if (restHours >= 0 && restHours < MIN_REST_HOURS) {
      return {
        type: 'min_rest',
        personnel_id: personnel.personnel_id,
        date: shiftSlot.date,
        message: `Only ${restHours}h rest after previous shift (minimum: ${MIN_REST_HOURS}h)`,
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
  allAssignments: Array<{ date: string }>
): ConstraintViolation | null {
  // EXEMPTION: Canes, 7x7 or Special Contracts
  if (personnel.has_special_contract || 
      (personnel.rotation_pattern || '').includes('7X7') || 
      norm(personnel.main_position_name).includes('CANES') ||
      norm(shiftSlot.position_name).includes('CANES')) {
    return null;
  }

  const MAX_CONSECUTIVE = 7;
  const slotDate = parseISO(shiftSlot.date);
  
  // Combine current assignments with the new one
  const sortedDates = [...allAssignments.map(a => parseISO(a.date)), slotDate]
    .sort((a, b) => a.getTime() - b.getTime())
    .map(d => d.toISOString().split('T')[0]);

  // Find the streak for the current slot
  let streak = 1;
  const currentIdx = sortedDates.indexOf(shiftSlot.date);

  // Look back
  let checkDate = new Date(slotDate);
  while (true) {
    checkDate.setDate(checkDate.getDate() - 1);
    const dateStr = checkDate.toISOString().split('T')[0];
    if (sortedDates.includes(dateStr)) {
      streak++;
    } else {
      break;
    }
  }

  // Look forward
  checkDate = new Date(slotDate);
  while (true) {
    checkDate.setDate(checkDate.getDate() + 1);
    const dateStr = checkDate.toISOString().split('T')[0];
    if (sortedDates.includes(dateStr)) {
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

const norm = (s: string = '') => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

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

  // 1. Direct match by ID
  if (personnel.main_position === shiftSlot.position_id) return null;
  if ((personnel.secondary_positions || []).includes(shiftSlot.position_id)) return null;

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

  // Also prevent non-qualified people from covering specific high-security roles like CANES
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

  return {
    type: 'preference',
    personnel_id: personnel.personnel_id,
    date: shiftSlot.date,
    message: `No calificado para ${shiftSlot.position_name}`,
    severity: 'error',
  };
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
  const date = parseISO(shiftSlot.date);
  
  // Reference anchor for cycles in April 2026
  const anchorDate = new Date(2026, 3, 1); // April 1st
  const daysSinceAnchor = Math.floor((date.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24));

  // L-V (Estricto Lunes a Viernes)
  if (pattern.includes('L-V') || pattern.includes('LUNES A VIERNES')) {
    const day = date.getDay();
    // EXCEPTION: If they are covering CANES (Mathias rule), allow weekends
    const isMathiasCoveringCanes = norm(personnel.first_name).includes('MATHIAS') && norm(shiftSlot.position_name).includes('CANES');
    
    if ((day === 0 || day === 6) && !isMathiasCoveringCanes) {
      return {
        type: 'rotation_violation',
        personnel_id: personnel.personnel_id,
        date: shiftSlot.date,
        message: 'Personal L-V no trabaja fines de semana',
        severity: 'error',
      };
    }
  }

  // Rule: NOCHE patterns should ONLY work night shifts
  if (pattern.includes('NOCHE')) {
    const startHour = parseInt(shiftSlot.shift_start.split(':')[0], 10);
    const isNightShift = startHour >= 20 || startHour < 6;
    if (!isNightShift) {
       return {
        type: 'rotation_violation',
        personnel_id: personnel.personnel_id,
        date: shiftSlot.date,
        message: 'Personal de noche no puede cubrir turnos de día',
        severity: 'error',
      };
    }
  }

  // REGLA DE TURNO FIJO Y ÁREA (Desde la ficha personal)
  // Si tiene turno fijo, solo puede trabajar en ese turno.
  if (personnel.fixed_shift_id && personnel.fixed_shift_id !== shiftSlot.shift_id) {
    // FALLBACK: Si los IDs no coinciden, verificar si el NOMBRE del turno es el mismo
    // Esto previene bloqueos por IDs obsoletos en la ficha personal
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

  // PROTECCIÓN PERSONAL FIJO EN BASE (Emilio, Lizardo, etc.)
  const firstName = personnel.first_name.toUpperCase();
  const isFixedBasePerson = firstName.includes('EMILIO') || firstName.includes('LIZARDO');
  const isBaseMinerquim = (shiftSlot.area_name || '').toUpperCase().includes('BASE');
  
  if (isFixedBasePerson && !isBaseMinerquim) {
    return {
      type: 'rotation_violation',
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: 'Este trabajador solo puede ser asignado a la BASE MINERQUIM',
      severity: 'error',
    };
  }

  // REGLA DE ORO DE IDENTIDAD DE CARGO
  const pPos = (personnel.main_position_name || '').toUpperCase();
  const sPos = (shiftSlot.position_name || '').toUpperCase();
  
  // Si los IDs coinciden EXACTAMENTE, es el puesto correcto. No hay violación.
  if (personnel.main_position === shiftSlot.position_id) return null;

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

  // EXEMPTION: Mathias Rozas covering Canes
  const isMathias = personnel.first_name.toUpperCase().includes('MATHIAS');
  const isCanesSlot = (shiftSlot.position_name || '').toUpperCase().includes('CANES');
  if (isMathias && isCanesSlot) return null;

  // 7x7 (Strict comparison)
  const normPattern = (personnel.rotation_pattern || '').toUpperCase();
  if (normPattern.includes('7X7')) {
    // Reference anchor for cycles: April 1st, 2026
    const anchor = new Date(2026, 3, 1); 
    const isMathias = firstName.includes('MATHIAS');
    
    // Use calendar days difference to be time-zone agnostic
    const diffDays = differenceInCalendarDays(date, anchor);
    
    // Determine offset: Mathias is Turn B (offset 7), others are Turn A
    // Andres (Turn A): Cycle starts at anchor+2 to match April 13th
    const offset = isMathias ? 9 : 2; 
    
    const cyclePos = (diffDays + offset) % 14; 
    if (cyclePos >= 7) {
      return {
        type: 'rotation_violation',
        personnel_id: personnel.personnel_id,
        date: shiftSlot.date,
        message: `DESCANSO OBLIGATORIO 7x7 (Turno ${isMathias ? 'B' : 'A'})`,
        severity: 'error',
      };
    }
  }


  // 4x4 (Aeropuerto)
  if (pattern.includes('4X4')) {
    // Offset +7 matches Marcelo Jara working 18-21
    const cyclePos = (daysSinceAnchor + 7) % 8; 
    if (cyclePos >= 4) {
      return {
        type: 'rotation_violation',
        personnel_id: personnel.personnel_id,
        date: shiftSlot.date,
        message: 'Periodo de descanso 4x4',
        severity: 'error',
      };
    }
  }

  // Regla Especial Mathias Rozas: Si cubrió Canes (7x7), necesita descanso equivalente
  if (personnel.first_name.toUpperCase().includes('MATHIAS') && !pattern.includes('7X7')) {
    const date = parseISO(shiftSlot.date);
    const restStart = new Date(2026, 3, 27); // 27 de Abril (Mes 3 en JS es Abril)
    const restEnd = new Date(2026, 4, 3);    // 03 de Mayo (Mes 4 en JS es Mayo)
    
    if (date >= restStart && date <= restEnd) {
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

// Memoization for Sundays count to speed up calculations
const memoSundays: Record<string, number> = {};

/**
 * Check for at least 2 Sundays off per month (Chilean Law Art. 38)
 * Optimized version: expects pre-processed sunday assignments
 */
export function checkSundaysOff(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot,
  allAssignments: Array<{ date: string }>
): ConstraintViolation | null {
  // EXEMPTION: Personnel with special contracts, 7x7 or Canes
  if (personnel.has_special_contract || 
      (personnel.rotation_pattern || '').includes('7X7') || 
      norm(personnel.main_position_name).includes('CANES')) {
    return null;
  }

  const slotDate = parseISO(shiftSlot.date);
  if (slotDate.getDay() !== 0) return null; // Not a Sunday

  const mStart = startOfMonth(slotDate);
  const mEnd = endOfMonth(slotDate);
  const monthKey = format(mStart, 'yyyy-MM');

  // Use memoized Sunday count for the month
  if (!memoSundays[monthKey]) {
    let count = 0;
    let curr = new Date(mStart);
    while (curr <= mEnd) {
      if (curr.getDay() === 0) count++;
      curr.setDate(curr.getDate() + 1);
    }
    memoSundays[monthKey] = count;
  }
  
  const sundaysInMonth = memoSundays[monthKey];
  
  // COUNT SUNDAYS: This is the hot path. 
  // Optimization: use the pre-calculated assigned_dates if available
  let assignedSundays = 0;
  
  // Use assigned_dates Set for O(1) lookups instead of O(N) loop
  // We need to check all Sundays in the month
  let curr = new Date(mStart);
  while (curr <= mEnd) {
    const dStr = format(curr, 'yyyy-MM-dd');
    if (curr.getDay() === 0 && personnel.assigned_dates.has(dStr)) {
      assignedSundays++;
    }
    curr.setDate(curr.getDate() + 1);
  }

  const totalSundaysWorking = assignedSundays + 1;
  const sundaysOff = sundaysInMonth - totalSundaysWorking;

  if (sundaysOff < 2) {
    return {
      type: 'min_days_off',
      personnel_id: personnel.personnel_id,
      date: shiftSlot.date,
      message: `Debe tener al menos 2 domingos libres al mes (quedarían: ${sundaysOff})`,
      severity: 'error',
    };
  }

  return null;
}

export function validateAllConstraints(
  personnel: PersonnelAvailability,
  shiftSlot: ShiftSlot,
  currentAssignments: Array<{ date: string; duration_hours: number; shift_start: string; shift_end: string }>
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  const maxHours = checkMaxHoursPerWeek(personnel, shiftSlot, currentAssignments);
  if (maxHours) violations.push(maxHours);

  const daysOff = checkMinDaysOff(personnel, shiftSlot, currentAssignments);
  if (daysOff) violations.push(daysOff);

  const rest = checkMinRestBetweenShifts(personnel, shiftSlot, currentAssignments);
  if (rest) violations.push(rest);

  const birthday = checkBirthdayOff(personnel, shiftSlot);
  if (birthday) violations.push(birthday);

  const prefs = checkPreferences(personnel, shiftSlot);
  if (prefs) violations.push(prefs);

  const consecutive = checkMaxConsecutiveDays(personnel, shiftSlot, currentAssignments);
  if (consecutive) violations.push(consecutive);

  const qualification = checkQualification(personnel, shiftSlot);
  if (qualification) violations.push(qualification);

  const rotation = checkRotationPattern(personnel, shiftSlot);
  if (rotation) violations.push(rotation);

  const sundayRule = checkSundaysOff(personnel, shiftSlot, currentAssignments);
  if (sundayRule) violations.push(sundayRule);

  return violations;
}

/**
 * Check if there are any hard constraint violations (error severity)
 */
export function hasHardViolation(violations: ConstraintViolation[]): boolean {
  return violations.some((v) => v.severity === 'error');
}