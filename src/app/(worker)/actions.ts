'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { parseISO, format, addMonths, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateDynamicExpiration } from '@/lib/utils/document-calc';
import { syncDependentDocumentsExpiration } from '@/lib/documents/sync-expiry';

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
  const session = await getWorkerSession();
  if (!session) return [];

  const supabase = await createClient();

  // Collect all the worker's position IDs
  const positionIds: string[] = [];
  if (session.main_position) positionIds.push(session.main_position);
  if (Array.isArray(session.secondary_positions)) positionIds.push(...session.secondary_positions);

  // Fetch all active document definitions
  const { data: allDefs } = await supabase
    .from('document_definitions')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (!allDefs) return [];

  // Keep definitions that apply to this worker's position(s)
  return allDefs.filter(def => {
    const applicable: string[] = def.applicable_positions || [];
    // No restriction → applies to everyone
    if (applicable.length === 0) return true;
    // Otherwise check intersection with worker's positions
    return applicable.some((p: string) => positionIds.includes(p));
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

  const adminClient = createAdminClient();

  // 1. Upload base64 file to storage if provided
  let fileUrl = record.file_url;
  if (record.base64Data) {
    try {
      const base64Str = record.base64Data;
      const marker = ';base64,';
      const markerIndex = base64Str.indexOf(marker);
      
      let buffer: Buffer;
      let contentType = 'application/octet-stream';
      
      if (markerIndex === -1) {
        buffer = Buffer.from(base64Str, 'base64');
      } else {
        buffer = Buffer.from(base64Str.substring(markerIndex + marker.length), 'base64');
        contentType = base64Str.substring(5, base64Str.indexOf(';'));
      }

      const ext = contentType === 'application/pdf' ? 'pdf' : 'jpg';
      const fileName = `${session.id}/${record.definition_id || 'document'}-${Date.now()}.${ext}`;

      const { error: uploadError } = await adminClient.storage
        .from('documents')
        .upload(fileName, buffer, {
          contentType,
          upsert: true
        });

      if (uploadError) {
        console.error('Storage upload failed:', uploadError);
        return { success: false, error: `Upload failed: ${uploadError.message}` };
      }

      const { data: urlData } = adminClient.storage
        .from('documents')
        .getPublicUrl(fileName);

      fileUrl = urlData.publicUrl;
    } catch (e: any) {
      console.error('Storage processing failed:', e);
      return { success: false, error: e.message || 'Error processing storage upload' };
    }
  }

  if (!fileUrl) {
    return { success: false, error: 'El archivo del documento es obligatorio' };
  }

  // Delete previous document of same definition (upsert pattern without needing DB unique constraint)
  if (record.definition_id) {
    const { data: existing } = await adminClient
      .from('documents')
      .select('id, file_url')
      .eq('personnel_id', session.id)
      .eq('definition_id', record.definition_id);

    if (existing && existing.length > 0) {
      // Remove old storage files
      for (const old of existing) {
        if (old.file_url) {
          const marker = '/documents/';
          const idx = old.file_url.lastIndexOf(marker);
          if (idx !== -1) {
            const storagePath = old.file_url.substring(idx + marker.length);
            await adminClient.storage.from('documents').remove([storagePath]);
          }
        }
      }
      // Delete old DB records
      const oldIds = existing.map((d: any) => d.id);
      await adminClient.from('documents').delete().in('id', oldIds);
    }
  }

  const dataToSave: any = {
    personnel_id: session.id,
    definition_id: record.definition_id,
    file_url: fileUrl,
    type: record.type || 'Documento',
    status: 'PENDING',
    uploaded_at: new Date().toISOString(),
    expiration_date: record.expiration_date || null,
  };

  const { error } = await adminClient
    .from('documents')
    .insert(dataToSave);

  if (error) {
    console.error('CRITICAL DATABASE ERROR:', error);
    return { success: false, error: error.message };
  }

  // Sync dependent documents in case this is the anchor or vice versa
  await syncDependentDocumentsExpiration(session.id, adminClient);

  // Notify admins about the document upload
  try {
    const { data: adminUsers } = await adminClient
      .from('users')
      .select('id')
      .in('role', ['ADMIN', 'HR']);
    
    if (adminUsers && adminUsers.length > 0) {
      const workerName = `${session.first_name} ${session.last_name_father}`;
      const notifications = adminUsers.map((admin: any) => ({
        user_id: admin.id,
        type: 'general' as const,
        title: 'Documento por Validar',
        message: `${workerName} (${session.rut}) ha subido un nuevo documento (${record.type || 'Documento'}) que requiere validación.`,
        data: { personnel_id: session.id, document_type: record.type, action: 'document_pending' },
      }));
      
      await adminClient.from('notifications').insert(notifications);
    }
  } catch (e) {
    console.warn('Failed to notify admins about document upload:', e);
  }

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

export async function getWorkerProfile() {
  const session = await getWorkerSession();
  if (!session) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from('personnel')
    .select('*, company:companies(id, name)')
    .eq('id', session.id)
    .single();
    
  return data;
}

export async function updateWorkerProfile(formData: Record<string, any>) {
  const session = await getWorkerSession();
  if (!session) return { success: false, error: 'No hay sesión activa' };

  const adminClient = createAdminClient();
  
  const toUpper = (val: any) => {
    if (typeof val === 'string') return val.trim().toUpperCase();
    return val || null;
  };

  const cleanEmail = formData.email ? formData.email.trim().toLowerCase() : null;

  const addressJson = {
    street: toUpper(formData.address_street) || '',
    city: toUpper(formData.address_city) || '',
    region: toUpper(formData.address_region) || '',
    comuna: toUpper(formData.address_comuna) || '',
  };

  const updatePayload: Record<string, any> = {
    email: cleanEmail,
    phone: formData.phone || '',
    birth_date: formData.birth_date || session.birth_date,
    address: addressJson,
    emergency_contact_name: toUpper(formData.emergency_contact_name),
    emergency_contact_relationship: toUpper(formData.emergency_contact_relationship),
    emergency_contact_phone: formData.emergency_contact_phone || '',
    afp: toUpper(formData.afp),
    health_system: toUpper(formData.health_system),
    isapre: formData.health_system === 'ISAPRE' ? toUpper(formData.isapre) : null,
    gender: toUpper(formData.gender),
    bank_account_type: toUpper(formData.bank_account_type),
    bank_name: toUpper(formData.bank_name),
    bank_account_number: toUpper(formData.bank_account_number),
    nationality: toUpper(formData.nationality) || 'CHILENA',
    marital_status: toUpper(formData.marital_status),
  };

  // Clothing sizes
  if (formData.clothing_tshirt_size) updatePayload.clothing_tshirt_size = toUpper(formData.clothing_tshirt_size);
  if (formData.clothing_polar_size) updatePayload.clothing_polar_size = toUpper(formData.clothing_polar_size);
  if (formData.clothing_pants_size_letter) updatePayload.clothing_pants_size_letter = toUpper(formData.clothing_pants_size_letter);
  if (formData.clothing_pants_size_number) updatePayload.clothing_pants_size_number = toUpper(formData.clothing_pants_size_number);
  if (formData.clothing_shoe_size) updatePayload.clothing_shoe_size = toUpper(formData.clothing_shoe_size);
  if (formData.clothing_parka_size) updatePayload.clothing_parka_size = toUpper(formData.clothing_parka_size);
  if (formData.clothing_overall_size) updatePayload.clothing_overall_size = toUpper(formData.clothing_overall_size);

  try {
    const { error } = await adminClient
      .from('personnel')
      .update(updatePayload)
      .eq('id', session.id);

    if (error) throw error;

    // Notify admins about the update
    try {
      const { data: adminUsers } = await adminClient
        .from('users')
        .select('id')
        .in('role', ['ADMIN', 'HR']);
      
      if (adminUsers && adminUsers.length > 0) {
        const workerName = `${session.first_name} ${session.last_name_father}`;
        const notifications = adminUsers.map((admin: any) => ({
          user_id: admin.id,
          type: 'general' as const,
          title: 'Ficha Actualizada',
          message: `${workerName} (${session.rut}) ha actualizado su ficha personal desde la app.`,
          data: { personnel_id: session.id, updated_by: 'worker_app' },
        }));
        
        await adminClient.from('notifications').insert(notifications);
      }
    } catch (e) {
      console.warn('Failed to notify admins:', e);
    }

    return { success: true, error: null };
  } catch (error: any) {
    console.error('Error updating worker profile:', error);
    return { success: false, error: error.message };
  }
}

export async function getWorkerDocsStatus() {
  const session = await getWorkerSession();
  if (!session) return { hasAlert: false };

  const [definitions, existingDocuments] = await Promise.all([
    getActiveDocumentDefinitions(),
    getWorkerDocuments()
  ]);

  if (definitions.length === 0) return { hasAlert: false };

  const todayStr = new Date().toISOString().split('T')[0];

  const hasAlert = definitions.some(def => {
    const doc = existingDocuments.find(d => d.definition_id === def.id);
    
    // 1. Missing and mandatory
    if (!doc) {
      return def.is_mandatory;
    }
    
    // 2. Rejected
    if (doc.status === 'REJECTED') {
      return true;
    }
    
    // 3. Expired
    let expirationDate = doc.expiration_date;
    if (def.depends_on_definition_id) {
      const anchorDoc = existingDocuments.find(d => d.definition_id === def.depends_on_definition_id);
      if (anchorDoc?.expiration_date) {
        const calcDate = calculateDynamicExpiration(
          new Date(anchorDoc.expiration_date),
          def.cycle_months || 6,
          def.anchor_days_offset || 30
        );
        expirationDate = calcDate.toISOString().split('T')[0];
      }
    }

    if (expirationDate && expirationDate < todayStr) {
      return true;
    }
    
    return false;
  });

  return { hasAlert };
}

