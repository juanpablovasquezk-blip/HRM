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

  const supabase = await createAdminClient();
  const chileTime = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Santiago"}));
  const targetDate = date || format(chileTime, 'yyyy-MM-dd');

  try {
    const { data: assignments, error: assErr } = await supabase
      .from('shift_assignments')
      .select(`
        *,
        personnel:personnel!shift_assignments_personnel_id_fkey(*), 
        shift:shifts!shift_assignments_shift_id_fkey(id, name, start_time, end_time, requires_transport), 
        area:areas!shift_assignments_area_id_fkey(id, name), 
        position:positions!shift_assignments_position_id_fkey(id, name, whatsapp_group_id)
      `)
      .eq('date', targetDate)
      .neq('status', 'cancelled');

    if (assErr) throw assErr;

    const { data: transport } = await supabase
      .from('transport_requests')
      .select('*, personnel:personnel(*)')
      .eq('date', targetDate);

    // Filter out transport requests for inactive or terminated personnel
    const filteredTransport = (transport || []).filter(t => {
      const p = t.personnel;
      if (!p) return false;
      if (p.termination_date && targetDate > p.termination_date) return false;
      const todayStr = new Date().toLocaleDateString('sv');
      if (!p.is_active && targetDate >= todayStr) return false;
      return true;
    });

    return {
      assignments: assignments || [],
      transport: filteredTransport,
      shifts: (await supabase.from('shifts').select('id, name, start_time, end_time').order('name')).data || [],
      date: targetDate
    };
  } catch (error: any) {
    console.error('CRITICAL DB ERROR:', error);
    return { 
      assignments: [], 
      transport: [], 
      date: targetDate, 
      error: error.message || 'Error desconocido de base de datos' 
    };
  }
}

export async function updateAssignmentShift(assignmentId: string, newShiftId: string) {
  const session = await getSupervisorSession();
  if (!session) return { success: false, error: 'No session' };

  const supabase = await createAdminClient();
  const userName = `${session.first_name} ${session.last_name_father}`;

  const { error } = await supabase
    .from('shift_assignments')
    .update({
      shift_id: newShiftId,
      is_manual: true, // Mark as manual since a supervisor changed it
      override_by: null,
      override_reason: `Cambio de horario solicitado por bodega (Por: ${userName})`
    })
    .eq('id', assignmentId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/supervisor/attendance');
  revalidatePath('/supervisor/roster');
  return { success: true };
}

export async function updateAttendance(assignmentId: string, status: 'present' | 'absent', comment?: string) {
  const session = await getSupervisorSession();
  if (!session) return { success: false, error: 'No session' };

  const supabase = await createAdminClient();
  const userName = `${session.first_name} ${session.last_name_father}`;

  const { error } = await supabase
    .from('shift_assignments')
    .update({
      attendance_status: status,
      attendance_comment: status === 'absent' ? (comment || 'sin motivo') : null,
      attendance_updated_by: session.id,
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

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from('transport_requests')
    .update({ 
      observations,
      updated_by_name: `${session.first_name} ${session.last_name_father}`
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
  // 1. MANUAL BRUTE FORCE FETCH (No joins to avoid crashes)
  const { data: asg, error: asgErr } = await supabase.from('shift_assignments').select('*').eq('id', assignmentId).single();
  
  let personnel = null;
  let shiftData = null;
  let posData = null;
  let areaData = null;

  if (asg) {
    const [pRes, sRes, poRes, aRes] = await Promise.all([
      supabase.from('personnel').select('*').eq('id', asg.personnel_id).single(),
      supabase.from('shifts').select('*').eq('id', asg.shift_id).single(),
      supabase.from('positions').select('*').eq('id', asg.position_id).single(),
      supabase.from('areas').select('*').eq('id', asg.area_id).single()
    ]);
    personnel = pRes.data;
    shiftData = sRes.data;
    posData = poRes.data;
    areaData = aRes.data;
  } else {
    // Fallback if assignment not found
    const { data: pFallback } = await supabase.from('personnel').select('*').eq('id', personnelId).single();
    personnel = pFallback;
  }

  if (!personnel) return { success: false, error: 'No se encontró el trabajador' };

  let areaName = (areaData as any)?.name?.toUpperCase() || '';
  // Robust Address Parsing
  let homeAddress = 'DIRECCIÓN NO INFORMADA EN FICHA';
  if (personnel?.address) {
    const addr = personnel.address;
    if (typeof addr === 'string') {
      homeAddress = addr;
    } else if (typeof addr === 'object') {
      const parts = [addr.street, addr.city, addr.commune, addr.region].filter(Boolean);
      homeAddress = parts.length > 0 ? parts.join(', ') : (addr.full_address || JSON.stringify(addr));
    }
  }

  // Automated Destination Rules (SMART MAPPING)
  let destinationAddress = 'PLANTA / BODEGA';
  const areaNameUpper = areaName.toUpperCase();
  const positionNameUpper = (posData as any)?.name?.toUpperCase() || '';

  if (areaNameUpper.includes('BLUE') || positionNameUpper.includes('BLUE')) {
    destinationAddress = 'Los Maitenes Sur 9800, Pudahuel';
  } else if (areaNameUpper.includes('BODEGA') || positionNameUpper.includes('BODEGA') || positionNameUpper.includes('DHL') || positionNameUpper.includes('FEDEX')) {
    destinationAddress = 'Osvaldo Croquevielle 2207, Pudahuel';
  } else if (areaNameUpper.includes('AEROPUERTO') || positionNameUpper.includes('AEROPUERTO')) {
    destinationAddress = 'Armando Cortinez Oriente 1704';
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
    updated_by_name: `${session.first_name} ${session.last_name_father}`
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
  if (!dbError && mobilization === 'PROPIO' && personnel) {
    let debugInfo = 'Iniciando';
    try {
      const pData = personnel;
      debugInfo = `Persona: ${pData?.first_name || 'No encontrada'} | ASG_ID: ${assignmentId}`;

      const sData = shiftData as any;
      let posObj = posData as any;
      let aData = areaData as any;

      // FALLBACK: If join failed, fetch area and position manually
      if (!aData && (asg as any)?.area_id) {
        const { data } = await supabase.from('areas').select('name, whatsapp_group_id').eq('id', (asg as any).area_id).single();
        if (data) aData = data;
      }
      if (!posObj && (asg as any)?.position_id) {
        const { data } = await supabase.from('positions').select('name, whatsapp_group_id').eq('id', (asg as any).position_id).single();
        if (data) posObj = data;
      }

      const positionName = (Array.isArray(posObj) ? posObj[0]?.name : posObj?.name) || '';
      const positionNameUpper = positionName.toUpperCase();

      if (pData) {
        const isSupervisor = pData.role === 'Supervisor' || positionNameUpper.includes('SUPERVISOR');
        
        if (!isSupervisor) {
          const shiftTime = sData?.start_time?.substring(0, 5) || '00:00';
          const phone = pData.phone;
          
          debugInfo += ` | Prep Msg | Tel: ${phone || 'Sin tel'}`;

          // Determine Group
          const dbSettings = await getSystemSettings();
          
          if (dbSettings._error || dbSettings._warn) {
            debugInfo += ` | DB_SETTINGS_ISSUE: ${dbSettings._error || dbSettings._warn}`;
          } else {
            debugInfo += ` | DB_KEYS: ${Object.keys(dbSettings).join(',')}`;
          }

          // FORCED MANUAL LOOKUP (Bypassing schema cache issues)
          let finalPositionGroupId = '';
          let finalAreaGroupId = '';
          let detectedAreaName = '';

          // 1. Fetch Area details manually (Only for name diagnostic)
          if ((asg as any)?.area_id) {
             const { data: areaObj } = await supabase.from('areas').select('name').eq('id', (asg as any).area_id).single();
             if (areaObj) {
               detectedAreaName = areaObj.name;
             }
          }

          // 2. Fetch Position details manually
          if ((asg as any)?.position_id) {
             const { data: posObjManual } = await supabase.from('positions').select('whatsapp_group_id').eq('id', (asg as any).position_id).single();
             if (posObjManual) {
               finalPositionGroupId = posObjManual.whatsapp_group_id;
             }
          }

          console.log(`[WHATSAPP-DEBUG] Worker: ${pData?.first_name}, Area: "${detectedAreaName}", PosGroup: "${finalPositionGroupId}"`);

          const message = `SR. ${pData.first_name} ${pData.last_name_father}\nTURNO ${format(parseISO(date), 'dd-MM-yyyy')}: ${shiftTime}\n${mobilization === 'PROPIO' ? 'LLEGA POR SUS PROPIOS MEDIOS' : 'RECORRIDO EMPRESA'}\n\n*ESTE ES UN MENSAJE QUE SE GENERA AUTOMATICO. NO LO RESPONDA*`;

          // 3. FINAL ROUTING DECISION (Position > Others)
          const groupId = finalPositionGroupId || dbSettings.ultramsg_group_others;
          
          debugInfo += ` | AreaDet: ${detectedAreaName.substring(0,10)} | PosID: ${finalPositionGroupId ? 'SI' : 'NO'} | AreaID: ${finalAreaGroupId ? 'SI' : 'NO'} | Final: ${groupId.substring(0,8)}...`;

          // Send to Group
          let groupSent = false;
          let groupError = null;
          if (groupId) {
            const res = await sendWhatsAppMessage(groupId, message);
            groupSent = res.success;
            groupError = res.error;
            if (!res.success) {
              console.error(`WhatsApp Group Error (${groupId}):`, res.error);
              debugInfo += ` | Error Grupo: ${res.error}`;
            }
          } else {
            groupError = "No se encontró ID de grupo configurado";
          }
          
          // Send to Worker
          let workerSent = false;
          let workerError = null;
          if (phone) {
            const cleanPhone = phone.toString().replace(/\D/g, '');
            if (cleanPhone.length >= 8) {
              const res = await sendWhatsAppMessage(cleanPhone, message);
              workerSent = res.success;
              workerError = res.error;
              if (!res.success) {
                console.error(`WhatsApp Worker Error (${cleanPhone}):`, res.error);
                debugInfo += ` | Error Trabajador: ${res.error}`;
              }
            } else {
              workerError = `Teléfono inválido: ${phone}`;
            }
          } else {
            workerError = "Trabajador no tiene teléfono registrado";
          }

          revalidatePath('/supervisor/transport');
          return { 
            success: true, 
            whatsapp: { 
              group: groupSent, 
              worker: workerSent, 
              groupError: groupError || (groupSent ? null : 'Error desconocido'),
              workerError: workerError || (workerSent ? null : 'Error desconocido'),
              debug: debugInfo 
            } 
          };
        } else {
          return { success: true, whatsapp: { group: false, worker: false, debug: 'Omitido: Es Supervisor' } };
        }
      } else {
        return { success: true, whatsapp: { group: false, worker: false, debug: 'Error: No hay datos de personal' } };
      }
    } catch (e: any) {
      console.error('NOTIFY CATCH ERROR:', e);
      return { 
        success: true, 
        whatsapp: { 
          group: false, 
          worker: false, 
          groupError: `Error interno: ${e.message}`,
          workerError: `Error interno: ${e.message}`,
          debug: `CATCH: ${e.message} | State: ${debugInfo}` 
        } 
      };
    }
  }
  
  revalidatePath('/supervisor/transport');
  if (mobilization === 'PROPIO') {
    return { success: true, whatsapp: { debug: 'DEBUG: Salió del bloque sin retornar nada' } };
  }
  return { success: true };
}

export async function updateTransportType(requestId: string, type: 'PROPIO' | 'EMPRESA') {
  const session = await getSupervisorSession();
  if (!session) return { success: false, error: 'No session' };

  const supabase = await createAdminClient();
  const userName = `${session.first_name} ${session.last_name_father}`;

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
  const supabase = await createAdminClient();
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
