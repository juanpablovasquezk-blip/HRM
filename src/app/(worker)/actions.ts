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
  const supabase = await createClient();
  await supabase.auth.signOut();

  const cookieStore = await cookies();
  cookieStore.delete('worker_email');
  cookieStore.delete('worker_id');
  redirect('/login');
}

export async function getWorkerSession() {
  const cookieStore = await cookies();
  let id = cookieStore.get('worker_id')?.value;
  
  const supabase = await createClient();

  if (!id) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: personnel } = await supabase
        .from('personnel')
        .select('id')
        .eq('email', user.email?.trim().toLowerCase())
        .single();
      
      if (personnel) {
        id = personnel.id;
      }
    }
  }

  if (!id) return null;
  
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

  // Fetch all potential data in parallel
  const adminSupabase = createAdminClient();
  const [todayAssignmentsRes, todayTransportRes, tomorrowAssignmentsRes, tomorrowTransportRes] = await Promise.all([
    supabase
      .from('shift_assignments')
      .select('*, shift:shifts!shift_assignments_shift_id_fkey(*), position:positions(*)')
      .eq('personnel_id', session.id)
      .eq('date', todayStr)
      .neq('status', 'cancelled'),
    adminSupabase
      .from('transport_requests')
      .select('*')
      .eq('personnel_id', session.id)
      .eq('date', todayStr),
    supabase
      .from('shift_assignments')
      .select('*, shift:shifts!shift_assignments_shift_id_fkey(*), area:areas(*), position:positions(*)')
      .eq('personnel_id', session.id)
      .eq('date', tomorrowStr)
      .neq('status', 'cancelled'),
    adminSupabase
      .from('transport_requests')
      .select('*')
      .eq('personnel_id', session.id)
      .eq('date', tomorrowStr)
  ]);

  const todayAssignments = todayAssignmentsRes.data || [];
  const todayTransport = todayTransportRes.data || [];
  const assignments = tomorrowAssignmentsRes.data || [];
  let transport = tomorrowTransportRes.data || [];

  // Persistence Logic: If today has coordinated transport AND we are within 1 hour of shift start
  const hasCoordinatedTransportToday = todayTransport.some(t => t.transport_type === 'REQUERIDO' || t.transport_type === 'EMPRESA');
  
  if (hasCoordinatedTransportToday && todayAssignments.length > 0) {
    const firstShift = todayAssignments[0].shift;
    if (firstShift?.start_time) {
      const [h, m] = firstShift.start_time.split(':').map(Number);
      const shiftStartToday = new Date(chileTime);
      shiftStartToday.setHours(h, m, 0, 0);
      
      const oneHourAfterStart = new Date(shiftStartToday.getTime() + 60 * 60 * 1000);
      
      if (chileTime < oneHourAfterStart) {
        // Synthesize transport for today if missing
        const finalTodayTransport = [...todayTransport];
        for (const asg of todayAssignments) {
          const hasRequest = finalTodayTransport.some(t => t.assignment_id === asg.id || (t.date === todayStr && t.type === 'ENTRADA'));
          if (!hasRequest) {
            const shift = asg.shift;
            if (shift && shift.requires_transport === true) {
              const isSupervisor = (asg.position?.name || '').toUpperCase().includes('SUPERVISOR');
              let transportType = 'PENDIENTE';
              if (isSupervisor) {
                transportType = 'PROPIO';
              }
              
              finalTodayTransport.push({
                id: `synth_${asg.id}`,
                assignment_id: asg.id,
                personnel_id: session.id,
                date: todayStr,
                type: 'ENTRADA',
                transport_type: transportType,
                reservation_number: null,
                pickup_time: null,
                status: 'ABIERTO',
                pickup_address: null,
                destination_address: null
              });
            }
          }
        }

        // Still show TODAY
        return {
          personnel: session,
          date: todayStr,
          assignments: todayAssignments,
          transport: finalTodayTransport
        };
      }
    }
  }

  // Robust transport fetching for tomorrow (including by assignment ID)
  const tomorrowAsgIds = assignments.map(a => a.id);
  if (tomorrowAsgIds.length > 0) {
    const { data: extraTransport } = await adminSupabase
      .from('transport_requests')
      .select('*')
      .in('assignment_id', tomorrowAsgIds);
    
    if (extraTransport && extraTransport.length > 0) {
      // Merge and deduplicate
      const transportIds = new Set(transport.map(t => t.id));
      for (const et of extraTransport) {
        if (!transportIds.has(et.id)) {
          transport.push(et);
          transportIds.add(et.id);
        }
      }
    }
  }

  // Synthesize transport for tomorrow if missing
  const finalTransport = [...transport];
  for (const asg of assignments) {
    const hasRequest = finalTransport.some(t => t.assignment_id === asg.id || (t.date === tomorrowStr && t.type === 'ENTRADA'));
    if (!hasRequest) {
      const shift = asg.shift;
      if (shift && shift.requires_transport === true) {
        const isSupervisor = (asg.position?.name || '').toUpperCase().includes('SUPERVISOR');
        let transportType = 'PENDIENTE';
        if (isSupervisor) {
          transportType = 'PROPIO';
        }
        
        finalTransport.push({
          id: `synth_${asg.id}`,
          assignment_id: asg.id,
          personnel_id: session.id,
          date: tomorrowStr,
          type: 'ENTRADA',
          transport_type: transportType,
          reservation_number: null,
          pickup_time: null,
          status: 'ABIERTO',
          pickup_address: null,
          destination_address: null
        });
      }
    }
  }

  return {
    personnel: session,
    date: tomorrowStr,
    assignments: assignments,
    transport: finalTransport
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

  // 2. Fetch Base Roster (deprecated baseline table is replaced by original_shift_id comparison)
  const roster = null;

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
    rosterBase: null,
    leaves: leaves || []
  };
}

export async function getWorkerTransportHistory(from?: string, to?: string) {
  const session = await getWorkerSession();
  if (!session) return null;

  const supabase = await createClient();
  
  // 1. Fetch all transport requests of type PROPIO in the date range
  let reqQuery = supabase
    .from('transport_requests')
    .select(`
      *,
      assignment:shift_assignments!transport_requests_assignment_id_fkey(
        *,
        shift:shifts!shift_assignments_shift_id_fkey(*)
      )
    `)
    .eq('personnel_id', session.id)
    .eq('transport_type', 'PROPIO');

  if (from) reqQuery = reqQuery.gte('date', from);
  if (to) reqQuery = reqQuery.lte('date', to);

  const { data: dbRequests, error: reqErr } = await reqQuery;
  if (reqErr) {
    console.error('Error fetching transport requests for history:', reqErr);
  }

  const history: any[] = [];
  const datesWithDbRequest = new Set<string>();

  if (dbRequests) {
    for (const r of dbRequests) {
      history.push({
        id: r.id,
        date: r.date,
        transport_type: 'PROPIO',
        shift_assignment: r.assignment || null
      });
      datesWithDbRequest.add(r.date);
    }
  }

  // 2. Fetch shift assignments to synthesize PROPIO for supervisors who don't have a DB record
  let asgQuery = supabase
    .from('shift_assignments')
    .select('*, shift:shifts!shift_assignments_shift_id_fkey(*), position:positions(*)')
    .eq('personnel_id', session.id)
    .eq('is_confirmed', true)
    .neq('status', 'cancelled');

  if (from) asgQuery = asgQuery.gte('date', from);
  if (to) asgQuery = asgQuery.lte('date', to);

  const { data: assignments, error: asgErr } = await asgQuery;
  if (asgErr) {
    console.error('Error fetching assignments for history:', asgErr);
  }

  if (assignments) {
    for (const asg of assignments) {
      // If we already have a DB request for this date, do not synthesize
      if (datesWithDbRequest.has(asg.date)) continue;

      const shift = asg.shift;
      if (!shift || shift.requires_transport === false) continue;

      const isSupervisor = (asg.position?.name || '').toUpperCase().includes('SUPERVISOR');
      if (isSupervisor) {
        history.push({
          id: `synth_${asg.id}`,
          date: asg.date,
          transport_type: 'PROPIO',
          shift_assignment: asg
        });
      }
    }
  }

  // Sort by date descending
  history.sort((a, b) => b.date.localeCompare(a.date));

  return history;
}

export async function getActiveDocumentDefinitions() {
  // Temporarily returning empty array until the correct table is identified
  return [];
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
