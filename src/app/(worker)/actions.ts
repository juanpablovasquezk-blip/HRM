'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireActionAuth } from '@/lib/auth/action-guard';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { parseISO, format, addMonths, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateDynamicExpiration } from '@/lib/utils/document-calc';
import { syncDependentDocumentsExpiration } from '@/lib/documents/sync-expiry';
import { validateAntecedentesPDF } from '@/lib/documents/validation';
import {
  evaluateWorkerPendingDocuments,
  expandDateRange,
  FREE_DAY_REQUEST_REASON,
  getSantiagoDateString,
  VACATION_SUCCESS_MESSAGE,
} from '@/lib/worker/portal-requests';

function safeRevalidateWorkerPaths() {
  if (process.env.ROSTER_ISOLATED_TEST === 'true') return;
  revalidatePath('/worker');
  revalidatePath('/leaves');
}

export async function loginAsWorker(_email: string) {
  const cookieStore = await cookies();
  cookieStore.delete('worker_email');
  cookieStore.delete('worker_id');
  return {
    success: false,
    error: 'Método de acceso heredado deshabilitado. Inicia sesión desde /login.',
  };
}

export async function logoutWorker() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const cookieStore = await cookies();
  cookieStore.delete('worker_email');
  cookieStore.delete('worker_id');
  redirect('/login');
}

const getWorkerSessionCached = cache(async () => {
  const auth = await requireActionAuth();
  if (!auth.ok) return null;

  const admin = createAdminClient();

  const { data: byUserId, error: byUserIdErr } = await admin
    .from('personnel')
    .select('*')
    .eq('user_id', auth.userId)
    .limit(2);

  if (!byUserIdErr && byUserId) {
    if (byUserId.length === 1) {
      return byUserId[0].is_active === false ? null : byUserId[0];
    }
    if (byUserId.length > 1) return null;
  }

  if (auth.email) {
    const { data: byEmail, error: byEmailErr } = await admin
      .from('personnel')
      .select('*')
      .eq('email', auth.email.trim().toLowerCase())
      .limit(2);

    if (!byEmailErr && byEmail && byEmail.length === 1) {
      return byEmail[0].is_active === false ? null : byEmail[0];
    }
  }

  return null;
});

export async function getWorkerSession() {
  return getWorkerSessionCached();
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
    .eq('personnel_id', session.id)
    .order('uploaded_at', { ascending: false });
  
  return data || [];
}

export async function getWorkerDocumentDirectTarget(definitionId: string) {
  const session = await getWorkerSession();
  if (!session || !definitionId) return { definition: null, document: null };

  const positionIds: string[] = [];
  if (session.main_position) positionIds.push(session.main_position);
  if (Array.isArray(session.secondary_positions)) positionIds.push(...session.secondary_positions);

  const supabase = await createClient();
  const [{ data: def }, { data: docs }] = await Promise.all([
    supabase
      .from('document_definitions')
      .select('*')
      .eq('id', definitionId)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('documents')
      .select('*')
      .eq('personnel_id', session.id)
      .order('uploaded_at', { ascending: false }),
  ]);

  if (!def) return { definition: null, document: null };

  const applicable: string[] = def.applicable_positions || [];
  const isApplicable =
    applicable.length === 0 || applicable.some((p: string) => positionIds.includes(p));
  if (!isApplicable) return { definition: null, document: null };

  const doc =
    (docs || []).find(
      (d: any) =>
        d.definition_id === def.id ||
        (d.type || '').toLowerCase().trim() === (def.name || '').toLowerCase().trim()
    ) || null;

  return { definition: def, document: doc };
}


export async function uploadDocumentRecord(record: any) {
  const session = await getWorkerSession();
  if (!session) return { success: false, error: 'No session' };

  const typeName = record.type || '';
  const isTicaOrPcp = typeName.toLowerCase().includes('tica') || typeName.toLowerCase().includes('pcp');
  if (isTicaOrPcp && (!record.number || record.number.trim() === '')) {
    return { success: false, error: 'El número de credencial es obligatorio para TICA y PCP' };
  }

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

      const isAntecedentes = record.type && record.type.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('antecedentes');
      if (isAntecedentes && contentType === 'application/pdf') {
        const valRes = await validateAntecedentesPDF(buffer);
        if (!valRes.valid) {
          return { success: false, error: valRes.error };
        }
      }

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

  // Delete previous document of same definition/type (upsert pattern)
  const { data: allUserDocs } = await adminClient
    .from('documents')
    .select('id, file_url, type, definition_id')
    .eq('personnel_id', session.id);

  const normType = (record.type || '').toLowerCase().trim();

  const existingDocs = (allUserDocs || []).filter((d: any) => {
    if (record.definition_id && d.definition_id === record.definition_id) return true;
    const dType = (d.type || '').toLowerCase().trim();
    if (normType && dType === normType) return true;
    return false;
  });

  if (existingDocs && existingDocs.length > 0) {
    // Remove old storage files
    for (const old of existingDocs) {
      if (old.file_url) {
        const marker = '/documents/';
        const idx = old.file_url.lastIndexOf(marker);
        if (idx !== -1) {
          const storagePath = old.file_url.substring(idx + marker.length);
          try {
            await adminClient.storage.from('documents').remove([storagePath]);
          } catch (e) {
            console.warn('Storage delete warning:', e);
          }
        }
      }
    }
    // Delete old DB records
    const oldIds = existingDocs.map((d: any) => d.id);
    await adminClient.from('documents').delete().in('id', oldIds);
  }

  const dataToSave: any = {
    personnel_id: session.id,
    definition_id: record.definition_id,
    file_url: fileUrl,
    type: record.type || 'Documento',
    number: record.number || '',
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

export async function checkWorkerQuotaAvailability(
  params: { personnelId: string; dates: string[] },
  testHooks?: { supabase?: any; session?: any }
): Promise<{ available: boolean; occupiedDates: string[]; error?: string }> {
  const isIsolatedTest = process.env.ROSTER_ISOLATED_TEST === 'true' && Boolean(testHooks?.supabase);
  const session = isIsolatedTest ? testHooks?.session : await getWorkerSession();
  if (!session?.id || params.personnelId !== session.id) {
    return { available: false, occupiedDates: [], error: 'No autorizado.' };
  }

  const uniqueDates = Array.from(new Set((params.dates || []).filter(Boolean))).sort();
  if (uniqueDates.length === 0) {
    return { available: true, occupiedDates: [] };
  }

  const supabase: any = isIsolatedTest ? testHooks!.supabase : createAdminClient();
  const minDate = uniqueDates[0];
  const maxDate = uniqueDates[uniqueDates.length - 1];

  const { data: workerRow } = await supabase
    .from('personnel')
    .select('id, main_position')
    .eq('id', params.personnelId)
    .maybeSingle();

  let areaId: string | null = null;
  if (workerRow?.main_position) {
    const { data: posRow } = await supabase
      .from('positions')
      .select('id, area_id')
      .eq('id', workerRow.main_position)
      .maybeSingle();
    areaId = posRow?.area_id || null;
  }

  // Find peer IDs sharing the same main_position and area_id
  let peerIds: string[] = [];
  if (workerRow?.main_position && areaId) {
    const { data: posPeers } = await supabase
      .from('personnel')
      .select('id')
      .eq('main_position', workerRow.main_position)
      .neq('id', params.personnelId);
    peerIds = (posPeers || []).map((p: any) => p.id);
  }

  const targetIds = [params.personnelId, ...peerIds];
  const { data: overlappingLeaves, error } = await supabase
    .from('leaves')
    .select('personnel_id, start_date, end_date, type, status, reason')
    .in('personnel_id', targetIds)
    .in('status', ['pending', 'approved'])
    .lte('start_date', maxDate)
    .gte('end_date', minDate);

  if (error) {
    return { available: false, occupiedDates: [], error: error.message };
  }

  const occupiedSet = new Set<string>();
  for (const leave of overlappingLeaves || []) {
    const isSelf = leave.personnel_id === params.personnelId;
    const isQuotaLeave =
      leave.type === 'vacation' ||
      (leave.type === 'other' && leave.reason === FREE_DAY_REQUEST_REASON);
    if (!isSelf && !isQuotaLeave) continue;

    for (const d of uniqueDates) {
      if (leave.start_date <= d && leave.end_date >= d) {
        occupiedSet.add(d);
      }
    }
  }

  const occupiedDates = Array.from(occupiedSet).sort();
  return { available: occupiedDates.length === 0, occupiedDates };
}

export async function requestFreeDays(
  personnelId: string,
  dates: string[],
  testHooks?: { supabase?: any; session?: any; now?: Date }
) {
  const isIsolatedTest = process.env.ROSTER_ISOLATED_TEST === 'true' && Boolean(testHooks?.supabase);
  const session = isIsolatedTest ? testHooks?.session : await getWorkerSession();
  if (!session?.id) {
    return { success: false, error: 'Usuario no autenticado.' };
  }
  if (personnelId !== session.id) {
    return { success: false, error: 'No autorizado para solicitar días libres para otro trabajador.' };
  }

  if (!dates || dates.length === 0) return { success: true };

  const supabase: any = isIsolatedTest ? testHooks!.supabase : createAdminClient();
  const nowIso = (testHooks?.now || new Date()).toISOString();

  const { data: rpcRes, error: rpcErr } = await supabase.rpc('submit_worker_leave_request_tx', {
    p_personnel_id: session.id,
    p_kind: 'free_day',
    p_dates: dates,
    p_start_date: null,
    p_end_date: null,
    p_now: nowIso,
  });

  if (rpcErr) {
    return { success: false, error: rpcErr.message };
  }

  if (!rpcRes?.ok) {
    return {
      success: false,
      code: rpcRes?.code,
      occupiedDates: (rpcRes?.occupied_dates as string[] | undefined) || [],
      closedDates: (rpcRes?.closed_dates as string[] | undefined) || [],
      error: rpcRes?.error || 'No se pudo registrar la solicitud de días libres.',
    };
  }

  safeRevalidateWorkerPaths();
  return { success: true, ids: rpcRes.ids || [] };
}

export async function requestVacation(
  params: { personnelId: string; startDate: string; endDate: string },
  testHooks?: { supabase?: any; session?: any; now?: Date }
) {
  const isIsolatedTest = process.env.ROSTER_ISOLATED_TEST === 'true' && Boolean(testHooks?.supabase);
  const session = isIsolatedTest ? testHooks?.session : await getWorkerSession();
  if (!session?.id) {
    return { success: false, error: 'Usuario no autenticado.' };
  }
  if (params.personnelId !== session.id) {
    return { success: false, error: 'No autorizado para solicitar vacaciones para otro trabajador.' };
  }

  if (!params.startDate || !params.endDate || params.startDate > params.endDate) {
    return { success: false, error: 'Selecciona un rango válido de primer y último día.' };
  }

  const supabase: any = isIsolatedTest ? testHooks!.supabase : createAdminClient();
  const nowIso = (testHooks?.now || new Date()).toISOString();

  const { data: rpcRes, error: rpcErr } = await supabase.rpc('submit_worker_leave_request_tx', {
    p_personnel_id: session.id,
    p_kind: 'vacation',
    p_dates: null,
    p_start_date: params.startDate,
    p_end_date: params.endDate,
    p_now: nowIso,
  });

  if (rpcErr) {
    return { success: false, error: rpcErr.message };
  }

  if (!rpcRes?.ok) {
    return {
      success: false,
      code: rpcRes?.code,
      occupiedDates: (rpcRes?.occupied_dates as string[] | undefined) || [],
      closedDates: (rpcRes?.closed_dates as string[] | undefined) || [],
      error: rpcRes?.error || 'No se pudo registrar la solicitud de vacaciones.',
    };
  }

  safeRevalidateWorkerPaths();
  return {
    success: true,
    ids: rpcRes.ids || [],
    message: VACATION_SUCCESS_MESSAGE,
  };
}

export async function getWorkerPortalRequests(
  personnelId: string,
  testHooks?: { supabase?: any; session?: any }
) {
  const isIsolatedTest = process.env.ROSTER_ISOLATED_TEST === 'true' && Boolean(testHooks?.supabase);
  const session = isIsolatedTest ? testHooks?.session : await getWorkerSession();
  if (!session?.id || personnelId !== session.id) {
    return { data: [], error: 'No autorizado' };
  }

  const supabase: any = isIsolatedTest ? testHooks!.supabase : createAdminClient();
  const { data, error } = await supabase
    .from('leaves')
    .select('*')
    .eq('personnel_id', personnelId)
    .in('type', ['vacation', 'other'])
    .order('start_date', { ascending: true });

  const filtered = (data || []).filter(
    (l: any) => l.type === 'vacation' || (l.type === 'other' && l.reason === FREE_DAY_REQUEST_REASON)
  );

  return { data: filtered, error: error?.message };
}

export async function getWorkerFreeRequests(personnelId: string) {
  const res = await getWorkerPortalRequests(personnelId);
  return {
    data: (res.data || []).filter((l: any) => l.type === 'other' && l.reason === FREE_DAY_REQUEST_REASON),
    error: res.error,
  };
}

export async function deleteWorkerLeave(
  leaveId: string,
  testHooks?: { supabase?: any; session?: any }
) {
  const isIsolatedTest = process.env.ROSTER_ISOLATED_TEST === 'true' && Boolean(testHooks?.supabase);
  const session = isIsolatedTest ? testHooks?.session : await getWorkerSession();
  if (!session?.id) {
    return { success: false, error: 'Usuario no autenticado.' };
  }

  const supabase: any = isIsolatedTest ? testHooks!.supabase : createAdminClient();
  const { data: existing } = await supabase
    .from('leaves')
    .select('id, personnel_id, status, type, reason')
    .eq('id', leaveId)
    .eq('personnel_id', session.id)
    .maybeSingle();

  if (!existing) {
    return { success: false, error: 'Solicitud no encontrada.' };
  }
  if (existing.status !== 'pending') {
    return { success: false, error: 'Solo puedes cancelar solicitudes pendientes de revisión.' };
  }
  if (existing.type !== 'vacation' && existing.reason !== FREE_DAY_REQUEST_REASON) {
    return { success: false, error: 'Esta solicitud no puede cancelarse desde el portal.' };
  }

  const { error } = await supabase
    .from('leaves')
    .delete()
    .eq('id', leaveId)
    .eq('personnel_id', session.id)
    .eq('status', 'pending');

  if (error) return { success: false, error: error.message };
  safeRevalidateWorkerPaths();
  return { success: true };
}

export async function getWorkerPendingDocuments(
  testHooks?: { supabase?: any; session?: any; now?: Date }
) {
  const isIsolatedTest = process.env.ROSTER_ISOLATED_TEST === 'true' && Boolean(testHooks?.supabase);
  const session = isIsolatedTest ? testHooks?.session : await getWorkerSession();
  if (!session?.id) return { items: [] };

  let definitions: any[] = [];
  let existingDocuments: any[] = [];

  if (isIsolatedTest) {
    const supabase = testHooks!.supabase;
    const positionIds: string[] = [];
    if (session.main_position) positionIds.push(session.main_position);
    if (Array.isArray(session.secondary_positions)) positionIds.push(...session.secondary_positions);

    const [{ data: allDefs }, { data: docs }] = await Promise.all([
      supabase.from('document_definitions').select('*').eq('is_active', true),
      supabase.from('documents').select('*').eq('personnel_id', session.id),
    ]);
    definitions = (allDefs || []).filter((def: any) => {
      const applicable: string[] = def.applicable_positions || [];
      if (applicable.length === 0) return true;
      return applicable.some((p: string) => positionIds.includes(p));
    });
    existingDocuments = docs || [];
  } else {
    [definitions, existingDocuments] = await Promise.all([
      getActiveDocumentDefinitions(),
      getWorkerDocuments(),
    ]);
  }

  const todayStr = getSantiagoDateString(testHooks?.now || new Date());
  const items = evaluateWorkerPendingDocuments({
    definitions,
    existingDocuments,
    todayStr,
  });

  return { items };
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

const STANDARD_CLOTHING_FIELDS = [
  'clothing_tshirt_size',
  'clothing_polar_size',
  'clothing_pants_size_letter',
  'clothing_pants_size_number',
  'clothing_shoe_size',
  'clothing_parka_size',
  'clothing_overall_size',
] as const;

export interface WorkerSizeRequirementItem {
  sizeField: string;
  productName: string;
  sizeType: 'LETTER' | 'NUMBER' | 'SHOE';
  isCustom: boolean;
  currentValue: string | null;
  isMissing: boolean;
}

export interface WorkerSizeRequirementsResult {
  hasPosition: boolean;
  requiredFields: WorkerSizeRequirementItem[];
  missingFields: WorkerSizeRequirementItem[];
  hasMissingSizes: boolean;
}

export async function getWorkerSizeRequirements(): Promise<WorkerSizeRequirementsResult> {
  const session = await getWorkerSession();
  if (!session || !session.main_position) {
    return {
      hasPosition: Boolean(session?.main_position),
      requiredFields: [],
      missingFields: [],
      hasMissingSizes: false,
    };
  }

  const adminClient = createAdminClient();
  const [reqsRes, catalogRes] = await Promise.all([
    adminClient
      .from('epp_position_requirements')
      .select('product_name, size_field, quantity')
      .eq('position_id', session.main_position)
      .gt('quantity', 0),
    adminClient
      .from('epp_product_catalog')
      .select('name, uses_sizes, size_field, size_type')
      .eq('is_active', true),
  ]);

  const requirements = reqsRes.data || [];
  const catalog = catalogRes.data || [];

  const catalogBySizeField = new Map<string, any>();
  const catalogByName = new Map<string, any>();
  for (const item of catalog) {
    if (item.size_field) {
      catalogBySizeField.set(item.size_field, item);
    }
    if (item.name) {
      catalogByName.set(item.name.trim().toLowerCase(), item);
    }
  }

  const customSizes = (session.custom_clothing_sizes as Record<string, string> | null) || {};
  const seenFields = new Set<string>();
  const requiredFields: WorkerSizeRequirementItem[] = [];

  for (const req of requirements) {
    const byName = req.product_name ? catalogByName.get(String(req.product_name).trim().toLowerCase()) : null;
    const sizeField: string | null = req.size_field || byName?.size_field || null;
    if (!sizeField) continue;

    const isAllowedField =
      (STANDARD_CLOTHING_FIELDS as readonly string[]).includes(sizeField) ||
      sizeField.startsWith('clothing_custom_');
    if (!isAllowedField || seenFields.has(sizeField)) continue;

    const catItem = catalogBySizeField.get(sizeField) || byName;
    if (catItem && catItem.uses_sizes === false) continue;

    seenFields.add(sizeField);
    const isCustom = sizeField.startsWith('clothing_custom_');
    const rawVal = isCustom ? customSizes[sizeField] : session[sizeField];
    const currentValue = typeof rawVal === 'string' && rawVal.trim() !== '' ? rawVal.trim().toUpperCase() : null;

    let sizeType: 'LETTER' | 'NUMBER' | 'SHOE' = 'LETTER';
    if (catItem?.size_type === 'NUMBER' || catItem?.size_type === 'SHOE' || catItem?.size_type === 'LETTER') {
      sizeType = catItem.size_type;
    } else if (sizeField === 'clothing_shoe_size') {
      sizeType = 'SHOE';
    } else if (sizeField === 'clothing_pants_size_number') {
      sizeType = 'NUMBER';
    }

    requiredFields.push({
      sizeField,
      productName: catItem?.name || req.product_name || sizeField,
      sizeType,
      isCustom,
      currentValue,
      isMissing: !currentValue,
    });
  }

  const missingFields = requiredFields.filter(f => f.isMissing);
  return {
    hasPosition: true,
    requiredFields,
    missingFields,
    hasMissingSizes: missingFields.length > 0,
  };
}

const ALLOWED_LETTER_SIZES = new Set(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '3XL', '4XL']);
const ALLOWED_PANTS_NUMBER_SIZES = new Set(['36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56', '58', '60']);
const ALLOWED_SHOE_SIZES = new Set(['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48']);

function isValidSizeForType(value: string, sizeType: 'LETTER' | 'NUMBER' | 'SHOE'): boolean {
  if (sizeType === 'NUMBER') return ALLOWED_PANTS_NUMBER_SIZES.has(value);
  if (sizeType === 'SHOE') return ALLOWED_SHOE_SIZES.has(value);
  return ALLOWED_LETTER_SIZES.has(value);
}

export async function updateOwnWorkerClothingSizes(
  sizes: Record<string, string | null | undefined>
): Promise<{ success: boolean; error: string | null }> {
  const session = await getWorkerSession();
  if (!session) return { success: false, error: 'No hay sesión activa' };

  if (!sizes || typeof sizes !== 'object' || Array.isArray(sizes)) {
    return { success: false, error: 'Formato de tallas inválido' };
  }

  const adminClient = createAdminClient();
  const updateData: Record<string, any> = {};
  const existingCustom = { ...((session.custom_clothing_sizes as Record<string, string> | null) || {}) };
  let hasCustomChanges = false;

  const customKeys = Object.keys(sizes).filter(k => k.startsWith('clothing_custom_'));
  const customTypeMap = new Map<string, 'LETTER' | 'NUMBER' | 'SHOE'>();
  if (customKeys.length > 0) {
    const { data: catalogItems } = await adminClient
      .from('epp_product_catalog')
      .select('size_field, size_type')
      .eq('is_active', true)
      .in('size_field', customKeys);
    for (const item of catalogItems || []) {
      if (item.size_field && (item.size_type === 'NUMBER' || item.size_type === 'SHOE' || item.size_type === 'LETTER')) {
        customTypeMap.set(item.size_field, item.size_type);
      }
    }
  }

  for (const [key, val] of Object.entries(sizes)) {
    if (val !== null && val !== undefined && typeof val !== 'string') {
      return { success: false, error: `Valor malformado para ${key}` };
    }

    const isStandard = (STANDARD_CLOTHING_FIELDS as readonly string[]).includes(key);
    const isCustom = /^clothing_custom_[a-zA-Z0-9_]+$/.test(key);
    if (!isStandard && !isCustom) {
      return { success: false, error: `Campo de talla no permitido: ${key}` };
    }

    const cleanVal = typeof val === 'string' && val.trim() !== '' ? val.trim().toUpperCase() : null;
    if (cleanVal) {
      let expectedType: 'LETTER' | 'NUMBER' | 'SHOE' = 'LETTER';
      if (key === 'clothing_shoe_size') expectedType = 'SHOE';
      else if (key === 'clothing_pants_size_number') expectedType = 'NUMBER';
      else if (isCustom) expectedType = customTypeMap.get(key) || 'LETTER';

      if (!isValidSizeForType(cleanVal, expectedType)) {
        return { success: false, error: `Talla inválida para ${key}: ${cleanVal}` };
      }
    }

    if (isStandard) {
      updateData[key] = cleanVal;
    } else if (isCustom) {
      hasCustomChanges = true;
      if (cleanVal) {
        existingCustom[key] = cleanVal;
      } else {
        delete existingCustom[key];
      }
    }
  }

  if (hasCustomChanges) {
    updateData.custom_clothing_sizes = existingCustom;
  }

  if (Object.keys(updateData).length === 0) {
    return { success: false, error: 'No se enviaron tallas válidas para actualizar' };
  }

  const { error } = await adminClient
    .from('personnel')
    .update(updateData)
    .eq('id', session.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/worker');
  revalidatePath('/worker/profile');
  revalidatePath('/epp');
  revalidatePath('/personnel');
  return { success: true, error: null };
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

  const existingCustom = { ...((session.custom_clothing_sizes as Record<string, string> | null) || {}) };
  let customUpdated = false;
  for (const [key, val] of Object.entries(formData)) {
    if (key.startsWith('clothing_custom_')) {
      customUpdated = true;
      const cleanVal = typeof val === 'string' && val.trim() !== '' ? val.trim().toUpperCase() : null;
      if (cleanVal) {
        existingCustom[key] = cleanVal;
      } else {
        delete existingCustom[key];
      }
    }
  }
  if (customUpdated) {
    updatePayload.custom_clothing_sizes = existingCustom;
  }

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
    const doc = existingDocuments.find(d => 
      d.definition_id === def.id || 
      (d.type || '').toLowerCase().trim() === (def.name || '').toLowerCase().trim()
    );
    
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
    const defNameLower = (def.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const pcpDef = definitions.find((d: any) => (d.name || '').toLowerCase().includes('pcp'));
    const ticaDef = definitions.find((d: any) => (d.name || '').toLowerCase().includes('tica'));

    let targetAnchorDefId = def.depends_on_definition_id;
    if (defNameLower.includes('hoja de vida') && pcpDef) {
      targetAnchorDefId = pcpDef.id;
    } else if (defNameLower.includes('antecedentes') && ticaDef) {
      targetAnchorDefId = ticaDef.id;
    }

    if (targetAnchorDefId) {
      const anchorDef = definitions.find(d => d.id === targetAnchorDefId);
      const anchorDoc = existingDocuments.find(d => 
        d.definition_id === targetAnchorDefId ||
        (anchorDef && (d.type || '').toLowerCase().trim() === (anchorDef.name || '').toLowerCase().trim())
      );
      if (anchorDoc?.expiration_date) {
        const calcDate = calculateDynamicExpiration(
          new Date(anchorDoc.expiration_date + 'T12:00:00'),
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

