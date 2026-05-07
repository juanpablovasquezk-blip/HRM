'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { parseISO, format, addMonths, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';

export async function loginAsWorker(email: string) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('personnel')
    .select('id, first_name, email')
    .eq('email', email)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return { success: false, error: 'Email no encontrado o trabajador inactivo' };
  }

  const cookieStore = await cookies();
  cookieStore.set('worker_email', email, { 
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/'
  });
  cookieStore.set('worker_id', data.id, { 
    maxAge: 60 * 60 * 24 * 30,
    path: '/'
  });

  return { success: true };
}

export async function logoutWorker() {
  const cookieStore = await cookies();
  cookieStore.delete('worker_email');
  cookieStore.delete('worker_id');
  redirect('/worker/login');
}

export async function getWorkerSession() {
  const cookieStore = await cookies();
  const id = cookieStore.get('worker_id')?.value;
  const email = cookieStore.get('worker_email')?.value;
  
  if (!id || !email) return null;
  
  const supabase = await createClient();
  const { data } = await supabase
    .from('personnel')
    .select('*')
    .eq('id', id)
    .single();
    
  return data;
}
export async function getWorkerTomorrowData() {
  const session = await getWorkerSession();
  if (!session) return null;

  const supabase = await createClient();
  const chileTime = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Santiago"}));
  
  const todayStr = format(chileTime, 'yyyy-MM-dd');
  const tomorrowStr = format(addDays(chileTime, 1), 'yyyy-MM-dd');

  // 1. Check Today's data first for persistence rule
  const { data: todayAssignments } = await supabase
    .from('shift_assignments')
    .select('*, shift:shifts(*)')
    .eq('personnel_id', session.id)
    .eq('date', todayStr)
    .neq('status', 'cancelled');

  const { data: todayTransport } = await supabase
    .from('transport_requests')
    .select('*')
    .eq('personnel_id', session.id)
    .eq('date', todayStr);

  // Persistence Logic: If today has coordinated transport AND we are within 1 hour of shift start
  const hasCoordinatedTransportToday = todayTransport?.some(t => t.transport_type === 'REQUERIDO' || t.transport_type === 'EMPRESA');
  
  if (hasCoordinatedTransportToday && todayAssignments && todayAssignments.length > 0) {
    const firstShift = todayAssignments[0].shift;
    if (firstShift?.start_time) {
      const [h, m] = firstShift.start_time.split(':').map(Number);
      const shiftStartToday = new Date(chileTime);
      shiftStartToday.setHours(h, m, 0, 0);
      
      const oneHourAfterStart = new Date(shiftStartToday.getTime() + 60 * 60 * 1000);
      
      if (chileTime < oneHourAfterStart) {
        // Still show TODAY
        return {
          personnel: session,
          date: todayStr,
          assignments: todayAssignments,
          transport: todayTransport || []
        };
      }
    }
  }

  // Otherwise, show TOMORROW as usual
  const { data: assignments } = await supabase
    .from('shift_assignments')
    .select('*, shift:shifts!shift_assignments_shift_id_fkey(*), area:areas(*), position:positions(*)')
    .eq('personnel_id', session.id)
    .eq('date', tomorrowStr)
    .neq('status', 'cancelled');

  const { data: transport } = await supabase
    .from('transport_requests')
    .select('*')
    .eq('personnel_id', session.id)
    .eq('date', tomorrowStr);

  return {
    personnel: session,
    date: tomorrowStr,
    assignments: assignments || [],
    transport: transport || []
  };
}

export async function getWorkerRosterData(month?: string) {
  const session = await getWorkerSession();
  if (!session) return null;

  const supabase = await createClient();
  
  // Use current month if not provided
  const targetDate = month ? parseISO(month + '-01') : new Date();
  const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
  const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);

  const startStr = startOfMonth.toISOString().split('T')[0];
  const endStr = endOfMonth.toISOString().split('T')[0];

  // 1. Fetch ALL assignments for the month (to detect changes), but EXCLUDE extra shifts
  const { data: assignments } = await supabase
    .from('shift_assignments')
    .select('*, shift:shifts!shift_assignments_shift_id_fkey(*)')
    .eq('personnel_id', session.id)
    .gte('date', startStr)
    .lte('date', endStr)
    .eq('is_extra', false) // Only normal roster
    .neq('status', 'cancelled');

  // 2. Fetch Base Roster (to compare)
  const { data: roster } = await supabase
    .from('roster')
    .select('*')
    .eq('personnel_id', session.id)
    .eq('month', startOfMonth.getMonth() + 1)
    .eq('year', startOfMonth.getFullYear())
    .maybeSingle();

  // 3. Fetch Leaves (to show approved free days)
  const { data: leaves } = await supabase
    .from('leaves')
    .select('*')
    .eq('personnel_id', session.id)
    .gte('start_date', startStr)
    .lte('start_date', endStr)
    .eq('status', 'approved');

  return {
    personnel: session,
    month: startOfMonth.getMonth() + 1,
    year: startOfMonth.getFullYear(),
    assignments: assignments || [],
    rosterBase: roster || null,
    leaves: leaves || []
  };
}

export async function getWorkerTransportHistory(from?: string, to?: string) {
  const session = await getWorkerSession();
  if (!session) return null;

  const supabase = await createClient();
  
  let query = supabase
    .from('transport_requests')
    .select('*, shift_assignment:shift_assignments(*, shift:shifts!shift_assignments_shift_id_fkey(*))')
    .eq('personnel_id', session.id)
    .eq('transport_type', 'PROPIO')
    .order('date', { ascending: false });

  if (from) query = query.gte('date', from);
  if (to) query = query.lte('date', to);

  const { data } = await query;

  return data || [];
}

export async function getActiveDocumentDefinitions() {
  const session = await getWorkerSession();
  if (!session) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from('document_definitions')
    .select('*')
    .eq('is_active', true)
    .order('is_mandatory', { ascending: false });
  
  if (!data) return [];

  // Filter definitions: 
  // 1. If applicable_positions is empty, it applies to everyone.
  // 2. If not empty, only if it includes the worker's main_position.
  return data.filter(def => {
    if (!def.applicable_positions || def.applicable_positions.length === 0) return true;
    return def.applicable_positions.includes(session.main_position);
  });
}

export async function getWorkerDocuments() {
  const session = await getWorkerSession();
  if (!session) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from('documents')
    .select('*')
    .eq('personnel_id', session.id);
  
  return data || [];
}


export async function uploadDocumentRecord(record: any) {
  const session = await getWorkerSession();
  if (!session) return { success: false, error: 'No session' };

  console.log('Record received in server:', record);

  const supabase = createAdminClient();
  
  const dataToSave: any = {
    personnel_id: session.id,
    definition_id: record.definition_id,
    file_url: record.file_url,
    type: record.type || 'Documento',
    status: 'PENDING',
    uploaded_at: new Date().toISOString()
  };

  // Only add expiration_date if it's provided to avoid overwriting with null accidentally
  if (record.expiration_date) {
    dataToSave.expiration_date = record.expiration_date;
  }

  console.log('Final data to save:', dataToSave);

  const { error, data } = await supabase
    .from('documents')
    .upsert(dataToSave, {
      onConflict: 'personnel_id,definition_id'
    })
    .select();

  if (error) {
    console.error('CRITICAL DATABASE ERROR:', error);
    return { success: false, error: error.message };
  }
  
  console.log('Upload successful:', data);
  revalidatePath('/worker/documents');
  return { success: true };
}

export async function requestFreeDays(personnelId: string, dates: string[]) {
  const supabase = createAdminClient();
  
  // Insert each date as a separate leave record
  const leaves = dates.map(date => ({
    personnel_id: personnelId,
    start_date: date,
    end_date: date,
    type: 'other',
    status: 'pending',
    reason: 'Solicitud mensual de días libres'
  }));

  const { error } = await supabase.from('leaves').insert(leaves);
  if (error) return { success: false, error: error.message };
  
  revalidatePath('/worker');
  revalidatePath('/leaves');
  return { success: true };
}

export async function getWorkerFreeRequests(personnelId: string) {
  const supabase = await createClient();
  const today = new Date();
  const nextMonth = addMonths(today, 1);
  const start = format(startOfMonth(nextMonth), 'yyyy-MM-dd');
  const end = format(endOfMonth(nextMonth), 'yyyy-MM-dd');

  const { data, error } = await supabase
    .from('leaves')
    .select('*')
    .eq('personnel_id', personnelId)
    .gte('start_date', start)
    .lte('start_date', end)
    .eq('reason', 'Solicitud mensual de días libres')
    .order('start_date', { ascending: true });

  return { data: data || [], error: error?.message };
}

export async function deleteWorkerLeave(leaveId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('leaves')
    .delete()
    .eq('id', leaveId)
    .eq('reason', 'Solicitud mensual de días libres'); // Security: only monthly requests

  if (error) return { success: false, error: error.message };
  revalidatePath('/worker');
  revalidatePath('/leaves');
  return { success: true };
}
