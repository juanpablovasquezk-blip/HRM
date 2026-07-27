'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { format, parseISO } from 'date-fns';

import { sendWhatsAppMessage, getSystemSettings } from '@/lib/ultramsg';

async function getAuthorizedRole() {
  try {
    const supabase = await createClient();
    
    // 1. Try to get user with a timeout to prevent hangs
    const userPromise = supabase.auth.getUser();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Auth Timeout')), 5000)
    );
    
    const { data: { user } } = await Promise.race([userPromise, timeoutPromise]) as any;
    if (!user) return null;

    // 2. Check metadata first (fastest)
    let role = (user.user_metadata?.role || '').toUpperCase();
    
    // 3. Emergency override for Marcela (Management access)
    if (user.email?.toUpperCase().includes('MARCELA')) {
      return 'AIRPORT_ASSISTANT';
    }

    if (role) return role;
    
    // 4. Fallback to DB check
    const adminSupabase = createAdminClient();
    const { data: dbUser } = await adminSupabase.from('users').select('role').eq('id', user.id).single();
    if (dbUser?.role) return dbUser.role.toUpperCase();
    
    return 'USER';
  } catch (error) {
    console.error('[AUTH] getAuthorizedRole error:', error);
    return null;
  }
}

export async function updateTransportRequest(id: string, updates: any) {
  try {
    const role = await getAuthorizedRole();
    if (!role || !['ADMIN', 'SUPERVISOR', 'AIRPORT_ASSISTANT', 'HR'].includes(role)) {
      throw new Error('No autorizado');
    }

    const supabase = createAdminClient();

    const { error } = await supabase
      .from('transport_requests')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[DB] Error updateTransportRequest:', error);
      return { success: false, error: error.message };
    }
    
    revalidatePath('/transport');
    revalidatePath('/worker');
    return { success: true };
  } catch (error: any) {
    console.error('[SERVER] Error updateTransportRequest:', error);
    return { success: false, error: error.message || 'Error de conexión con el servidor' };
  }
}

export async function sendTransportNotification(requestId: string, isTimePending: boolean = false) {
  try {
    const role = await getAuthorizedRole();
    if (!role || !['ADMIN', 'SUPERVISOR', 'AIRPORT_ASSISTANT', 'HR'].includes(role)) {
      throw new Error('No autorizado');
    }
    
    const supabase = createAdminClient();
    // 1. Get Core Transport Request
    const { data: tr, error: trErr } = await supabase
      .from('transport_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (trErr || !tr) throw new Error('No se encontró la solicitud de transporte');

    // Prevent notifications for past transport dates
    const todayStr = format(
      new Date(new Date().toLocaleString("en-US", { timeZone: "America/Santiago" })),
      'yyyy-MM-dd'
    );
    if (tr.date < todayStr) {
      return { success: false, error: 'No se envían notificaciones por WhatsApp para transportes de fechas pasadas' };
    }

    // 2. Get Personnel (Direct)
    const { data: pData } = await supabase
      .from('personnel')
      .select('*')
      .eq('id', tr.personnel_id)
      .single();

    if (!pData) throw new Error('No se encontró el personal');

    // 3. Get Assignment & Related (Manual)
    const { data: asg } = await supabase
      .from('shift_assignments')
      .select('*')
      .eq('id', tr.assignment_id)
      .single();

    let shiftStart = '00:00';
    let areaName = '';
    let posName = '';

    if (asg) {
      const [sDataRes, aDataRes, pDataRes] = await Promise.all([
        supabase.from('shifts').select('start_time').eq('id', asg.shift_id).single(),
        supabase.from('areas').select('name').eq('id', asg.area_id).single(),
        supabase.from('positions').select('name').eq('id', asg.position_id).single()
      ]);
      
      shiftStart = sDataRes.data?.start_time?.substring(0, 5) || '00:00';
      areaName = (aDataRes.data?.name || '').toUpperCase();
      posName = (pDataRes.data?.name || '').toUpperCase();
    }

    // 4. Exclude Supervisors
    const isSupervisor = pData.role === 'Supervisor' || (pData.main_position || '').toUpperCase().includes('SUPERVISOR');
    if (isSupervisor) return { success: false, error: 'No se envían notificaciones a supervisores' };

    const name = `${pData.first_name} ${pData.last_name_father}`.toUpperCase();
    const dateStr = format(parseISO(tr.date), 'dd-MM-yyyy');
    const phone = pData.phone;

    let body = '';
    const warning = `ESTE ES UN MENSAJE QUE SE GENERA AUTOMATICO. NO LO RESPONDA`;
    const isFedex = posName.includes('FEDEX') || areaName.includes('FEDEX');

    if (isTimePending && isFedex) {
      if (tr.transport_type === 'PROPIO') {
        body = `SR. ${name}\nTURNO ${dateStr}: ATENTO A LA HORA DE INGRESO PARA MAÑANA QUE SERA INFORMADA\nLLEGA POR SUS PROPIOS MEDIOS`;
      } else {
        body = `SR. ${name}\nTURNO ${dateStr}: ATENTO A LA HORA DE INGRESO PARA MAÑANA QUE SERA INFORMADA\nEL TRANSPORTE SE COORDINARÁ UNA VEZ CONFIRMADO EL HORARIO`;
      }
    } else {
      if (tr.transport_type === 'PROPIO') {
        body = `SR. ${name}\nTURNO ${dateStr}: ${shiftStart}\nLLEGA POR SUS PROPIOS MEDIOS`;
      } else {
        body = `SR. ${name}\nTURNO ${dateStr}: ${shiftStart}\nRESERVA NRO: ${tr.reservation_number || 'PENDIENTE'}\nHORA DE RECOGIDA: ${tr.pickup_time?.substring(0,5) || '--:--'}\nDESDE: ${tr.pickup_address || '---'}\nHASTA: ${tr.destination_address || '---'}`;
      }
    }

    const message = `${body}\n\n${warning}`;

    // 5. Determine Group
    const dbSettings = await getSystemSettings();
    let positionName = (pData?.main_position_name || '').toUpperCase();

    // If position name is missing, fetch it from the ID
    if (!positionName && pData?.main_position) {
      const { data: posData } = await supabase.from('positions').select('name').eq('id', pData.main_position).single();
      positionName = (posData?.name || '').toUpperCase();
    }

    const combinedSearch = `${areaName} ${positionName}`.replace(/\s+/g, ''); 
    
    let groupId = dbSettings.ultramsg_group_others;
    if (combinedSearch.includes('BLUE')) groupId = dbSettings.ultramsg_group_blue;
    else if (combinedSearch.includes('FEDEX')) groupId = dbSettings.ultramsg_group_fedex;
    else if (combinedSearch.includes('DHL')) groupId = dbSettings.ultramsg_group_dhl;
    else if (combinedSearch.includes('AEROPUERTO')) groupId = dbSettings.ultramsg_group_others;

    // 6. Find 04:00 Supervisor for the individual message
    let supervisorName = 'SUPERVISOR DE TURNO';
    try {
      // Fetch assignments with personnel and their assigned position for the day
      const { data: assignments, error: asgErr } = await supabase
        .from('shift_assignments')
        .select(`
          shifts!shift_assignments_shift_id_fkey(start_time),
          personnel(first_name, last_name_father),
          positions(name)
        `)
        .eq('date', tr.date)
        .eq('status', 'scheduled');
        
      if (asgErr) throw asgErr;
      
      const sup0400 = assignments?.find((s: any) => {
        const startTime = s.shifts?.start_time || '';
        const posName = (s.positions?.name || '').toUpperCase();
        return startTime.startsWith('04:00') && posName.includes('SUPERVISOR');
      });

      if (sup0400) {
        const p = Array.isArray(sup0400.personnel) ? sup0400.personnel[0] : sup0400.personnel;
        if (p) {
          supervisorName = `${p.first_name} ${p.last_name_father}`.toUpperCase();
        }
      }
    } catch (e) {
      console.error('Error finding supervisor:', e);
    }

    const individualMessage = `${body}\n\nSi tiene problemas con su recogida, contactarse con Transvip al (2) 2677 3000. Si no lo pasan a buscar, contactese con el supervisor *${supervisorName}* a las 04:00.\n\n${warning}`;

    // 7. Send to both in parallel using cached settings
    const sendPromises = [];
    
    // Send to group only if it's pending, or if it is confirmed but NOT Fedex own transport ('PROPIO')
    const isFedexOwnTransportConfirmed = !isTimePending && isFedex && tr.transport_type === 'PROPIO';
    
    if (groupId && !isFedexOwnTransportConfirmed) {
      sendPromises.push(sendWhatsAppMessage(groupId, message, dbSettings));
    }
    
    if (phone) {
      sendPromises.push(sendWhatsAppMessage(phone.trim().replace(/\D/g, ''), individualMessage, dbSettings));
    }

    const results = await Promise.all(sendPromises);
    const failed = results.find(r => !r.success);
    
    if (failed) {
      console.error('WhatsApp failed:', failed);
      return { success: false, error: failed.error || 'Error al enviar uno de los mensajes' };
    }

    revalidatePath('/transport');
    return { success: true };
  } catch (error: any) {
    console.error('Error sending WhatsApp notification:', error);
    return { success: false, error: error.message || 'Error desconocido en el servidor' };
  }
}

export async function getAvailableShifts(date: string) {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('shifts')
      .select('id, name, start_time, end_time')
      .order('start_time');
      
    if (error) throw error;
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateAssignmentShift(assignmentId: string, newShiftId: string) {
  try {
    const role = await getAuthorizedRole();
    if (!role || !['ADMIN', 'SUPERVISOR', 'AIRPORT_ASSISTANT', 'HR'].includes(role)) {
      throw new Error('No autorizado');
    }

    const supabase = createAdminClient();
    
    // Validate shift exists
    const { data: shift, error: shiftErr } = await supabase
      .from('shifts')
      .select('id')
      .eq('id', newShiftId)
      .single();
      
    if (shiftErr || !shift) throw new Error('El turno seleccionado no existe');

    const { error } = await supabase
      .from('shift_assignments')
      .update({
        shift_id: newShiftId,
        is_manual: true,
        override_reason: 'Cambio de turno desde Transporte'
      })
      .eq('id', assignmentId);

    if (error) throw error;

    revalidatePath('/transport');
    revalidatePath('/shifts/roster');
    return { success: true };
  } catch (error: any) {
    console.error('Error updateAssignmentShift:', error);
    return { success: false, error: error.message };
  }
}

export async function getTransportRequests(date: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('transport_requests')
    .select(`
      *,
      personnel:personnel!transport_requests_personnel_id_fkey(*),
      assignment:shift_assignments!transport_requests_assignment_id_fkey(
        *,
        shift:shifts!shift_assignments_shift_id_fkey(*),
        area:areas(*),
        position:positions(*)
      )
    `)
    .eq('date', date);
    
  if (error) return { data: null, error: error.message };

  // Filter out transport requests for inactive or terminated personnel
  const filteredData = (data || []).filter(r => {
    const p = r.personnel;
    if (!p) return false;
    if (p.termination_date && date > p.termination_date) return false;
    const todayStr = new Date().toLocaleDateString('sv');
    if (!p.is_active && date >= todayStr) return false;
    return true;
  });

  return { data: filteredData, error: null };
}

export async function generateTransportRequests(date: string) {
  try {
    const role = await getAuthorizedRole();
    if (!role || !['ADMIN', 'SUPERVISOR', 'AIRPORT_ASSISTANT', 'HR'].includes(role)) {
      return { success: false, error: 'No autorizado' };
    }

    const supabase = createAdminClient();
    
    // 1. Get all confirmed assignments for that date
    const { data: assignments, error: assErr } = await supabase
      .from('shift_assignments')
      .select(`
        *,
        personnel:personnel(*),
        area:areas(*),
        position:positions(*),
        shift:shifts!shift_assignments_shift_id_fkey(*)
      `)
      .eq('date', date)
      .eq('is_confirmed', true)
      .neq('status', 'cancelled');

    if (assErr) throw assErr;
    if (!assignments || assignments.length === 0) return { success: true, message: 'No hay asignaciones confirmadas.' };

    // Filter out assignments for inactive or terminated personnel
    const activeAssignments = assignments.filter(ass => {
      const p = ass.personnel;
      if (!p) return false;
      if (p.termination_date && date > p.termination_date) return false;
      const todayStr = new Date().toLocaleDateString('sv');
      if (!p.is_active && date >= todayStr) return false;
      return true;
    });

    if (activeAssignments.length === 0) return { success: true, message: 'No hay asignaciones de personal activo.' };

    // 2. Get existing requests to avoid duplicates
    const { data: existingReqs } = await supabase
      .from('transport_requests')
      .select('assignment_id')
      .eq('date', date);
    
    const existingIds = new Set(existingReqs?.map(r => r.assignment_id) || []);

    const isWithinWindow = (timeStr: string) => {
      if (!timeStr) return false;
      const [h, m] = timeStr.split(':').map(Number);
      const val = h * 100 + m;
      return (val >= 2300 || val <= 630);
    };

    const newRequests: any[] = [];

    for (const ass of activeAssignments) {
      if (existingIds.has(ass.id)) continue;
      if (!ass.personnel || !ass.shift) continue;
      if (ass.shift.requires_transport === false) continue;

      const personnel = ass.personnel;
      const shift = ass.shift;
      const area = (ass as any).area;
      const areaName = (area?.name || '').toUpperCase();

      // Better Address Parsing
      let homeAddress = "DIRECCIÓN NO INFORMADA EN FICHA";
      const addr = personnel.address;
      if (addr) {
        if (typeof addr === 'string') {
          homeAddress = addr.replace(/[\r\n]+/g, ' ').trim();
        } else if (typeof addr === 'object') {
          const a = addr as any;
          const parts = [
            String(a.street || '').replace(/[\r\n]+/g, ' ').trim(),
            String(a.city || '').replace(/[\r\n]+/g, ' ').trim(),
            String(a.commune || a.region || '').replace(/[\r\n]+/g, ' ').trim()
          ].filter(Boolean);
          homeAddress = parts.length > 0 ? parts.join(', ') : (a.full_address || JSON.stringify(a));
        }
      }

      // Smart Plant Mapping
      let plantAddress = "MINERQUIM PLANTA"; 
      if (areaName.includes('BLUE')) plantAddress = "Los Maitenes Sur 9800, Pudahuel";
      else if (areaName.includes('BODEGA') || areaName.includes('DHL') || areaName.includes('FEDEX')) plantAddress = "Osvaldo Croquevielle 2207, Pudahuel";
      else if (areaName.includes('AEROPUERTO')) plantAddress = "Armando Cortinez Oriente 1704";

      const isSupervisor = ((ass as any).position?.name || '').toUpperCase().includes('SUPERVISOR');
      const defaultTransportType = isSupervisor ? 'PROPIO' : 'PENDIENTE';

      // ENTRADA
      if (isWithinWindow(shift.start_time)) {
        newRequests.push({
          personnel_id: ass.personnel_id,
          assignment_id: ass.id,
          date: ass.date,
          type: 'ENTRADA',
          status: 'ABIERTO',
          transport_type: defaultTransportType,
          pickup_address: homeAddress,
          destination_address: plantAddress
        });
      }

      // SALIDA
      if (isWithinWindow(shift.end_time)) {
        newRequests.push({
          personnel_id: ass.personnel_id,
          assignment_id: ass.id,
          date: ass.date,
          type: 'SALIDA',
          status: 'ABIERTO',
          transport_type: defaultTransportType,
          pickup_address: plantAddress,
          destination_address: homeAddress
        });
      }
    }

    if (newRequests.length > 0) {
      const { error: insErr } = await supabase.from('transport_requests').insert(newRequests);
      if (insErr) throw insErr;
    }

    revalidatePath('/transport');
    revalidatePath('/worker');
    return { success: true, count: newRequests.length };
  } catch (error: any) {
    console.error('Error generateTransportRequests:', error);
    return { success: false, error: error.message };
  }
}

export async function clearTransportRequests(date: string) {
  const role = await getAuthorizedRole();
  if (!role || !['ADMIN', 'SUPERVISOR', 'AIRPORT_ASSISTANT', 'HR'].includes(role)) {
    return { success: false, error: 'No autorizado' };
  }

  const supabase = createAdminClient();
  console.log('[TRANSPORT] Clearing requests for date:', date);
  const { error } = await supabase
    .from('transport_requests')
    .delete()
    .eq('date', date);
    
  if (error) {
    console.error('[TRANSPORT] Clear error:', error);
    return { success: false, error: error.message };
  }
  revalidatePath('/transport');
  return { success: true };
}

export async function createTransportLog(formData: FormData) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No autorizado');

    const personnel_id = formData.get('personnel_id') as string;
    const date = formData.get('date') as string;
    const reservation_number = formData.get('reservation_number') as string;
    const issues = formData.get('issues') as string;
    const used_company_transport = formData.get('used_company_transport') === 'true';

    const { error } = await supabase
      .from('transport_logs')
      .insert({
        personnel_id,
        date,
        reservation_number: reservation_number || null,
        issues: issues || null,
        used_company_transport,
        logged_by: user.id
      });

    if (error) throw error;

    revalidatePath('/transport');
    return { success: true };
  } catch (error: any) {
    console.error('Error creating transport log:', error);
    return { success: false, error: error.message };
  }
}
