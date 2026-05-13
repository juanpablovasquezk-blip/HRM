'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { format, parseISO } from 'date-fns';

import { sendWhatsAppMessage, getSystemSettings } from '@/lib/ultramsg';

export async function updateTransportRequest(id: string, updates: any) {
  try {
    const supabase = await createClient();
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
    const supabase = await createClient();
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
      const { data: sData } = await supabase.from('shifts').select('start_time').eq('id', asg.shift_id).single();
      const { data: aData } = await supabase.from('areas').select('name').eq('id', asg.area_id).single();
      shiftStart = sData?.start_time?.substring(0, 5) || '00:00';
      areaName = (aData?.name || '').toUpperCase();
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

    // 6. Send to both
    if (groupId) await sendWhatsAppMessage(groupId, message);
    if (phone) await sendWhatsAppMessage(phone.replace(/\D/g, ''), message);

    return { success: true };
  } catch (error: any) {
    console.error('Error sending WhatsApp:', error);
    return { success: false, error: error.message };
  }
}

export async function getTransportRequests(date: string) {
  const supabase = await createClient();
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
  const supabase = await createClient();
  
  // 1. Get all confirmed assignments for that date
  const { data: assignments, error: assErr } = await supabase
    .from('shift_assignments')
    .select('*, personnel:personnel(*), area:areas(*), shift:shifts!shift_assignments_shift_id_fkey(*)')
    .eq('date', date)
    .eq('is_confirmed', true)
    .neq('status', 'cancelled');

  if (assErr) return { success: false, error: assErr.message };
  if (!assignments || assignments.length === 0) return { success: true, message: 'No hay asignaciones confirmadas para procesar.' };

  let createdCount = 0;

  const isWithinWindow = (timeStr: string) => {
    if (!timeStr) return false;
    const hour = parseInt(timeStr.split(':')[0], 10);
    const minute = parseInt(timeStr.split(':')[1], 10);
    const timeVal = hour * 100 + minute;
    // Window: 23:00 (2300) to 06:30 (0630)
    return (timeVal >= 2300 || timeVal <= 630);
  };

  for (const ass of assignments) {
    // Check if requests already exist to avoid duplicates
    const { data: existing } = await supabase
      .from('transport_requests')
      .select('id')
      .eq('assignment_id', ass.id);

    if (existing && existing.length > 0) continue;

    const personnel = ass.personnel;
    if (!personnel) continue;
    
    const shift = ass.shift;
    if (!shift) continue;

    const area = (ass as any).area;
    const areaName = (area?.name || '').toUpperCase();

    const homeAddress = personnel.address 
      ? `${(personnel.address as any).street || ''}, ${(personnel.address as any).city || ''}` 
      : null;
      
    if (!homeAddress) continue;

    // Determine plant address based on area
    let plantAddress = "MINERQUIM PLANTA"; 
    if (areaName.includes('BODEGA')) {
      plantAddress = "Osvaldo Croquevielle 2207, Pudahuel";
    } else if (areaName.includes('BLUE') || areaName.includes('BLUEEXPRESS')) {
      plantAddress = "Los Maitenes Sur 9800, Pudahuel";
    }

    // Create ENTRADA (Home -> Plant) if start_time is in window
    if (isWithinWindow(shift.start_time)) {
      await supabase.from('transport_requests').insert({
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

    // Create SALIDA (Plant -> Home) if end_time is in window
    if (isWithinWindow(shift.end_time)) {
      await supabase.from('transport_requests').insert({
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

    createdCount++;
  }

  revalidatePath('/transport');
  return { success: true, count: createdCount };
}

export async function clearTransportRequests(date: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('transport_requests')
    .delete()
    .eq('date', date);
    
  if (error) return { success: false, error: error.message };
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
