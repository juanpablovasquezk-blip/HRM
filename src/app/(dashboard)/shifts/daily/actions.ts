'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { parseISO, format, addDays, subDays } from 'date-fns';
import type { ShiftAssignmentWithDetails, PersonnelWithDetails, ShiftRequirementWithDetails, Position, Shift } from '@/types/database';
import { generateTransportRequests } from '../../transport/actions';
import { validatePersonnelAvailabilityForDates } from '../actions';

export async function updateAssignmentShift(assignmentId: string, shiftId: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('shift_assignments')
    .update({ 
      shift_id: shiftId,
      is_manual: true 
    })
    .eq('id', assignmentId);

  if (error) return { success: false, error: error.message };
  revalidatePath('/shifts/daily');
  return { success: true };
}

export async function updateAssignmentDetails(
  assignmentId: string,
  shiftId: string,
  positionId: string,
  areaId: string
) {
  const supabase = createAdminClient();

  // Fetch existing assignment for audit log
  const { data: existing } = await supabase
    .from('shift_assignments')
    .select('id, personnel_id, date, shift_id, is_published')
    .eq('id', assignmentId)
    .single();

  if (existing && existing.shift_id !== shiftId) {
    try {
      await supabase.from('roster_audit_logs').insert({
        assignment_id: existing.id,
        personnel_id: existing.personnel_id,
        date: existing.date,
        previous_shift_id: existing.shift_id,
        new_shift_id: shiftId,
        was_published: existing.is_published === true,
        reason: 'Cambio rápido desde planificación diaria',
      });
    } catch (auditErr) {
      console.warn('[updateAssignmentDetails] Error inserting audit log:', auditErr);
    }
  }

  const { error } = await supabase
    .from('shift_assignments')
    .update({ 
      shift_id: shiftId,
      position_id: positionId,
      area_id: areaId,
      is_manual: true,
      is_validated: true,
      is_published: true
    })
    .eq('id', assignmentId);

  if (error) return { success: false, error: error.message };
  revalidatePath('/shifts/daily');
  revalidatePath('/shifts/roster');
  return { success: true };
}


/**
 * Fetch all data for the daily operational view
 */
export async function getDailyOperationalData(date: string) {
  const supabase = createAdminClient();

  // 1. Get all assignments for this day
  const { data: assignments, error: assErr } = await supabase
    .from('shift_assignments')
    .select('*, personnel:personnel(*), shift:shifts!shift_assignments_shift_id_fkey(*), area:areas(*), position:positions(*)')
    .eq('date', date);

  // 2. Get all requirements (regular + extra) for this day
  const { data: requirements, error: reqErr } = await supabase
    .from('shift_requirements')
    .select('*, shift:shifts(*), area:areas(*), position:positions(*)')
    .eq('date', date);

  if (assErr || reqErr) {
    console.error('Error fetching daily data:', assErr || reqErr);
    return { error: 'Error al cargar datos operativos' };
  }

  // 3. Count how many active extra assignments exist for each requirement slot (server-side)
  const { data: extraAssignments, error: extraErr } = await supabase
    .from('shift_assignments')
    .select('shift_id, area_id, position_id, personnel_id, status')
    .eq('date', date)
    .eq('is_extra', true)
    .neq('status', 'cancelled');

  console.log(`[getDailyOperationalData] date=${date} extraAssignments found: ${extraAssignments?.length ?? 0}`, 
    extraErr ? `ERROR: ${extraErr.message}` : '',
    JSON.stringify(extraAssignments?.map(e => ({ sid: e.shift_id, aid: e.area_id, pid: e.position_id, per: e.personnel_id, st: e.status })))
  );

  // Build a lookup: "shift_id|area_id|position_id" -> count
  const extraFillCount = new Map<string, number>();
  for (const ea of extraAssignments || []) {
    const key = `${ea.shift_id}|${ea.area_id}|${ea.position_id}`;
    extraFillCount.set(key, (extraFillCount.get(key) || 0) + 1);
  }

  // Attach filled_count to each extra requirement
  const extraReqs = (requirements || []).filter(r => r.is_extra);
  for (const r of extraReqs) {
    const key = `${r.shift_id}|${r.area_id}|${r.position_id}`;
    const count = extraFillCount.get(key) || 0;
    console.log(`[getDailyOperationalData] Extra req: key=${key} required=${r.required_count} filled=${count}`);
  }

  const requirementsWithFill = (requirements || []).map(r => ({
    ...r,
    filled_count: r.is_extra
      ? (extraFillCount.get(`${r.shift_id}|${r.area_id}|${r.position_id}`) || 0)
      : 0,
  }));

  const activeAssignments = (assignments || []).filter(a => {
    const p = a.personnel as any;
    if (!p) return false;
    if (p.termination_date && date > p.termination_date) return false;
    const todayStr = new Date().toLocaleDateString('sv');
    if (!p.is_active && date >= todayStr) return false;
    return true;
  }) as ShiftAssignmentWithDetails[];

  // Deduplicate non-extra assignments per person: keep only the most recent one
  // (highest created_at / id) and auto-delete older duplicates from DB.
  const seenPersonNormal = new Map<string, ShiftAssignmentWithDetails>();
  const duplicateIds: string[] = [];

  for (const a of activeAssignments) {
    if ((a as any).is_extra) continue; // extra shifts are allowed to coexist
    const pid = (a as any).personnel_id as string;
    const prev = seenPersonNormal.get(pid);
    if (!prev) {
      seenPersonNormal.set(pid, a);
    } else {
      // Keep the one with the greater id (more recently created), discard the other
      if (a.id > prev.id) {
        duplicateIds.push(prev.id);
        seenPersonNormal.set(pid, a);
      } else {
        duplicateIds.push(a.id);
      }
    }
  }

  // Async cleanup of duplicates in the background (non-blocking)
  if (duplicateIds.length > 0) {
    const adminClient = createAdminClient();
    adminClient.from('shift_assignments').delete().in('id', duplicateIds)
      .then(({ error }) => {
        if (error) console.error('[getDailyOperationalData] Error deleting duplicate assignments:', error.message);
        else console.log(`[getDailyOperationalData] Auto-deleted ${duplicateIds.length} duplicate assignment(s) for ${date}`);
      });
  }

  // Rebuild deduplicated list: all extra + one non-extra per person
  const dedupedAssignments = activeAssignments.filter(a =>
    (a as any).is_extra || seenPersonNormal.get((a as any).personnel_id)?.id === a.id
  );

  return {
    assignments: dedupedAssignments,
    requirements: requirementsWithFill as ShiftRequirementWithDetails[],
  };
}


function getShiftInterval(dateStr: string, startTime: string, endTime: string): { start: Date; end: Date } | null {
  if (!dateStr || !startTime || !endTime) return null;
  const cleanStart = startTime.trim();
  const cleanEnd = endTime.trim();
  try {
    const start = new Date(`${dateStr}T${cleanStart}`);
    let end = new Date(`${dateStr}T${cleanEnd}`);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return null;
    }
    if (end <= start) {
      const parsedDate = parseISO(dateStr);
      const nextDayStr = format(addDays(parsedDate, 1), 'yyyy-MM-dd');
      end = new Date(`${nextDayStr}T${cleanEnd}`);
    }
    return { start, end };
  } catch (e) {
    return null;
  }
}

/**
 * Find personnel available for an extra shift on a specific date
 * Filters out those who already have a shift or are on leave.
 */
export async function getAvailableForExtra(date: string, positionId: string, extraShiftId?: string) {
  const supabase = createAdminClient();

  // 1. Get all personnel qualified for this position
  const { data: personnel, error: pErr } = await supabase
    .from('personnel')
    .select('*')
    .eq('is_active', true)
    .or(`main_position.eq.${positionId},secondary_positions.cs.{${positionId}}`);

  if (pErr) return { error: pErr.message };

  // Get details of the extra shift if ID is provided
  let extraShift: any = null;
  if (extraShiftId) {
    const { data: esData } = await supabase
      .from('shifts')
      .select('id, name, start_time, end_time')
      .eq('id', extraShiftId)
      .single();
    extraShift = esData;
  }

  // 2. Get all assignments and leaves for this day
  const { data: busyLeaves } = await supabase
    .from('leaves')
    .select('personnel_id')
    .lte('start_date', date)
    .gte('end_date', date)
    .eq('status', 'approved');

  const leaveIds = new Set((busyLeaves || []).map(l => l.personnel_id));

  // Exclude personnel on approved leave
  const available = (personnel || []).filter(p => {
    if (p.termination_date && date > p.termination_date) return false;
    return !leaveIds.has(p.id);
  });

  if (available.length === 0) return { data: [] };

  const yesterday = format(subDays(parseISO(date), 1), 'yyyy-MM-dd');
  const tomorrow = format(addDays(parseISO(date), 1), 'yyyy-MM-dd');

  // 3. Get all assignments for the 3-day window for the available personnel
  const { data: allAssignments } = await supabase
    .from('shift_assignments')
    .select('personnel_id, date, shift:shifts(id, name, start_time, end_time)')
    .in('personnel_id', available.map(p => p.id))
    .in('date', [yesterday, date, tomorrow])
    .neq('status', 'cancelled');

  // Create a map to store current assignments for this day
  const assignmentMap = new Map<string, string>();
  if (allAssignments) {
    allAssignments.forEach(a => {
      if (a.date === date) {
        const shiftData: any = Array.isArray(a.shift) ? a.shift[0] : a.shift;
        if (shiftData?.name) {
          assignmentMap.set(a.personnel_id, shiftData.name);
        }
      }
    });
  }

  const results = available.map(p => {
    const warnings: string[] = [];
    let isOverlapping = false;
    let overlappingShiftName: string | null = null;
    
    // Find all assignments for this person in the 3-day window
    const pAssignments = allAssignments?.filter(s => s.personnel_id === p.id) || [];
    
    // Check if worked yesterday night (fatigue check)
    const yestShift = pAssignments.find(s => s.date === yesterday);
    if (yestShift && yestShift.shift) {
       const shiftData: any = Array.isArray(yestShift.shift) ? yestShift.shift[0] : yestShift.shift;
       if (shiftData?.start_time) {
         const startHour = parseInt(shiftData.start_time.split(':')[0], 10);
         if (startHour >= 20 || startHour < 4) {
           warnings.push('Trabajó anoche (Turno Nocturno)');
         }
       }
    }

    // Check if works tomorrow morning (fatigue check)
    const tomShift = pAssignments.find(s => s.date === tomorrow);
    if (tomShift && tomShift.shift) {
       const shiftData: any = Array.isArray(tomShift.shift) ? tomShift.shift[0] : tomShift.shift;
       if (shiftData?.start_time) {
         const startHour = parseInt(shiftData.start_time.split(':')[0], 10);
         if (startHour < 9) {
           warnings.push('Entra temprano mañana');
         }
       }
    }

    // Check physical overlap with the target extra shift (if extraShift is provided)
    if (extraShift && extraShift.start_time && extraShift.end_time) {
      for (const ass of pAssignments) {
        const assShift: any = Array.isArray(ass.shift) ? ass.shift[0] : ass.shift;
        if (assShift && assShift.start_time && assShift.end_time) {
          const int1 = getShiftInterval(ass.date, assShift.start_time, assShift.end_time);
          const int2 = getShiftInterval(date, extraShift.start_time, extraShift.end_time);
          if (int1 && int2 && int1.start < int2.end && int2.start < int1.end) {
            isOverlapping = true;
            overlappingShiftName = assShift.name;
            break;
          }
        }
      }
    }

    const currentShiftName = assignmentMap.get(p.id) || null;
    const finalAlreadyAssigned = currentShiftName !== null || isOverlapping;
    const finalShiftName = currentShiftName || (overlappingShiftName ? `${overlappingShiftName} (Traslape)` : null);

    return {
      ...p,
      fatigue_warnings: warnings,
      already_assigned: finalAlreadyAssigned,
      current_shift_name: finalShiftName
    };
  });

  // Sort by restriction level:
  // 1. Negros sin símbolo (!already_assigned, no fatigue warnings)
  // 2. Negros con símbolo (!already_assigned, has fatigue warnings)
  // 3. Naranjos sin símbolo (already_assigned, no fatigue warnings)
  // 4. Naranjos con símbolo (already_assigned, has fatigue warnings)
  // Alphabetical within same tier
  results.sort((a, b) => {
    const getTier = (item: typeof a) => {
      const hasWarning = Array.isArray(item.fatigue_warnings) && item.fatigue_warnings.length > 0;
      if (!item.already_assigned && !hasWarning) return 0;
      if (!item.already_assigned && hasWarning) return 1;
      if (item.already_assigned && !hasWarning) return 2;
      return 3;
    };

    const tierA = getTier(a);
    const tierB = getTier(b);

    if (tierA !== tierB) {
      return tierA - tierB;
    }

    const nameA = `${a.first_name || ''} ${a.last_name_father || ''}`.trim();
    const nameB = `${b.first_name || ''} ${b.last_name_father || ''}`.trim();
    return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
  });

  return { data: results };
}

/**
 * Add an extra requirement for a specific day
 */
export async function addExtraRequirement(formData: FormData) {
  const supabase = createAdminClient();
  
  const date = formData.get('date') as string;
  const shiftId = formData.get('shift_id') as string;
  const areaId = formData.get('area_id') as string;
  const positionId = formData.get('position_id') as string;
  const count = parseInt(formData.get('count') as string, 10) || 1;

  // 1. Check if an EXTRA requirement already exists for this slot
  const { data: existing } = await supabase
    .from('shift_requirements')
    .select('id, required_count')
    .eq('date', date)
    .eq('shift_id', shiftId)
    .eq('area_id', areaId)
    .eq('position_id', positionId)
    .eq('is_extra', true)
    .maybeSingle();

  if (existing) {
    // Increment the count of the existing extra requirement
    await supabase
      .from('shift_requirements')
      .update({ required_count: existing.required_count + count })
      .eq('id', existing.id);
  } else {
    // Create a new extra requirement
    const { error } = await supabase.from('shift_requirements').insert({
      date,
      shift_id: shiftId,
      area_id: areaId,
      position_id: positionId,
      required_count: count,
      is_extra: true
    });
    if (error) return { success: false, error: error.message };
  }

  revalidatePath('/shifts/daily');
  return { success: true };
}

/**
 * Assign a person to an extra slot
 */
export async function assignExtraPersonnel(
  date: string,
  shiftId: string,
  areaId: string,
  positionId: string,
  personnelId: string
) {
  const supabase = createAdminClient();

  // Validate personnel availability
  const validation = await validatePersonnelAvailabilityForDates(personnelId, [date]);
  if (!validation.success) {
    return { success: false, error: validation.error };
  }

  // Check if the extra assignment already exists (could be active or cancelled)
  const { data: existing } = await supabase
    .from('shift_assignments')
    .select('id, status')
    .eq('date', date)
    .eq('shift_id', shiftId)
    .eq('personnel_id', personnelId)
    .eq('is_extra', true)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'cancelled') {
      // Re-activate the cancelled assignment instead of inserting a new one
      console.log(`[assignExtraPersonnel] Reactivating cancelled assignment ${existing.id}`);
      const { error } = await supabase
        .from('shift_assignments')
        .update({ status: 'scheduled', area_id: areaId, position_id: positionId, is_manual: true })
        .eq('id', existing.id);
      if (error) return { success: false, error: error.message };
    } else {
      console.log(`[assignExtraPersonnel] Already active: ${existing.id}`);
    }
    revalidatePath('/shifts/daily');
    return { success: true };
  }

  const { error } = await supabase.from('shift_assignments').insert({
    date,
    shift_id: shiftId,
    area_id: areaId,
    position_id: positionId,
    personnel_id: personnelId,
    is_extra: true,
    is_manual: true,
    status: 'scheduled'
  });

  if (error) {
    console.error(`[assignExtraPersonnel] Insert error: ${error.message}`);
    return { success: false, error: error.message };
  }

  revalidatePath('/shifts/daily');
  return { success: true };
}

/**
 * Confirm the daily plan (sets is_confirmed = true for all assignments of that day)
 */
export async function confirmDailyPlan(date: string) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('shift_assignments')
    .update({ is_confirmed: true })
    .eq('date', date);

  if (error) return { success: false, error: error.message };

  await generateTransportRequests(date);

  revalidatePath('/shifts/daily');
  return { success: true };
}

/**
 * Cancel an assignment (mark as cancelled instead of deleting)
 */
export async function cancelAssignment(id: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('shift_assignments')
    .update({ status: 'cancelled' })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/shifts/daily');
  revalidatePath('/shifts/roster');
  return { success: true };
}

export async function resetDailyPlan(date: string) {
  const supabase = createAdminClient();

  // 1. Remove all extra assignments for this day
  await supabase
    .from('shift_assignments')
    .delete()
    .eq('date', date)
    .eq('is_extra', true);

  // 2. Remove extra requirements
  await supabase
    .from('shift_requirements')
    .delete()
    .eq('date', date)
    .eq('is_extra', true);

  // 3. Reset status of regular assignments to 'scheduled' and is_confirmed to false
  await supabase
    .from('shift_assignments')
    .update({ status: 'scheduled', is_confirmed: false })
    .eq('date', date)
    .eq('is_extra', false);

  // 3.1. Re-cancel assignments for personnel on approved leave today
  const { data: leaves } = await supabase
    .from('leaves')
    .select('personnel_id')
    .eq('status', 'approved')
    .lte('start_date', date)
    .gte('end_date', date);

  if (leaves && leaves.length > 0) {
    const leavePersonnelIds = leaves.map(l => l.personnel_id);
    await supabase
      .from('shift_assignments')
      .update({ status: 'cancelled' })
      .eq('date', date)
      .in('personnel_id', leavePersonnelIds);
  }

  // 3.2. Re-cancel assignments for personnel deactivated or terminated today or prior
  const { data: inactivePersonnel } = await supabase
    .from('personnel')
    .select('id')
    .or(`is_active.eq.false,termination_date.lte.${date}`);

  if (inactivePersonnel && inactivePersonnel.length > 0) {
    const inactivePersonnelIds = inactivePersonnel.map(p => p.id);
    await supabase
      .from('shift_assignments')
      .update({ status: 'cancelled' })
      .eq('date', date)
      .in('personnel_id', inactivePersonnelIds);
  }

  // 4. Delete transport requests for this day to allow regeneration
  await supabase
    .from('transport_requests')
    .delete()
    .eq('date', date);

  revalidatePath('/shifts/daily');
  revalidatePath('/transport');
  return { success: true };
}

export async function confirmPlan(date: string) {
  const supabase = createAdminClient();
  
  // Mark all active assignments for this day as confirmed
  const { error } = await supabase
    .from('shift_assignments')
    .update({ is_confirmed: true })
    .eq('date', date)
    .neq('status', 'cancelled');

  if (error) return { success: false, error: error.message };
  
  const transportRes = await generateTransportRequests(date);
  
  revalidatePath('/shifts/daily');
  return transportRes;
}

export async function swapAssignments(id1: string, id2: string) {
  const supabase = createAdminClient();

  // 1. Fetch both assignments with shift details
  const { data: ass1, error: err1 } = await supabase
    .from('shift_assignments')
    .select('*, shift:shifts(*)')
    .eq('id', id1)
    .single();

  const { data: ass2, error: err2 } = await supabase
    .from('shift_assignments')
    .select('*, shift:shifts(*)')
    .eq('id', id2)
    .single();

  if (err1 || err2 || !ass1 || !ass2) {
    return { success: false, error: 'No se encontraron las asignaciones' };
  }

  // 2. Validate same date
  if (ass1.date !== ass2.date) {
    return { success: false, error: 'Las asignaciones deben ser de la misma fecha' };
  }

  // 3. Validate same position (role)
  if (ass1.position_id !== ass2.position_id) {
    return { success: false, error: 'Las asignaciones deben tener el mismo cargo o puesto para ser intercambiadas' };
  }

  // 4. Validate same schedule (shift_id must be the same, or start and end times must match)
  const shift1 = Array.isArray(ass1.shift) ? ass1.shift[0] : ass1.shift;
  const shift2 = Array.isArray(ass2.shift) ? ass2.shift[0] : ass2.shift;

  const sameShift = ass1.shift_id === ass2.shift_id || 
    (shift1 && shift2 && shift1.start_time === shift2.start_time && shift1.end_time === shift2.end_time);

  if (!sameShift) {
    return { success: false, error: 'Las asignaciones deben tener el mismo horario para ser intercambiadas' };
  }

  // 5. Swap the personnel (and is_extra) sequentially to bypass unique(personnel_id, date, shift_id) constraint
  // is_extra follows the PERSON, not the assignment row
  const originalDate = ass1.date;
  const isExtra1 = ass1.is_extra ?? false;
  const isExtra2 = ass2.is_extra ?? false;
  
  // Step 1: Temporarily move assignment 1 to a dummy date to free up its personnel_id on TODAY
  const { error: step1Err } = await supabase
    .from('shift_assignments')
    .update({ date: '1970-01-01', is_manual: true })
    .eq('id', id1);

  if (step1Err) {
    console.error('Error in swap step 1:', step1Err);
    return { success: false, error: 'Error al iniciar el intercambio de personal' };
  }

  // Step 2: Assign personnel 1 to assignment 2 (with its is_extra flag)
  const { error: step2Err } = await supabase
    .from('shift_assignments')
    .update({ personnel_id: ass1.personnel_id, is_extra: isExtra1, is_manual: true })
    .eq('id', id2);

  if (step2Err) {
    console.error('Error in swap step 2:', step2Err);
    // Rollback step 1
    await supabase.from('shift_assignments').update({ date: originalDate }).eq('id', id1);
    return { success: false, error: 'Error al completar el paso 2 del intercambio' };
  }

  // Step 3: Assign personnel 2 to assignment 1 (with its is_extra flag) and restore its date
  const { error: step3Err } = await supabase
    .from('shift_assignments')
    .update({ personnel_id: ass2.personnel_id, is_extra: isExtra2, date: originalDate, is_manual: true })
    .eq('id', id1);

  if (step3Err) {
    console.error('Error in swap step 3:', step3Err);
    // Rollback step 2 & 1
    await supabase.from('shift_assignments').update({ personnel_id: ass2.personnel_id, is_extra: isExtra2 }).eq('id', id2);
    await supabase.from('shift_assignments').update({ date: originalDate }).eq('id', id1);
    return { success: false, error: 'Error al finalizar el intercambio de personal' };
  }

  // 5. Clean up transport requests for these assignments (if confirmed)
  if (ass1.is_confirmed || ass2.is_confirmed) {
    await supabase
      .from('transport_requests')
      .delete()
      .in('assignment_id', [id1, id2]);
      
    // Regenerate transport requests for this date
    await generateTransportRequests(ass1.date);
  }

  revalidatePath('/shifts/daily');
  return { success: true };
}
