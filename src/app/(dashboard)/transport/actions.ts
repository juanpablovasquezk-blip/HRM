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

export async function updateTransportCost(requestId: string, cost: number | null) {
  try {
    const role = await getAuthorizedRole();
    if (!role || !['ADMIN', 'SUPERVISOR', 'AIRPORT_ASSISTANT', 'HR'].includes(role)) {
      return { success: false, error: 'No autorizado' };
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('transport_requests')
      .update({ cost: cost !== null ? Number(cost) : null })
      .eq('id', requestId);

    if (error) throw error;

    revalidatePath('/transport');
    revalidatePath('/reports/transport');
    return { success: true };
  } catch (error: any) {
    console.error('Error updateTransportCost:', error);
    return { success: false, error: error.message };
  }
}

export async function assignColleaguePickup(passengerRequestId: string, driverPersonnelId: string) {
  try {
    const role = await getAuthorizedRole();
    if (!role || !['ADMIN', 'SUPERVISOR', 'AIRPORT_ASSISTANT', 'HR'].includes(role)) {
      return { success: false, error: 'No autorizado' };
    }

    const supabase = createAdminClient();

    // 1. Fetch passenger request & personnel
    const { data: passReq, error: passErr } = await supabase
      .from('transport_requests')
      .select('*, personnel:personnel_id(first_name, last_name_father)')
      .eq('id', passengerRequestId)
      .single();

    if (passErr || !passReq) {
      return { success: false, error: 'Solicitud de pasajero no encontrada' };
    }

    const passengerName = `${passReq.personnel?.first_name || ''} ${passReq.personnel?.last_name_father || ''}`.trim();

    // 2. Fetch driver personnel
    const { data: driver, error: driverErr } = await supabase
      .from('personnel')
      .select('id, first_name, last_name_father, phone')
      .eq('id', driverPersonnelId)
      .single();

    if (driverErr || !driver) {
      return { success: false, error: 'Conductor no encontrado' };
    }

    const driverName = `${driver.first_name} ${driver.last_name_father}`.trim();

    // 3. Check capacity: max 3 passengers per driver on this date and type
    const { data: existingPickups } = await supabase
      .from('transport_requests')
      .select('id, observations')
      .eq('personnel_id', driverPersonnelId)
      .eq('date', passReq.date)
      .eq('type', passReq.type)
      .ilike('observations', 'Recogida a %');

    // Exclude existing row for THIS passenger if already assigned
    const currentPickupForPassenger = existingPickups?.find(r => r.observations?.includes(passengerName));
    const otherPickupsCount = (existingPickups || []).filter(r => !r.observations?.includes(passengerName)).length;

    if (otherPickupsCount >= 3) {
      return { success: false, error: `El conductor ${driverName} ya tiene el límite máximo de 3 pasajeros asignados para este turno.` };
    }

    // 4. Update passenger request
    const passengerObservations = `Pasa a buscar: ${driverName} | DRIVER_ID:${driver.id}`;
    await supabase
      .from('transport_requests')
      .update({
        transport_type: 'COLEGA',
        observations: passengerObservations,
        status: 'ABIERTO'
      })
      .eq('id', passengerRequestId);

    // 5. Get driver's own assignment if available
    const { data: driverAsg } = await supabase
      .from('shift_assignments')
      .select('id')
      .eq('personnel_id', driverPersonnelId)
      .eq('date', passReq.date)
      .limit(1)
      .maybeSingle();

    const targetAssignmentId = driverAsg?.id || passReq.assignment_id;

    // 6. Create or update driver's pickup bonus row as GESTIONADO
    if (currentPickupForPassenger) {
      await supabase
        .from('transport_requests')
        .update({
          observations: `Recogida a ${passengerName}`,
          status: 'GESTIONADO',
          pickup_address: passReq.pickup_address,
          destination_address: passReq.destination_address,
          assignment_id: targetAssignmentId
        })
        .eq('id', currentPickupForPassenger.id);
    } else {
      await supabase
        .from('transport_requests')
        .insert({
          personnel_id: driverPersonnelId,
          assignment_id: targetAssignmentId,
          date: passReq.date,
          type: passReq.type,
          transport_type: 'PROPIO',
          status: 'GESTIONADO',
          observations: `Recogida a ${passengerName}`,
          pickup_address: passReq.pickup_address,
          destination_address: passReq.destination_address,
          updated_by_name: 'Carpooling / Colega'
        });
    }

    revalidatePath('/transport');
    revalidatePath('/reports/bonos');
    return { success: true, driverName };
  } catch (error: any) {
    console.error('Error in assignColleaguePickup:', error);
    return { success: false, error: error.message || 'Error al asignar colega' };
  }
}

export async function unassignColleaguePickup(passengerRequestId: string) {
  try {
    const role = await getAuthorizedRole();
    if (!role || !['ADMIN', 'SUPERVISOR', 'AIRPORT_ASSISTANT', 'HR'].includes(role)) {
      return { success: false, error: 'No autorizado' };
    }

    const supabase = createAdminClient();

    const { data: passReq } = await supabase
      .from('transport_requests')
      .select('*, personnel:personnel_id(first_name, last_name_father)')
      .eq('id', passengerRequestId)
      .single();

    if (!passReq) return { success: false, error: 'Solicitud no encontrada' };

    const passengerName = `${passReq.personnel?.first_name || ''} ${passReq.personnel?.last_name_father || ''}`.trim();

    // Remove the driver's bonus row for this passenger
    if (passengerName) {
      await supabase
        .from('transport_requests')
        .delete()
        .eq('date', passReq.date)
        .eq('type', passReq.type)
        .eq('transport_type', 'PROPIO')
        .ilike('observations', `%Recogida a ${passengerName}%`);
    }

    // Reset passenger request to REQUIERE TRANSPORTE
    await supabase
      .from('transport_requests')
      .update({
        transport_type: 'REQUERIDO',
        observations: null,
        status: 'ABIERTO'
      })
      .eq('id', passengerRequestId);

    revalidatePath('/transport');
    revalidatePath('/reports/bonos');
    return { success: true };
  } catch (error: any) {
    console.error('Error in unassignColleaguePickup:', error);
    return { success: false, error: error.message };
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
    let posGroupId: string | null = null;

    if (asg) {
      const [sDataRes, aDataRes, pDataRes] = await Promise.all([
        supabase.from('shifts').select('start_time').eq('id', asg.shift_id).single(),
        supabase.from('areas').select('name').eq('id', asg.area_id).single(),
        supabase.from('positions').select('name, whatsapp_group_id').eq('id', asg.position_id).single()
      ]);
      
      shiftStart = sDataRes.data?.start_time?.substring(0, 5) || '00:00';
      areaName = (aDataRes.data?.name || '').toUpperCase();
      posName = (pDataRes.data?.name || '').toUpperCase();
      posGroupId = pDataRes.data?.whatsapp_group_id || null;
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

    // Custom Messages per Mode
    let driverPhone: string | null = null;
    let driverMessage: string | null = null;

    if (tr.transport_type === 'COLEGA') {
      // 1. CARPOOLING: Recogida por colega
      let driverName = 'UN COMPAÑERO';
      const obs = tr.observations || '';
      const matchName = obs.match(/Pasa a buscar:\s*([^|]+)/i);
      if (matchName) driverName = matchName[1].trim().toUpperCase();

      const matchDriverId = obs.match(/DRIVER_ID:\s*([a-f0-9-]+)/i);
      if (matchDriverId) {
        const { data: driverRow } = await supabase
          .from('personnel')
          .select('first_name, last_name_father, phone')
          .eq('id', matchDriverId[1])
          .single();
        if (driverRow) {
          driverName = `${driverRow.first_name} ${driverRow.last_name_father}`.toUpperCase();
          driverPhone = driverRow.phone;
          driverMessage = `SR. ${driverName}\nTURNO ${dateStr}: ${shiftStart}\nASIGNACIÓN DE RECOGIDA DE COMPAÑERO:\n- PASAJERO: ${name}\n- DIRECCIÓN: ${tr.pickup_address || 'Sin dirección'}\n- TELÉFONO: ${phone || 'Sin teléfono'}\nPor favor coordinar horario internamente para el ingreso a las ${shiftStart}.\n\n${warning}`;
        }
      }

      body = `SR. ${name}\nTURNO ${dateStr}: ${shiftStart}\nMAÑANA LO PASARÁ A BUSCAR EL SR. ${driverName}. INTERNAMENTE SE CONTACTARÁ PARA COORDINAR EL HORARIO PARA SU ENTRADA A TRABAJAR A LAS ${shiftStart}.`;
    } else if (tr.transport_type === 'OTRO_PROVEEDOR') {
      // 2. OTRO PROVEEDOR
      let provName = 'PROVEEDOR ALTERNATIVO';
      const obs = tr.observations || '';
      const matchProv = obs.match(/Proveedor:\s*([^|]+)/i);
      if (matchProv) provName = matchProv[1].trim().toUpperCase();

      body = `SR. ${name}\nTURNO ${dateStr}: ${shiftStart}\nTRANSPORTE COORDINADO CON: ${provName}\nHORA DE RECOGIDA: ${tr.pickup_time?.substring(0,5) || 'POR CONFIRMAR'}\nRESERVA / MÓVIL: ${tr.reservation_number || 'PENDIENTE'}\nDESDE: ${tr.pickup_address || '---'}\nHASTA: ${tr.destination_address || '---'}`;
    } else if (isTimePending && isFedex) {
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

    // 5. Determine Group (Priority: Position whatsapp_group_id > Name search in assignment/area > Settings fallback)
    const dbSettings = await getSystemSettings();
    let groupId = posGroupId || null;

    if (!groupId) {
      const combinedSearch = `${areaName} ${posName} ${pData?.main_position_name || ''}`.toUpperCase().replace(/\s+/g, '');
      if (combinedSearch.includes('DHL')) groupId = dbSettings.ultramsg_group_dhl;
      else if (combinedSearch.includes('FEDEX')) groupId = dbSettings.ultramsg_group_fedex;
      else if (combinedSearch.includes('BLUE')) groupId = dbSettings.ultramsg_group_blue;
      else if (combinedSearch.includes('AEROPUERTO')) groupId = dbSettings.ultramsg_group_others;
    }

    if (!groupId && pData?.main_position) {
      const { data: mainPosData } = await supabase.from('positions').select('name, whatsapp_group_id').eq('id', pData.main_position).single();
      if (mainPosData?.whatsapp_group_id) {
        groupId = mainPosData.whatsapp_group_id;
      } else if (mainPosData?.name) {
        const mUpper = mainPosData.name.toUpperCase();
        if (mUpper.includes('DHL')) groupId = dbSettings.ultramsg_group_dhl;
        else if (mUpper.includes('FEDEX')) groupId = dbSettings.ultramsg_group_fedex;
        else if (mUpper.includes('BLUE')) groupId = dbSettings.ultramsg_group_blue;
      }
    }

    if (!groupId) {
      groupId = dbSettings.ultramsg_group_others;
    }

    // 6. Find 04:00 Supervisor for the individual message if Transvip
    let individualMessage = `${body}\n\n${warning}`;

    if (tr.transport_type === 'REQUERIDO' || tr.transport_type === 'EMPRESA') {
      let supervisorName = 'SUPERVISOR DE TURNO';
      try {
        const { data: assignments } = await supabase
          .from('shift_assignments')
          .select(`
            shifts!shift_assignments_shift_id_fkey(start_time),
            personnel(first_name, last_name_father),
            positions(name)
          `)
          .eq('date', tr.date)
          .eq('status', 'scheduled');
          
        const sup0400 = assignments?.find((s: any) => {
          const startTime = s.shifts?.start_time || '';
          const pName = (s.positions?.name || '').toUpperCase();
          return startTime.startsWith('04:00') && pName.includes('SUPERVISOR');
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

      individualMessage = `${body}\n\nSi tiene problemas con su recogida, contactarse con Transvip al (2) 2677 3000. Si no lo pasan a buscar, contactese con el supervisor *${supervisorName}* a las 04:00.\n\n${warning}`;
    }

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

    // If Carpooling, also send notification to Driver
    if (driverPhone && driverMessage) {
      sendPromises.push(sendWhatsAppMessage(driverPhone.trim().replace(/\D/g, ''), driverMessage, dbSettings));
    }

    const results = await Promise.all(sendPromises);
    const failed = results.find(r => !r.success);
    
    if (failed) {
      console.error('WhatsApp failed:', failed);
      return { success: false, error: failed.error || 'Error al enviar uno de los mensajes' };
    }

    // Mark request as GESTIONADO
    await supabase
      .from('transport_requests')
      .update({ status: 'GESTIONADO' })
      .eq('id', requestId);

    // If Carpooling, also mark driver's bonus row as GESTIONADO
    if (tr.transport_type === 'COLEGA') {
      await supabase
        .from('transport_requests')
        .update({ status: 'GESTIONADO' })
        .eq('date', tr.date)
        .eq('type', tr.type)
        .eq('transport_type', 'PROPIO')
        .ilike('observations', `%Recogida a ${name}%`);
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

  filteredData.sort((a, b) => {
    const timeA = a.type === 'SALIDA' 
      ? (a.assignment?.shift?.end_time || a.assignment?.shift?.start_time || '99:99')
      : (a.assignment?.shift?.start_time || '99:99');
    const timeB = b.type === 'SALIDA' 
      ? (b.assignment?.shift?.end_time || b.assignment?.shift?.start_time || '99:99')
      : (b.assignment?.shift?.start_time || '99:99');

    const timeCompare = timeA.localeCompare(timeB);
    if (timeCompare !== 0) return timeCompare;

    const getGroupKey = (req: any) => {
      const area = (req.assignment?.area?.name || '').toUpperCase().trim();
      const pos = (req.assignment?.position?.name || '').toUpperCase().trim();
      if (area.includes('DHL') || pos.includes('DHL')) return `DHL - ${pos || area}`;
      if (area.includes('FEDEX') || pos.includes('FEDEX')) return `FEDEX - ${pos || area}`;
      if (area.includes('BLUE') || pos.includes('BLUE')) return `BLUE EXPRESS - ${pos || area}`;
      if (area.includes('AEROPUERTO') || pos.includes('AEROPUERTO')) return `AEROPUERTO - ${pos || area}`;
      return `${area} ${pos}`.trim() || 'OTROS';
    };

    const groupA = getGroupKey(a);
    const groupB = getGroupKey(b);
    const groupCompare = groupA.localeCompare(groupB, 'es', { sensitivity: 'base' });
    if (groupCompare !== 0) return groupCompare;

    const nameA = `${a.personnel?.last_name_father || ''} ${a.personnel?.last_name_mother || ''} ${a.personnel?.first_name || ''}`.trim();
    const nameB = `${b.personnel?.last_name_father || ''} ${b.personnel?.last_name_mother || ''} ${b.personnel?.first_name || ''}`.trim();
    return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
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
