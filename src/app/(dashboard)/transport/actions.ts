'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { format, parseISO } from 'date-fns';

import { sendWhatsAppMessage, getSystemSettings } from '@/lib/ultramsg';

async function getAuthorizedRole() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  let role = (user.user_metadata?.role || '').toUpperCase();
  
  if (!role) {
    const adminSupabase = createAdminClient();
    const { data: dbUser } = await adminSupabase.from('users').select('role').eq('id', user.id).single();
    if (dbUser?.role) role = dbUser.role.toUpperCase();
  }
  
  // Emergency override for Marcela (Management access)
  if (user.email?.toUpperCase().includes('MARCELA')) {
    role = 'ASSISTANT';
  }
  
  return role;
}

export async function updateTransportRequest(id: string, updates: any) {
  try {
    const role = await getAuthorizedRole();
    if (!role || !['ADMIN', 'SUPERVISOR', 'AIRPORT_ASSISTANT', 'ASSISTANT', 'HR'].includes(role)) {
      throw new Error('No autorizado');
    }

    const supabase = createAdminClient();

    const { error } = await supabase
      .from('transport_requests')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    
    revalidatePath('/transport');
    return { success: true };
  } catch (error: any) {
    console.error('Error updating transport request:', error);
    return { success: false, error: error.message };
  }
}

export async function sendTransportNotification(requestId: string) {
  try {
    const role = await getAuthorizedRole();
    if (!role || !['ADMIN', 'SUPERVISOR', 'AIRPORT_ASSISTANT', 'ASSISTANT', 'HR'].includes(role)) {
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

    if (asg) {
      const [sDataRes, aDataRes] = await Promise.all([
        supabase.from('shifts').select('start_time').eq('id', asg.shift_id).single(),
        supabase.from('areas').select('name').eq('id', asg.area_id).single()
      ]);
      
      shiftStart = sDataRes.data?.start_time?.substring(0, 5) || '00:00';
      areaName = (aDataRes.data?.name || '').toUpperCase();
    }

    // 4. Exclude Supervisors
    const isSupervisor = pData.role === 'Supervisor' || (pData.main_position || '').toUpperCase().includes('SUPERVISOR');
    if (isSupervisor) return { success: false, error: 'No se envían notificaciones a supervisores' };

    const name = `${pData.first_name} ${pData.last_name_father}`.toUpperCase();
    const dateStr = format(parseISO(tr.date), 'dd-MM-yyyy');
    const phone = pData.phone;

    let message = '';
    
    if (tr.transport_type === 'PROPIO') {
      message = `SR. ${name}\nTURNO ${dateStr}: ${shiftStart}\nLLEGA POR SUS PROPIOS MEDIOS\n\n*ESTE ES UN MENSAJE QUE SE GENERA AUTOMATICO. NO LO RESPONDA*`;
    } else {
      message = `SR. ${name}\nTURNO ${dateStr}: ${shiftStart}\nRESERVA NRO: ${tr.reservation_number || 'PENDIENTE'}\nHORA DE RECOGIDA: ${tr.pickup_time?.substring(0,5) || '--:--'}\nDESDE: ${tr.pickup_address || '---'}\nHASTA: ${tr.destination_address || '---'}\n\n*ESTE ES UN MENSAJE QUE SE GENERA AUTOMATICO. NO LO RESPONDA*`;
    }

    // 5. Determine Group
    const dbSettings = await getSystemSettings();
    let positionName = (pData?.main_position_name || '').toUpperCase();

    // If position name is missing, fetch it from the ID
    if (!positionName && pData?.main_position) {
      const { data: posData } = await supabase.from('positions').select('name').eq('id', pData.main_position).single();
      positionName = (posData?.name || '').toUpperCase();
    }

    const combinedSearch = `${areaName} ${positionName}`.replace(/\s+/g, ''); // Remove spaces to match FEDEX and FED EX
    
    let groupId = dbSettings.ultramsg_group_others;
    if (combinedSearch.includes('BLUE')) groupId = dbSettings.ultramsg_group_blue;
    else if (combinedSearch.includes('FEDEX')) groupId = dbSettings.ultramsg_group_fedex;
    else if (combinedSearch.includes('DHL')) groupId = dbSettings.ultramsg_group_dhl;

    // 6. Send to both in parallel using cached settings
    const sendPromises = [];
    if (groupId) sendPromises.push(sendWhatsAppMessage(groupId, message, dbSettings));
    if (phone) sendPromises.push(sendWhatsAppMessage(phone.replace(/\D/g, ''), message, dbSettings));

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
  return { data, error: null };
}

export async function generateTransportRequests(date: string) {
  try {
    const role = await getAuthorizedRole();
    if (!role || !['ADMIN', 'SUPERVISOR', 'AIRPORT_ASSISTANT', 'ASSISTANT', 'HR'].includes(role)) {
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
        shift:shifts!shift_assignments_shift_id_fkey(*)
      `)
      .eq('date', date)
      .eq('is_confirmed', true)
      .neq('status', 'cancelled');

    if (assErr) throw assErr;
    if (!assignments || assignments.length === 0) return { success: true, message: 'No hay asignaciones confirmadas.' };

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

    for (const ass of assignments) {
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

      // ENTRADA
      if (isWithinWindow(shift.start_time)) {
        newRequests.push({
          personnel_id: ass.personnel_id,
          assignment_id: ass.id,
          date: ass.date,
          type: 'ENTRADA',
          status: 'ABIERTO',
          transport_type: 'PENDIENTE',
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
          transport_type: 'PENDIENTE',
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
    return { success: true, count: newRequests.length };
  } catch (error: any) {
    console.error('Error generateTransportRequests:', error);
    return { success: false, error: error.message };
  }
}

export async function clearTransportRequests(date: string) {
  const role = await getAuthorizedRole();
  if (!role || !['ADMIN', 'SUPERVISOR', 'AIRPORT_ASSISTANT', 'ASSISTANT', 'HR'].includes(role)) {
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
