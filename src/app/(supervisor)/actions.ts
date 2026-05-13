'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { format, addDays, parseISO } from 'date-fns';
import { sendWhatsAppMessage, getSystemSettings } from '@/lib/ultramsg';

export async function loginAsSupervisor(email: string) {
  const supabase = await createClient();
  
  // First, find all IDs for positions containing 'Supervisor'
  const { data: posList } = await supabase
    .from('positions')
    .select('id')
    .ilike('name', '%Supervisor%');

  const supervisorPosIds = posList?.map(p => p.id) || [];

  // Find personnel with this email
  const query = supabase
    .from('personnel')
    .select('*')
    .eq('email', email.trim().toLowerCase());

  const { data: personnel, error } = await query.single();

  if (error || !personnel) {
    return { success: false, error: 'Acceso denegado. No se encontró el usuario.' };
  }

  const isSupervisor = 
    personnel.role === 'Supervisor' || 
    personnel.role === 'Admin' ||
    (personnel.main_position && supervisorPosIds.includes(personnel.main_position));

  if (!isSupervisor) {
    return { success: false, error: 'Acceso denegado. No tienes cargo de supervisor.' };
  }

  const cookieStore = await cookies();
  cookieStore.set('supervisor_id', personnel.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/'
  });
  cookieStore.set('supervisor_email', email, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
    path: '/'
  });

  return { success: true };
}

export async function logoutSupervisor() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const cookieStore = await cookies();
  cookieStore.delete('supervisor_id');
  cookieStore.delete('supervisor_email');
  redirect('/login');
}

export async function getSupervisorSession() {
  const cookieStore = await cookies();
  let id = cookieStore.get('supervisor_id')?.value;
  
  const supabase = await createClient();
  
  if (!id) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: personnel } = await supabase
        .from('personnel')
        .select('*')
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

export async function getDailyPlanning(date?: string) {
  const session = await getSupervisorSession();
  if (!session) return null;

  const supabase = await createClient();
  const chileTime = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Santiago"}));
  const targetDate = date || format(chileTime, 'yyyy-MM-dd');

  // Try to fetch basic data first to avoid errors if new columns don't exist
  const { data: assignments, error: assErr } = await supabase
    .from('shift_assignments')
    .select(`
      id, 
      date, 
      personnel_id,
      status, 
      is_confirmed,
      attendance_status,
      attendance_updated_by,
      attendance_updated_at,
      personnel:personnel!shift_assignments_personnel_id_fkey(*), 
      shift:shifts!shift_assignments_shift_id_fkey(id, name, start_time, end_time), 
      area:areas!shift_assignments_area_id_fkey(id, name), 
      position:positions!shift_assignments_position_id_fkey(id, name)
    `)
    .eq('date', targetDate)
    .neq('status', 'cancelled');

  if (assErr) {
    console.error('DATABASE ERROR:', assErr.message, assErr.details, assErr.hint);
    return { assignments: [], transport: [], date: targetDate, error: assErr.message };
  }

  const { data: transport } = await supabase
    .from('transport_requests')
    .select('*, personnel:personnel(*)')
    .eq('date', targetDate);

  return {
    assignments: assignments || [],
    transport: transport || [],
    shifts: (await supabase.from('shifts').select('id, name, start_time').order('name')).data || [],
    date: targetDate
  };
}

export async function updateAssignmentShift(assignmentId: string, newShiftId: string) {
  const session = await getSupervisorSession();
  if (!session) return { success: false, error: 'No session' };

  const supabase = await createClient();
  const userName = `${session.first_name} ${session.last_name}`;

  const { error } = await supabase
    .from('shift_assignments')
    .update({
      shift_id: newShiftId,
      is_manual: true, // Mark as manual since a supervisor changed it
      override_by: userName,
      override_reason: 'Cambio de horario solicitado por bodega'
    })
    .eq('id', assignmentId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/supervisor/attendance');
  revalidatePath('/supervisor/roster');
  return { success: true };
}

export async function updateAttendance(assignmentId: string, status: 'present' | 'absent') {
  const session = await getSupervisorSession();
  if (!session) return { success: false, error: 'No session' };

  const supabase = await createClient();
  const userName = `${session.first_name} ${session.last_name}`;

  const { error } = await supabase
    .from('shift_assignments')
    .update({
      attendance_status: status,
      attendance_updated_by: userName,
      attendance_updated_at: new Date().toISOString()
    })
    .eq('id', assignmentId);

  if (error) return { success: false, error: error.message };

  // If absent, also cancel transport if it's "PROPIO"
  if (status === 'absent') {
    const { data: assignment } = await supabase
      .from('shift_assignments')
      .select('personnel_id, date')
      .eq('id', assignmentId)
      .single();

    if (assignment) {
       await supabase
         .from('transport_requests')
         .delete()
         .eq('personnel_id', assignment.personnel_id)
         .eq('date', assignment.date)
         .eq('transport_type', 'PROPIO');
    }
  }

  revalidatePath('/supervisor/attendance');
  return { success: true };
}

export async function updateTransportObservation(personnelId: string, date: string, observations: string) {
  const session = await getSupervisorSession();
  if (!session) return { success: false };

  const supabase = await createClient();
  const { error } = await supabase
    .from('transport_requests')
    .update({ 
      observations,
      updated_by_name: `${session.first_name} ${session.last_name}`
    })
    .eq('personnel_id', personnelId)
    .eq('date', date);

  if (error) {
    console.error('Error updating transport obs:', error);
    return { success: false };
  }
  revalidatePath('/supervisor/transport');
  return { success: true };
}

export async function updateTransportMobilization(personnelId: string, date: string, mobilization: string, assignmentId: string) {
  const session = await getSupervisorSession();
  if (!session) return { success: false };

  const supabase = await createAdminClient();
  
  // 1. Get personnel and assignment data
  const { data: asg, error: fetchErr } = await supabase
    .from('shift_assignments')
    .select(`
      *,
      area:areas(name),
      position:positions(name),
      shift:shifts(*),
      personnel:personnel(address, first_name, last_name_father, phone, role)
    `)
    .eq('id', assignmentId)
    .single();

  if (fetchErr) {
    console.error('FETCH ERROR:', fetchErr);
  }

  const personnel = asg?.personnel as any;
  const areaName = (asg?.area as any)?.name?.toUpperCase() || '';
  const addressObj = personnel?.address;
  
  // Robust Address Parsing
  let homeAddress = 'DIRECCIÓN NO INFORMADA EN FICHA';
  if (addressObj) {
    if (typeof addressObj === 'object') {
      const parts = [addressObj.street, addressObj.city, addressObj.commune].filter(Boolean);
      homeAddress = parts.length > 0 ? parts.join(', ') : (addressObj.full_address || JSON.stringify(addressObj));
    } else {
      homeAddress = String(addressObj);
    }
  }

  // Automated Destination Rules
  let destinationAddress = 'PLANTA / BODEGA';
  if (areaName.includes('BODEGA')) {
    destinationAddress = 'Osvaldo Croquevielle 2207, Pudahuel';
  } else if (areaName.includes('BLUE')) {
    destinationAddress = 'Los Maitenes Sur 9800, Pudahuel';
  }

  // 2. CHECK if a record already exists for this assignment and type
  const { data: existing } = await supabase
    .from('transport_requests')
    .select('id')
    .eq('assignment_id', assignmentId)
    .eq('type', 'ENTRADA')
    .maybeSingle();

  const payload = {
    personnel_id: personnelId,
    date: date,
    assignment_id: assignmentId,
    type: 'ENTRADA',
    transport_type: mobilization,
    status: 'ABIERTO',
    pickup_address: homeAddress,
    destination_address: destinationAddress,
    updated_by_name: `${session.first_name} ${session.last_name}`
  };

  let dbError;
  if (existing) {
    // UPDATE existing record
    const { error } = await supabase
      .from('transport_requests')
      .update(payload)
      .eq('id', existing.id);
    dbError = error;
  } else {
    // INSERT new record
    const { error } = await supabase
      .from('transport_requests')
      .insert(payload);
    dbError = error;
  }

  if (dbError) {
    console.error('DATABASE ERROR DETAILED:', dbError);
    return { success: false, error: dbError.message };
  }

  // 4. WhatsApp Notification for PROPIO
  if (!dbError && mobilization === 'PROPIO' && asg) {
    try {
      const pData = asg.personnel;
      const sData = asg.shift;
      const aData = asg.area;

      if (pData) {
        // Correct supervisor detection using joined position name or role
        const positionName = (asg.position?.name || '').toUpperCase();
        const isSupervisor = pData.role === 'Supervisor' || positionName.includes('SUPERVISOR');
        
        if (!isSupervisor) {
          const name = `${pData.first_name} ${pData.last_name_father}`.toUpperCase();
          const dateStr = format(parseISO(asg.date), 'dd-MM-yyyy');
          const hourStr = sData?.start_time?.substring(0,5) || '00:00';
          const phone = pData.phone;
          
          const message = `SR. ${name}\nTURNO ${dateStr}: ${hourStr}\nLLEGA POR SUS PROPIOS MEDIOS\n\n*ESTE ES UN MENSAJE QUE SE GENERA AUTOMATICO. NO LO RESPONDA*`;
          
          console.log('[WHATSAPP] Enviando mensaje a:', name, 'Tel:', phone);

          // Determine Group
          const dbSettings = await getSystemSettings();
          const areaNameSearch = (aData?.name || '').toUpperCase();
          const posNameSearch = positionName;

          const combinedSearch = `${areaNameSearch} ${posNameSearch}`.replace(/\s+/g, ''); 
          let groupId = dbSettings.ultramsg_group_others;

          if (combinedSearch.includes('BLUE')) groupId = dbSettings.ultramsg_group_blue;
          else if (combinedSearch.includes('FEDEX')) groupId = dbSettings.ultramsg_group_fedex;
          else if (combinedSearch.includes('DHL')) groupId = dbSettings.ultramsg_group_dhl;

          console.log('[WHATSAPP] Destino Grupo:', groupId);

          // Send to Group
          let groupSent = false;
          if (groupId) {
            const res = await sendWhatsAppMessage(groupId, message);
            groupSent = res.success;
            if (!res.success) console.error('[WHATSAPP] Error Grupo:', res.error);
          }
          
          // Send to Worker
          let workerSent = false;
          if (phone) {
            const cleanPhone = phone.replace(/\D/g, '');
            const res = await sendWhatsAppMessage(cleanPhone, message);
            workerSent = res.success;
            if (!res.success) console.error('[WHATSAPP] Error Trabajador:', res.error);
          }

          revalidatePath('/supervisor/transport');
          return { success: true, whatsapp: { group: groupSent, worker: workerSent } };
        } else {
          console.log('[WHATSAPP] Omitido por ser Supervisor');
        }
      }
    } catch (e) {
      console.error('NOTIFY CATCH ERROR:', e);
    }
  }
  
  revalidatePath('/supervisor/transport');
  return { success: true };
}

export async function updateTransportType(requestId: string, type: 'PROPIO' | 'EMPRESA') {
  const session = await getSupervisorSession();
  if (!session) return { success: false, error: 'No session' };

  const supabase = await createAdminClient();
  const userName = `${session.first_name} ${session.last_name}`;

  const { error } = await supabase
    .from('transport_requests')
    .update({ 
      transport_type: type,
      updated_by_name: userName,
      created_at: new Date().toISOString() // Using created_at or similar for audit if no update_at
    })
    .eq('id', requestId);

  if (error) return { success: false, error: error.message };
  revalidatePath('/supervisor/transport');
  return { success: true };
}

export async function updateArrivalStatus(personnelId: string, date: string, status: string, comment?: string) {
  const session = await getSupervisorSession();
  if (!session) return { success: false };

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from('transport_requests')
    .update({ 
      arrival_status: status,
      arrival_comment: comment || '',
      arrival_updated_at: new Date().toISOString()
    })
    .eq('personnel_id', personnelId)
    .eq('date', date);

  if (error) {
    console.error('Error updating arrival status:', error);
    return { success: false };
  }
  return { success: true };
}

export async function getMonthlyPlanning(month?: string) {
  const supabase = await createClient();
  const targetMonth = month || format(new Date(), 'yyyy-MM');
  const startDate = `${targetMonth}-01`;
  
  // Calculate end date properly
  const firstDay = new Date(startDate + 'T12:00:00');
  const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0);
  const endDate = format(lastDay, 'yyyy-MM-dd');

  const { data: assignments, error } = await supabase
    .from('shift_assignments')
    .select(`
      id, 
      date, 
      status, 
      is_confirmed,
      personnel_id,
      shift:shifts!shift_assignments_shift_id_fkey(id, name, start_time, end_time), 
      area:areas!shift_assignments_area_id_fkey(id, name), 
      position:positions!shift_assignments_position_id_fkey(id, name)
    `)
    .eq('is_confirmed', true)
    .neq('status', 'cancelled')
    .gte('date', startDate)
    .lte('date', endDate);

  if (error) {
    console.error('Error fetching monthly planning:', error);
    return null;
  }

  const { data: personnel } = await supabase
    .from('personnel')
    .select('*')
    .is('termination_date', null);

  const { data: shifts } = await supabase.from('shifts').select('*');
  const { data: areas } = await supabase.from('areas').select('*');
  const { data: positions } = await supabase.from('positions').select('*');

  return {
    assignments: assignments || [],
    personnel: personnel || [],
    shifts: shifts || [],
    areas: areas || [],
    positions: positions || [],
    month: targetMonth
  };
}
