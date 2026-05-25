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

/**
 * Fetch all data for the daily operational view
 */
export async function getDailyOperationalData(date: string) {
  const supabase = await createClient();

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

  return {
    assignments: (assignments || []) as ShiftAssignmentWithDetails[],
    requirements: (requirements || []) as ShiftRequirementWithDetails[],
  };
}

/**
 * Find personnel available for an extra shift on a specific date
 * Filters out those who already have a shift or are on leave.
 */
export async function getAvailableForExtra(date: string, positionId: string) {
  const supabase = await createClient();

  // 1. Get all personnel qualified for this position
  const { data: personnel, error: pErr } = await supabase
    .from('personnel')
    .select('*')
    .eq('is_active', true)
    .or(`main_position.eq.${positionId},secondary_positions.cs.{${positionId}}`);

  if (pErr) return { error: pErr.message };

  // 2. Get all assignments and leaves for this day to filter out busy people
  // IMPORTANT: Filter out 'cancelled' assignments as they don't block the person
  const { data: busyAssignments } = await supabase
    .from('shift_assignments')
    .select('personnel_id')
    .eq('date', date)
    .neq('status', 'cancelled');

  const { data: busyLeaves } = await supabase
    .from('leaves')
    .select('personnel_id')
    .lte('start_date', date)
    .gte('end_date', date)
    .eq('status', 'approved');

  const busyIds = new Set([
    ...(busyAssignments || []).map(a => a.personnel_id),
    ...(busyLeaves || []).map(l => l.personnel_id)
  ]);

  const available = (personnel || []).filter(p => {
    if (p.termination_date && date > p.termination_date) return false;
    return !busyIds.has(p.id);
  });

  // 3. FATIGUE CHECK: For each available person, check adjacent days
  const yesterday = format(subDays(parseISO(date), 1), 'yyyy-MM-dd');
  const tomorrow = format(addDays(parseISO(date), 1), 'yyyy-MM-dd');

  const { data: adjacentShifts } = await supabase
    .from('shift_assignments')
    .select('personnel_id, date, shift:shifts(start_time, end_time)')
    .in('personnel_id', available.map(p => p.id))
    .in('date', [yesterday, tomorrow]);

  const results = available.map(p => {
    const warnings: string[] = [];
    
    // Check if worked yesterday night
    const yestShift = adjacentShifts?.find(s => s.personnel_id === p.id && s.date === yesterday);
    if (yestShift && yestShift.shift) {
       // Handle cases where Supabase returns shift as an array due to explicit join
       const shiftData: any = Array.isArray(yestShift.shift) ? yestShift.shift[0] : yestShift.shift;
       if (shiftData?.start_time) {
         const startHour = parseInt(shiftData.start_time.split(':')[0], 10);
         if (startHour >= 20 || startHour < 4) {
           warnings.push('Trabajó anoche (Turno Nocturno)');
         }
       }
    }

    // Check if works tomorrow morning
    const tomShift = adjacentShifts?.find(s => s.personnel_id === p.id && s.date === tomorrow);
    if (tomShift && tomShift.shift) {
       const shiftData: any = Array.isArray(tomShift.shift) ? tomShift.shift[0] : tomShift.shift;
       if (shiftData?.start_time) {
         const startHour = parseInt(shiftData.start_time.split(':')[0], 10);
         if (startHour < 9) {
           warnings.push('Entra temprano mañana');
         }
       }
    }

    return {
      ...p,
      fatigue_warnings: warnings
    };
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

  if (error) return { success: false, error: error.message };

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
