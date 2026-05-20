'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function getFormMetadata() {
  const supabase = await createClient();

  const [personnelRes, shiftsRes, areasRes, positionsRes] = await Promise.all([
    supabase
      .from('personnel')
      .select('id, first_name, last_name_father, last_name_mother')
      .is('termination_date', null)
      .order('first_name'),
    supabase
      .from('shifts')
      .select('id, name, start_time, end_time')
      .order('name'),
    supabase
      .from('areas')
      .select('id, name')
      .order('name'),
    supabase
      .from('positions')
      .select('id, name')
      .order('name')
  ]);

  if (personnelRes.error) return { error: personnelRes.error.message };
  if (shiftsRes.error) return { error: shiftsRes.error.message };
  if (areasRes.error) return { error: areasRes.error.message };
  if (positionsRes.error) return { error: positionsRes.error.message };

  return {
    data: {
      personnel: personnelRes.data,
      shifts: shiftsRes.data,
      areas: areasRes.data,
      positions: positionsRes.data
    }
  };
}

export async function getHistoricalData() {
  const supabase = await createClient();

  // Fetch extra shifts
  const { data: extraShifts, error: shiftsError } = await supabase
    .from('shift_assignments')
    .select(`
      id,
      date,
      is_extra,
      personnel:personnel!shift_assignments_personnel_id_fkey(id, first_name, last_name_father),
      shift:shifts!shift_assignments_shift_id_fkey(id, name, start_time, end_time),
      area:areas(id, name),
      position:positions(id, name)
    `)
    .eq('is_extra', true)
    .order('date', { ascending: false })
    .limit(100);

  // Fetch own transports
  const { data: ownTransports, error: transportsError } = await supabase
    .from('transport_requests')
    .select(`
      id,
      date,
      transport_type,
      personnel:personnel!transport_requests_personnel_id_fkey(id, first_name, last_name_father)
    `)
    .eq('transport_type', 'PROPIO')
    .order('date', { ascending: false })
    .limit(100);

  if (shiftsError) {
    console.error('Error fetching extra shifts:', shiftsError);
    return { error: shiftsError.message };
  }
  if (transportsError) {
    console.error('Error fetching own transports:', transportsError);
    return { error: transportsError.message };
  }

  const formattedShifts = (extraShifts || []).map((s: any) => ({
    id: s.id,
    date: s.date,
    is_extra: s.is_extra,
    personnel: Array.isArray(s.personnel) ? s.personnel[0] : s.personnel,
    shift: Array.isArray(s.shift) ? s.shift[0] : s.shift,
    area: Array.isArray(s.area) ? s.area[0] : s.area,
    position: Array.isArray(s.position) ? s.position[0] : s.position
  }));

  const formattedTransports = (ownTransports || []).map((t: any) => ({
    id: t.id,
    date: t.date,
    transport_type: t.transport_type,
    personnel: Array.isArray(t.personnel) ? t.personnel[0] : t.personnel
  }));

  return {
    data: {
      extraShifts: formattedShifts,
      ownTransports: formattedTransports
    }
  };
}

export async function createHistoricalExtraShift(payload: {
  personnelId: string;
  date: string;
  shiftId: string;
  areaId: string;
  positionId: string;
  observations?: string;
  forceOverride?: boolean;
}) {
  try {
    const supabase = await createClient();

    // Check if there is already an assignment for this personnel on this date
    const { data: existingList, error: checkError } = await supabase
      .from('shift_assignments')
      .select('id, shifts(name)')
      .eq('personnel_id', payload.personnelId)
      .eq('date', payload.date)
      .limit(1);

    if (checkError) {
      console.error('Error checking existing shift assignment:', checkError);
      return { error: `Error al verificar turnos existentes: ${checkError.message}` };
    }

    const existing = existingList && existingList.length > 0 ? existingList[0] : null;

    if (existing && !payload.forceOverride) {
      // Return a conflict warning instead of blocking error
      return {
        conflict: true,
        conflictMessage: 'El empleado ya tiene una asignación de turno para esta fecha. ¿Deseas registrar el turno extra de todas formas?'
      };
    }

    const { data, error } = await supabase
      .from('shift_assignments')
      .insert({
        personnel_id: payload.personnelId,
        date: payload.date,
        shift_id: payload.shiftId,
        area_id: payload.areaId,
        position_id: payload.positionId,
        is_extra: true,
        is_manual: true,
        is_confirmed: true,
        is_published: true,
        is_validated: true,
        override_reason: payload.observations || null
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating historical shift in DB:', error);
      return { error: error.message };
    }

    revalidatePath('/reports/transport');
    return { data };
  } catch (error: any) {
    console.error('Unhandled error in createHistoricalExtraShift:', error);
    return { error: error?.message || 'Ocurrió un error inesperado al guardar el turno extra.' };
  }
}

export async function createHistoricalOwnTransport(payload: {
  personnelId: string;
  date: string;
}) {
  try {
    const supabase = await createClient();

    // Check if there is already an own transport for this personnel on this date
    const { data: existingList, error: checkError } = await supabase
      .from('transport_requests')
      .select('id')
      .eq('personnel_id', payload.personnelId)
      .eq('date', payload.date)
      .eq('transport_type', 'PROPIO')
      .limit(1);

    if (checkError) {
      console.error('Error checking existing transport:', checkError);
      return { error: `Error al verificar transporte existente: ${checkError.message}` };
    }

    if (existingList && existingList.length > 0) {
      return { error: 'El empleado ya tiene un registro de transporte propio para esta fecha.' };
    }

    // Look up if there's a shift assignment for this person on this date to link it
    const { data: assignments, error: assignmentError } = await supabase
      .from('shift_assignments')
      .select('id')
      .eq('personnel_id', payload.personnelId)
      .eq('date', payload.date)
      .limit(1);

    if (assignmentError) {
      console.error('Error looking up shift assignment:', assignmentError);
    }

    const assignmentId = assignments && assignments.length > 0 ? assignments[0].id : null;

    const { data, error } = await supabase
      .from('transport_requests')
      .insert({
        personnel_id: payload.personnelId,
        date: payload.date,
        transport_type: 'PROPIO',
        status: 'ABIERTO',
        assignment_id: assignmentId
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating historical transport in DB:', error);
      return { error: error.message };
    }

    revalidatePath('/reports/transport');
    return { data };
  } catch (error: any) {
    console.error('Unhandled error in createHistoricalOwnTransport:', error);
    return { error: error?.message || 'Ocurrió un error inesperado al guardar el transporte propio.' };
  }
}

export async function deleteHistoricalRecord(type: 'shift' | 'transport', id: string) {
  try {
    const supabase = await createClient();

    let error;
    if (type === 'shift') {
      const res = await supabase
        .from('shift_assignments')
        .delete()
        .eq('id', id);
      error = res.error;
    } else {
      const res = await supabase
        .from('transport_requests')
        .delete()
        .eq('id', id);
      error = res.error;
    }

    if (error) {
      console.error(`Error deleting historical ${type}:`, error);
      return { error: error.message };
    }

    revalidatePath('/reports/transport');
    return { success: true };
  } catch (error: any) {
    console.error('Unhandled error in deleteHistoricalRecord:', error);
    return { error: error?.message || 'Ocurrió un error inesperado al eliminar el registro.' };
  }
}
