'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { generateSchedule, partialRecalculate } from '@/lib/scheduler';
import type { RecalculationInput } from '@/lib/scheduler/types';
import { parseISO, format, endOfWeek, startOfWeek, isAfter, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';
import { sendWhatsAppMessage } from '@/lib/ultramsg';
import { es as esLocale } from 'date-fns/locale';


// ─── Auth Helpers ─────────────────────────────────────────────────────────────

async function isAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
    
  return profile?.role === 'ADMIN';
}

async function getCurrentUserId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

// ─── Shift CRUD ───────────────────────────────────────────────────────────────

// Helper: calculate shift duration in hours (handles overnight shifts crossing midnight)
// Subtracts 1 hour for mandatory lunch break (colación)
function calcDurationHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;
  if (endMins <= startMins) endMins += 24 * 60; // crosses midnight
  const rawHours = (endMins - startMins) / 60;
  return Math.round((rawHours - 1) * 10) / 10; // -1h colación
}

export async function createShift(formData: FormData) {
  const supabase = await createClient();
  const geovRaw = formData.get('geov');
  const startTime = formData.get('start_time') as string;
  const endTime = formData.get('end_time') as string;

  const shiftData = {
    name: formData.get('name') as string,
    start_time: startTime,
    end_time: endTime,
    duration_hours: calcDurationHours(startTime, endTime),
    requires_transport: formData.get('requires_transport') === 'true',
    geov: geovRaw ? parseFloat(geovRaw as string) : null,
    company_id: null,
  };

  const { error } = await supabase.from('shifts').insert(shiftData);
  if (error) return { success: false, error: error.message };

  revalidatePath('/shifts');
  return { success: true, error: null };
}

export async function updateShift(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get('id') as string;
  const geovRaw = formData.get('geov');
  const startTime = formData.get('start_time') as string;
  const endTime = formData.get('end_time') as string;

  const updateData: any = {
    name: formData.get('name') as string,
    start_time: startTime,
    end_time: endTime,
    duration_hours: calcDurationHours(startTime, endTime),
    requires_transport: formData.get('requires_transport') === 'true',
    geov: geovRaw ? parseFloat(geovRaw as string) : null,
  };

  const { error } = await supabase.from('shifts').update(updateData).eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/shifts');
  return { success: true, error: null };
}

export async function listShifts(companyId?: string) {
  const supabase = await createClient();
  let query = supabase.from('shifts').select('*').order('start_time');
  if (companyId) {
    query = query.or(`company_id.eq.${companyId},company_id.is.null`);
  }
  const { data, error } = await query;
  return { data: data || [], error: error?.message || null };
}

export async function deleteShift(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('shifts').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/shifts');
  return { success: true, error: null };
}

// ─── Area CRUD ────────────────────────────────────────────────────────────────

export async function createArea(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from('areas').insert({
    name: formData.get('name') as string,
    company_id: formData.get('company_id') as string,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath('/shifts/areas');
  return { success: true, error: null };
}

export async function listAreas() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('areas').select('*, positions(*)').order('name');
  return { data: data || [], error: error?.message || null };
}

// ─── Position CRUD ────────────────────────────────────────────────────────────

export async function createPosition(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from('positions').insert({
    area_id: formData.get('area_id') as string,
    name: formData.get('name') as string,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath('/shifts/areas');
  return { success: true, error: null };
}

export async function deletePosition(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('positions').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/shifts/areas');
  return { success: true, error: null };
}

export async function deleteArea(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('areas').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/shifts/areas');
  return { success: true, error: null };
}

// ─── Requirements ─────────────────────────────────────────────────────────────

export async function createRequirement(formData: FormData) {
  const supabase = await createClient();
  
  const startDateStr = formData.get('start_date') as string;
  const endDateStr = formData.get('end_date') as string;
  const daysOfWeekRaw = formData.getAll('days_of_week');
  const shiftId = formData.get('shift_id') as string;
  const areaId = formData.get('area_id') as string;
  const positionId = formData.get('position_id') as string;
  const requiredCount = parseInt(formData.get('required_count') as string, 10);

  const allowedDays = daysOfWeekRaw.map(v => Number(v));
  
  const start = new Date(startDateStr + 'T00:00:00');
  const end = new Date(endDateStr + 'T00:00:00');
  
  const inserts = [];
  const currentDate = new Date(start);

  while (currentDate <= end) {
    // 0 = Sunday, 1 = Monday ... 6 = Saturday
    if (allowedDays.includes(currentDate.getDay())) {
      inserts.push({
        date: currentDate.toISOString().split('T')[0],
        shift_id: shiftId,
        area_id: areaId,
        position_id: positionId,
        required_count: requiredCount,
      });
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from('shift_requirements').insert(inserts);
    if (error) return { success: false, error: error.message };
  }

  revalidatePath('/shifts/requirements');
  return { success: true, error: null };
}

export async function deleteRequirement(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('shift_requirements').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/shifts/requirements');
  return { success: true, error: null };
}

export async function listRequirements(startDate?: string, endDate?: string) {
  const supabase = await createClient();
  let query = supabase
    .from('shift_requirements')
    .select('*, shift:shifts(name, start_time, end_time), area:areas(name), position:positions(name)')
    .order('date', { ascending: true });

  if (startDate && endDate) {
    query = query.gte('date', startDate).lte('date', endDate);
  } else if (startDate) {
    query = query.eq('date', startDate);
  } else {
    // Default to current month to keep page light
    const start = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const end = format(endOfMonth(new Date()), 'yyyy-MM-dd');
    query = query.gte('date', start).lte('date', end);
  }

  const { data, error } = await query;
  return { data: data || [], error: error?.message || null };
}

// ─── Requirement Templates (Reglas Permanentes) ───────────────────────────────

export async function createTemplate(formData: FormData) {
  const supabase = await createClient();
  const days = formData.getAll('days_of_week').map(Number);
  const { error } = await supabase.from('requirement_templates').insert({
    area_id: formData.get('area_id') as string,
    position_id: formData.get('position_id') as string,
    shift_id: formData.get('shift_id') as string,
    required_count: parseInt(formData.get('required_count') as string),
    days_of_week: days,
  });
  
  if (error) return { success: false, error: error.message };
  revalidatePath('/shifts/dotacion');
  return { success: true, error: null };
}

export async function listTemplates() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('requirement_templates')
    .select('*, area:areas(name), position:positions(name), shift:shifts(name)');
  if (error) return { data: [], error: error.message };
  return { data, error: null };
}

export async function deleteTemplate(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('requirement_templates').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/shifts/dotacion');
  return { success: true, error: null };
}

export async function updateTemplate(id: string, formData: FormData) {
  const supabase = await createClient();
  const days = formData.getAll('days_of_week').map(Number);
  const { error } = await supabase.from('requirement_templates').update({
    area_id: formData.get('area_id') as string,
    position_id: formData.get('position_id') as string,
    shift_id: formData.get('shift_id') as string,
    required_count: parseInt(formData.get('required_count') as string),
    days_of_week: days,
  }).eq('id', id);
  
  if (error) return { success: false, error: error.message };
  revalidatePath('/shifts/dotacion');
  return { success: true, error: null };
}

export async function materializeTemplates(startDate: string, endDate: string) {
  const supabase = await createClient();
  
  // 1. Obtener todas las reglas
  const { data: templates, error: tError } = await supabase.from('requirement_templates').select('*');
  if (tError) return { success: false, error: tError.message };
  if (!templates || templates.length === 0) return { success: true, error: null, count: 0 };

  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const days = eachDayOfInterval({ start, end });
  
  // Usar un mapa para agrupar y sumar requerimientos que coincidan en la misma clave
  const groupedInserts = new Map<string, any>();

  // 2. Generar requerimientos día por día basados en las reglas
  for (const day of days) {
    const dayOfWeek = getDay(day); 
    const normalizedDay = dayOfWeek === 0 ? 0 : dayOfWeek; // 0=Dom, 1=Lun en requirements-client

    const dateStr = format(day, 'yyyy-MM-dd');

    for (const template of templates) {
      if (template.days_of_week.includes(normalizedDay)) {
        const key = `${template.area_id}-${template.position_id}-${template.shift_id}-${dateStr}`;
        
        if (groupedInserts.has(key)) {
          // Si ya existe, sumamos la dotación
          groupedInserts.get(key).required_count += template.required_count;
        } else {
          // Si es nuevo, lo añadimos
          groupedInserts.set(key, {
            area_id: template.area_id,
            position_id: template.position_id,
            shift_id: template.shift_id,
            required_count: template.required_count,
            date: dateStr,
            is_extra: false
          });
        }
      }
    }
  }

  const inserts = Array.from(groupedInserts.values());

  if (inserts.length > 0) {
    const { error: iError } = await supabase.from('shift_requirements').upsert(inserts, {
       onConflict: 'area_id,position_id,shift_id,date,is_extra'
    });
    if (iError) return { success: false, error: iError.message };
  }

  revalidatePath('/shifts/dotacion');
  revalidatePath('/shifts/requirements');
  revalidatePath('/shifts/daily');
  return { success: true, error: null, count: inserts.length };
}

// ─── Assignments ──────────────────────────────────────────────────────────────

export async function listAssignments(startDate: string, endDate: string, areaId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from('shift_assignments')
    .select('*, personnel:personnel(first_name, last_name_father), shift:shifts!shift_assignments_shift_id_fkey(name, start_time, end_time), area:areas(name), position:positions(name)')
    .gte('date', startDate)
    .lte('date', endDate)
    .eq('is_extra', false)
    .order('date', { ascending: true });
  if (areaId) query = query.eq('area_id', areaId);
  const { data, error } = await query;
  return { data: data || [], error: error?.message || null };
}

export async function validatePersonnelAvailabilityForDates(
  personnelId: string,
  dates: string[]
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();

  const { data: personnel, error: pErr } = await supabase
    .from('personnel')
    .select('first_name, last_name_father, is_active, termination_date')
    .eq('id', personnelId)
    .single();

  if (pErr || !personnel) {
    return { success: false, error: 'Trabajador no encontrado' };
  }

  const fullName = `${personnel.first_name} ${personnel.last_name_father}`;

  if (!personnel.is_active) {
    return { 
      success: false, 
      error: `El trabajador ${fullName} está inactivo y no puede ser asignado.` 
    };
  }

  if (personnel.termination_date) {
    for (const date of dates) {
      if (date > personnel.termination_date) {
        return { 
          success: false, 
          error: `El trabajador ${fullName} está de baja desde el ${personnel.termination_date} y no puede ser asignado el ${date}.` 
        };
      }
    }
  }

  const { data: leaves, error: lErr } = await supabase
    .from('leaves')
    .select('start_date, end_date, type')
    .eq('personnel_id', personnelId)
    .eq('status', 'approved');

  if (lErr) {
    return { success: false, error: 'Error al consultar licencias/vacaciones' };
  }

  if (leaves && leaves.length > 0) {
    for (const date of dates) {
      for (const leave of leaves) {
        if (date >= leave.start_date && date <= leave.end_date) {
          const leaveTypeLabel = leave.type === 'sick' ? 'licencia médica' : 'vacaciones';
          return {
            success: false,
            error: `El trabajador ${fullName} tiene ${leaveTypeLabel} aprobada del ${leave.start_date} al ${leave.end_date} y no puede ser asignado el ${date}.`
          };
        }
      }
    }
  }

  return { success: true, error: null };
}

export async function createManualAssignment(formData: FormData) {
  const supabase = await createClient();
  const personnelId = formData.get('personnel_id') as string;
  const shiftId = formData.get('shift_id') as string;
  const areaId = formData.get('area_id') as string;
  const positionId = formData.get('position_id') as string;
  const dateInput = formData.get('date') as string;

  // Support multiple dates if comma separated (from multi-selection)
  const dates = dateInput.includes(',') ? dateInput.split(',') : [dateInput];

  // Validate personnel availability
  const validation = await validatePersonnelAvailabilityForDates(personnelId, dates);
  if (!validation.success) {
    return { success: false, error: validation.error };
  }

  // Get current user ID for audit logging
  const userId = await getCurrentUserId();

  // Fetch existing assignments for these dates (excluding extra shifts) to compare and update
  const { data: existingAssignments, error: fetchError } = await supabase
    .from('shift_assignments')
    .select('id, date, shift_id, is_validated, is_published')
    .eq('personnel_id', personnelId)
    .in('date', dates)
    .eq('is_extra', false);

  if (fetchError) return { success: false, error: fetchError.message };

  // Group existing assignments by date (handling any duplicates to self-heal)
  const existingByDate = new Map<string, any[]>();
  if (existingAssignments) {
    for (const asg of existingAssignments) {
      const list = existingByDate.get(asg.date) || [];
      list.push(asg);
      existingByDate.set(asg.date, list);
    }
  }

  for (const date of dates) {
    const list = existingByDate.get(date) || [];
    let existing = list[0] || null;

    // Self-heal duplicates: if multiple assignments exist for this date, keep the first and delete the rest
    if (list.length > 1) {
      const duplicateIds = list.slice(1).map(a => a.id);
      const { error: delError } = await supabase
        .from('shift_assignments')
        .delete()
        .in('id', duplicateIds);
      if (delError) {
        console.error('[createManualAssignment] Error deleting duplicates:', delError.message);
      }
    }

    // Heuristic: Check if the roster for this date has already been published for others
    const { data: publishedOnDate } = await supabase
      .from('shift_assignments')
      .select('id')
      .eq('date', date)
      .eq('is_published', true)
      .limit(1);
    
    const isRosterPublished = (publishedOnDate && publishedOnDate.length > 0) || false;

    if (existing) {
      // If the shift is not changing, we can skip or just update area/position without logging
      if (existing.shift_id === shiftId) {
        const { error: updateError } = await supabase
          .from('shift_assignments')
          .update({
            area_id: areaId,
            position_id: positionId,
            status: 'scheduled',
            is_manual: true,
            is_validated: false,
            is_published: false
          })
          .eq('id', existing.id);
        if (updateError) return { success: false, error: updateError.message };
        continue;
      }

      // Log audit trail BEFORE updating the assignment.
      // Always log when the shift actually changes so that publishAssignments
      // can detect the change and send WhatsApp notifications regardless of
      // whether the assignment was previously validated or published.
      // Non-fatal: if roster_audit_logs table doesn't exist yet, we continue.
      try {
        await supabase.from('roster_audit_logs').insert({
          assignment_id: existing.id,
          personnel_id: personnelId,
          date: date,
          previous_shift_id: existing.shift_id,
          new_shift_id: shiftId,
          reason: (formData.get('reason') as string) || 'Cambio manual',
          changed_by: userId
        });
      } catch (auditErr) {
        console.warn('[createManualAssignment] Could not insert audit log (table may not exist yet):', auditErr);
      }

      // Update the existing assignment record
      const { error: updateError } = await supabase
        .from('shift_assignments')
        .update({
          shift_id: shiftId,
          area_id: areaId,
          position_id: positionId,
          status: 'scheduled',
          is_manual: true,
          is_validated: false,
          is_published: false
        })
        .eq('id', existing.id);

      if (updateError) return { success: false, error: updateError.message };

    } else {
      // If no existing assignment on this date, insert a new record
      const { data: newAsg, error: insertError } = await supabase
        .from('shift_assignments')
        .insert({
          personnel_id: personnelId,
          shift_id: shiftId,
          date: date,
          area_id: areaId,
          position_id: positionId,
          status: 'scheduled',
          is_manual: true,
          is_extra: false
        })
        .select()
        .single();

      if (insertError) return { success: false, error: insertError.message };

      // Always log the insertion (Libre → new shift) so publishAssignments
      // can detect new assignments and send WhatsApp notifications.
      // Non-fatal: if roster_audit_logs table doesn't exist yet, we continue.
      try {
        await supabase.from('roster_audit_logs').insert({
          assignment_id: newAsg.id,
          personnel_id: personnelId,
          date: date,
          previous_shift_id: null,
          new_shift_id: shiftId,
          reason: (formData.get('reason') as string) || 'Asignación manual',
          changed_by: userId
        });
      } catch (auditErr) {
        console.warn('[createManualAssignment] Could not insert audit log (table may not exist yet):', auditErr);
      }
    }
  }

  revalidatePath('/shifts/assignments');
  revalidatePath('/shifts/roster');
  revalidatePath('/shifts/daily');
  return { success: true, error: null };
}

export async function validateAssignments(assignmentIds: string[]) {
  if (!await isAdmin()) return { success: false, error: 'No autorizado' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('shift_assignments')
    .update({ is_validated: true })
    .in('id', assignmentIds);
  revalidatePath('/shifts/roster');
  revalidatePath('/shifts/daily');
  return { success: !error, error: error?.message };
}

export async function publishAssignments(input: string | string[], endDate?: string, areaId?: string) {
  if (!await isAdmin()) return { success: false, error: 'No authorized' };
  const supabase = await createClient();
  
  // 1. Fetch assignments that are about to be published (were not published before)
  let selectQuery = supabase
    .from('shift_assignments')
    .select('id, date, personnel_id, shift_id, area_id, position_id')
    .eq('is_published', false);

  if (Array.isArray(input)) {
    selectQuery = selectQuery.in('id', input);
  } else if (typeof input === 'string' && endDate) {
    selectQuery = selectQuery.gte('date', input).lte('date', endDate);
    if (areaId) selectQuery = selectQuery.eq('area_id', areaId);
  } else {
    return { success: false, error: 'Parámetros inválidos' };
  }

  const { data: assignmentsToPublish, error: selectError } = await selectQuery;
  if (selectError) {
    console.error('[publishAssignments] Error fetching assignments to publish:', selectError.message);
  }

  // 2. Perform the update
  let query = supabase.from('shift_assignments').update({ is_published: true });
  
  if (Array.isArray(input)) {
    query = query.in('id', input);
  } else if (typeof input === 'string' && endDate) {
    query = query.gte('date', input).lte('date', endDate);
    if (areaId) query = query.eq('area_id', areaId);
  }

  const { error } = await query;
  if (error) {
    return { success: false, error: error.message };
  }

  // 3. Trigger WhatsApp notifications for actual shift changes
  const notifiedWorkers: string[] = [];
  const skippedWorkers: string[] = [];  // no phone number
  const failedWorkers: string[] = [];   // API error

  if (assignmentsToPublish && assignmentsToPublish.length > 0) {
    try {
      const personnelIds = [...new Set(assignmentsToPublish.map(a => a.personnel_id))];
      const dates = [...new Set(assignmentsToPublish.map(a => a.date))];
      
      // Fetch all audit logs for these personnel and dates (ordered by newest first)
      const { data: auditLogs, error: auditError } = await supabase
        .from('roster_audit_logs')
        .select('*')
        .in('personnel_id', personnelIds)
        .in('date', dates)
        .order('created_at', { ascending: false });

      if (auditError) {
        console.warn('[publishAssignments] roster_audit_logs unavailable:', auditError.message);
      }

      // Map latest audit log for each personnel + date combination
      const latestAuditMap = new Map<string, any>();
      if (auditLogs) {
        for (const log of auditLogs) {
          const key = `${log.personnel_id}_${log.date}`;
          if (!latestAuditMap.has(key)) {
            latestAuditMap.set(key, log);
          }
        }
      }

      // Decide which assignments to notify:
      // PRIMARY:  assignments with a matching audit log (shows old → new shift)
      // FALLBACK: if no audit logs available (table missing), notify all is_manual=true
      let changedAssignments: typeof assignmentsToPublish;

      if (latestAuditMap.size > 0) {
        // Primary path: only assignments that actually changed shift
        changedAssignments = assignmentsToPublish.filter(a => {
          const key = `${a.personnel_id}_${a.date}`;
          const log = latestAuditMap.get(key);
          return log && log.previous_shift_id !== a.shift_id;
        });
      } else {
        // Fallback path: audit logs table empty or missing → notify all manual assignments
        const { data: manualFlags } = await supabase
          .from('shift_assignments')
          .select('id, is_manual')
          .in('id', assignmentsToPublish.map(a => a.id));

        const manualSet = new Set(
          (manualFlags || []).filter((r: any) => r.is_manual).map((r: any) => r.id)
        );
        changedAssignments = assignmentsToPublish.filter(a => manualSet.has(a.id));
        if (changedAssignments.length > 0) {
          console.log(`[publishAssignments] Fallback: notifying ${changedAssignments.length} manual assignments (audit_logs unavailable).`);
        }
      }

      if (changedAssignments.length > 0) {
          // Batch fetch required data to avoid N+1 query problems
          const batchPersonnelIds = [...new Set(changedAssignments.map(a => a.personnel_id))];
          const shiftIds = [...new Set([
            ...changedAssignments.map(a => a.shift_id),
            ...changedAssignments.map(a => latestAuditMap.get(`${a.personnel_id}_${a.date}`)?.previous_shift_id).filter(Boolean)
          ])];
          const areaIds = [...new Set(changedAssignments.map(a => a.area_id).filter(Boolean))];
          const positionIds = [...new Set(changedAssignments.map(a => a.position_id).filter(Boolean))];

          const [
            { data: personnelList },
            { data: shiftsList },
            { data: areasList },
            { data: positionsList }
          ] = await Promise.all([
            supabase.from('personnel').select('id, first_name, last_name_father, phone').in('id', batchPersonnelIds),
            supabase.from('shifts').select('id, name, start_time, end_time').in('id', shiftIds),
            supabase.from('areas').select('id, name').in('id', areaIds),
            supabase.from('positions').select('id, name').in('id', positionIds)
          ]);

          const personnelMap = new Map(personnelList?.map(p => [p.id, p]));
          const shiftsMap = new Map(shiftsList?.map(s => [s.id, s]));
          const areasMap = new Map(areasList?.map(a => [a.id, a]));
          const positionsMap = new Map(positionsList?.map(p => [p.id, p]));

          const platformUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hrm-roster-manager.vercel.app';

          // Send notifications via WhatsApp in parallel and collect outcomes
          const results = await Promise.allSettled(changedAssignments.map(async (ass) => {
            const log = latestAuditMap.get(`${ass.personnel_id}_${ass.date}`);

            const person = personnelMap.get(ass.personnel_id);
            const workerName = person ? `${person.first_name} ${person.last_name_father}` : 'Desconocido';

            if (!person || !person.phone) {
              return { type: 'skipped' as const, name: workerName };
            }

            const newShift = shiftsMap.get(ass.shift_id);
            if (!newShift) return { type: 'skipped' as const, name: workerName };

            // Format phone: ensure country code
            let phone = person.phone.replace(/[^\d+]/g, '');
            if (!phone.startsWith('+') && phone.startsWith('56')) phone = '+' + phone;
            // Chilean mobile without country code: 9XXXXXXXX → add +56
            if (!phone.startsWith('+') && phone.length === 9 && phone.startsWith('9')) phone = '+56' + phone;

            const oldShift = log?.previous_shift_id ? shiftsMap.get(log.previous_shift_id) : null;
            const oldShiftStr = oldShift
              ? `${oldShift.name} (${oldShift.start_time.slice(0, 5)} - ${oldShift.end_time.slice(0, 5)})`
              : 'Libre / Sin Turno';

            const areaName = ass.area_id ? (areasMap.get(ass.area_id)?.name || 'No especificada') : 'No especificada';
            const positionName = ass.position_id ? (positionsMap.get(ass.position_id)?.name || 'No especificada') : 'No especificada';

            let formattedDate = ass.date;
            try {
              const parsed = parseISO(ass.date);
              const rawFormat = format(parsed, "EEEE, dd 'de' MMMM", { locale: esLocale });
              formattedDate = rawFormat.charAt(0).toUpperCase() + rawFormat.slice(1);
            } catch (e) {}

            const message = `🔄 *Notificación de Cambio de Turno*\n\n` +
              `Hola *${workerName}*,\n` +
              `Se ha registrado una modificación en tu programación de turnos:\n\n` +
              `📅 *Fecha:* ${formattedDate}\n\n` +
              `* *Turno Anterior:* ${oldShiftStr}\n` +
              `* *Nuevo Turno:* *${(newShift as any).name}* (*${(newShift as any).start_time.slice(0, 5)}* - *${(newShift as any).end_time.slice(0, 5)}*)\n` +
              `📍 *Área:* ${areaName}\n` +
              `💼 *Función:* ${positionName}\n\n` +
              `Por favor, planifica tu jornada considerando esta actualización. Puedes revisar tu planilla completa en la plataforma: ${platformUrl}\n\n` +
              `*Este es un mensaje automático. No lo responda. Si tiene alguna duda comuníquese con su supervisor.*`;

            const res = await sendWhatsAppMessage(phone, message);
            if (res.success) {
              await supabase.from('shift_assignments')
                .update({ whatsapp_notified_at: new Date().toISOString() })
                .eq('id', ass.id);
              return { type: 'sent' as const, name: workerName };
            } else {
              console.error(`[publishAssignments] WhatsApp failed for ${workerName} (${phone}):`, res.error);
              return { type: 'failed' as const, name: workerName, error: res.error };
            }
          }));

          results.forEach(r => {
            if (r.status === 'fulfilled' && r.value) {
              const val = r.value as any;
              if (val.type === 'sent') notifiedWorkers.push(val.name);
              else if (val.type === 'skipped') skippedWorkers.push(val.name);
              else if (val.type === 'failed') failedWorkers.push(val.name);
            } else if (r.status === 'rejected') {
              console.error('[publishAssignments] Unexpected rejection:', r.reason);
            }
          });
        }
    } catch (err) {
      console.error('[publishAssignments] Notification process failed:', err);
    }
  }


  revalidatePath('/shifts/roster');
  revalidatePath('/dashboard');
  revalidatePath('/shifts/daily');
  return { success: true, notifiedWorkers, skippedWorkers, failedWorkers };
}

// ─── Preview: qué trabajadores recibirán notificación (sin enviar) ─────────────
// Úsalo antes de Notificar Hoy para ver exactamente quiénes recibirán mensaje.
export async function previewTodayChangeNotifications(): Promise<{
  success: boolean;
  error?: string;
  workers: Array<{ name: string; date: string; shift: string; alreadyNotified: boolean }>;
}> {
  if (!await isAdmin()) return { success: false, error: 'No autorizado', workers: [] };
  const supabase = await createClient();

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayStart = `${todayStr}T00:00:00`;

  // Primary: audit logs created today
  const { data: todayLogs } = await supabase
    .from('roster_audit_logs')
    .select('personnel_id, date, assignment_id')
    .gte('created_at', todayStart);

  const logAssignmentIds = (todayLogs || []).map((l: any) => l.assignment_id).filter(Boolean);

  // Fallback: manual published assignments for today (union with audit log results)
  const { data: manualToday } = await supabase
    .from('shift_assignments')
    .select('id, date, personnel_id, shift_id, whatsapp_notified_at')
    .eq('is_published', true)
    .eq('is_manual', true)
    .eq('date', todayStr);

  // Combine both sources
  const allIds = new Set<string>([
    ...logAssignmentIds,
    ...(manualToday || []).map((a: any) => a.id),
  ]);

  if (allIds.size === 0) return { success: true, workers: [] };

  const { data: assignments } = await supabase
    .from('shift_assignments')
    .select('id, date, personnel_id, shift_id, whatsapp_notified_at')
    .in('id', [...allIds]);

  const personnelIds = [...new Set((assignments || []).map((a: any) => a.personnel_id))];
  const shiftIds = [...new Set((assignments || []).map((a: any) => a.shift_id))];

  const [{ data: personnelList }, { data: shiftsList }] = await Promise.all([
    supabase.from('personnel').select('id, first_name, last_name_father').in('id', personnelIds),
    supabase.from('shifts').select('id, name').in('id', shiftIds),
  ]);

  const personnelMap = new Map(personnelList?.map((p: any) => [p.id, p]));
  const shiftsMap = new Map(shiftsList?.map((s: any) => [s.id, s]));

  const workers = (assignments || []).map((a: any) => {
    const person = personnelMap.get(a.personnel_id) as any;
    const shift = shiftsMap.get(a.shift_id) as any;
    return {
      name: person ? `${person.first_name} ${person.last_name_father}` : 'Desconocido',
      date: a.date,
      shift: shift?.name || 'N/A',
      alreadyNotified: !!a.whatsapp_notified_at,
    };
  });

  return { success: true, workers };
}

// ─── One-shot: reenviar notificaciones de cambios de hoy ──────────────────────
// Úsalo cuando los cambios se publicaron antes de que el fix de audit_log
// estuviera activo y los trabajadores nunca recibieron WhatsApp.
// Estrategia: usa roster_audit_logs.created_at >= hoy como fuente principal.
// Fallback: asignaciones manuales publicadas para fechas desde hoy sin audit log.
export async function sendTodayChangeNotifications() {
  if (!await isAdmin()) return { success: false, error: 'No autorizado', notifiedWorkers: [] };
  const supabase = await createClient();

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayStart = `${todayStr}T00:00:00`;

  // 1a. Audit logs creados HOY → fuente principal de cambios
  // Non-fatal: if the table doesn’t exist yet, skip to fallback.
  const { data: todayLogs } = await supabase
    .from('roster_audit_logs')
    .select('*')
    .gte('created_at', todayStart)
    .order('created_at', { ascending: false });
  // (errors silently ignored — fallback covers missing table)

  // Build a de-duplicated map: only the latest log per personnel+date
  const latestAuditMap = new Map<string, any>();
  if (todayLogs) {
    for (const log of todayLogs) {
      const key = `${log.personnel_id}_${log.date}`;
      if (!latestAuditMap.has(key)) {
        latestAuditMap.set(key, log);
      }
    }
  }

  // 1b. Fallback: ONLY today's UNnotified manual published assignments
  // Filter by whatsapp_notified_at IS NULL so we NEVER resend to someone
  // who already received the message.
  const { data: manualAssignments } = await supabase
    .from('shift_assignments')
    .select('id, date, personnel_id, shift_id, area_id, position_id')
    .eq('is_published', true)
    .eq('is_manual', true)
    .eq('is_extra', false)
    .eq('date', todayStr)          // Only TODAY — not the whole month
    .is('whatsapp_notified_at', null);  // Only unnotified

  // Merge: include fallback assignments that don't already have an audit log entry from today
  const fallbackAssignments = (manualAssignments || []).filter((a: any) => {
    const key = `${a.personnel_id}_${a.date}`;
    return !latestAuditMap.has(key);
  });

  // Build the unified list of assignments to notify
  // From audit logs: fetch corresponding current assignment
  const logAssignmentIds = Array.from(latestAuditMap.values()).map((l: any) => l.assignment_id).filter(Boolean);
  const { data: logAssignments } = logAssignmentIds.length > 0
    ? await supabase
        .from('shift_assignments')
        .select('id, date, personnel_id, shift_id, area_id, position_id')
        .in('id', logAssignmentIds)
    : { data: [] };

  const changedAssignments: any[] = [
    ...(logAssignments || []),
    ...fallbackAssignments,
  ];

  // De-duplicate by personnel_id + date
  const seen = new Set<string>();
  const uniqueAssignments = changedAssignments.filter((a: any) => {
    const key = `${a.personnel_id}_${a.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (uniqueAssignments.length === 0) {
    return { success: true, notifiedWorkers: [], total: 0 };
  }

  // 2. Batch-fetch reference data
  const personnelIds = [...new Set(uniqueAssignments.map((a: any) => a.personnel_id))];
  const allShiftIds = [...new Set([
    ...uniqueAssignments.map((a: any) => a.shift_id),
    ...Array.from(latestAuditMap.values()).map((l: any) => l.previous_shift_id).filter(Boolean)
  ])];
  const areaIds = [...new Set(uniqueAssignments.map((a: any) => a.area_id).filter(Boolean))];
  const positionIds = [...new Set(uniqueAssignments.map((a: any) => a.position_id).filter(Boolean))];

  const [
    { data: personnelList },
    { data: shiftsList },
    { data: areasList },
    { data: positionsList }
  ] = await Promise.all([
    supabase.from('personnel').select('id, first_name, last_name_father, phone').in('id', personnelIds),
    supabase.from('shifts').select('id, name, start_time, end_time').in('id', allShiftIds),
    supabase.from('areas').select('id, name').in('id', areaIds),
    supabase.from('positions').select('id, name').in('id', positionIds)
  ]);

  const personnelMap = new Map(personnelList?.map((p: any) => [p.id, p]));
  const shiftsMap = new Map(shiftsList?.map((s: any) => [s.id, s]));
  const areasMap = new Map(areasList?.map((a: any) => [a.id, a]));
  const positionsMap = new Map(positionsList?.map((p: any) => [p.id, p]));
  const platformUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hrm-roster-manager.vercel.app';

  // 3. Send WhatsApp notifications in parallel
  const notifiedWorkers: string[] = [];

  const results = await Promise.allSettled(uniqueAssignments.map(async (ass: any) => {
    const person = personnelMap.get(ass.personnel_id);
    if (!person || !(person as any).phone) return;

    const newShift = shiftsMap.get(ass.shift_id);
    if (!newShift) return;

    let phone = (person as any).phone.replace(/[^\d+]/g, '');
    if (!phone.startsWith('+') && phone.startsWith('56')) phone = '+' + phone;

    const areaName = ass.area_id ? ((areasMap.get(ass.area_id) as any)?.name || 'No especificada') : 'No especificada';
    const positionName = ass.position_id ? ((positionsMap.get(ass.position_id) as any)?.name || 'No especificada') : 'No especificada';

    let formattedDate = ass.date;
    try {
      const parsed = parseISO(ass.date);
      const rawFmt = format(parsed, "EEEE, dd 'de' MMMM", { locale: esLocale });
      formattedDate = rawFmt.charAt(0).toUpperCase() + rawFmt.slice(1);
    } catch (e) {}

    const workerName = `${(person as any).first_name} ${(person as any).last_name_father}`;
    const log = latestAuditMap.get(`${ass.personnel_id}_${ass.date}`);
    const oldShift = (log as any)?.previous_shift_id ? shiftsMap.get((log as any).previous_shift_id) : null;
    const oldShiftStr = oldShift
      ? `${(oldShift as any).name} (${(oldShift as any).start_time.slice(0, 5)} - ${(oldShift as any).end_time.slice(0, 5)})`
      : 'Sin turno previo registrado';

    const message = `🔄 *Notificación de Cambio de Turno*\n\n` +
      `Hola *${workerName}*,\n` +
      `Se ha registrado una modificación en tu programación de turnos:\n\n` +
      `📅 *Fecha:* ${formattedDate}\n\n` +
      `* *Turno Anterior:* ${oldShiftStr}\n` +
      `* *Nuevo Turno:* *${(newShift as any).name}* (*${(newShift as any).start_time.slice(0, 5)}* - *${(newShift as any).end_time.slice(0, 5)}*)\n` +
      `📍 *Área:* ${areaName}\n` +
      `💼 *Función:* ${positionName}\n\n` +
      `Por favor, planifica tu jornada considerando esta actualización. Puedes revisar tu planilla completa en la plataforma: ${platformUrl}\n\n` +
      `*Este es un mensaje automático. No lo responda. Si tiene alguna duda comuníquese con su supervisor.*`;

    const res = await sendWhatsAppMessage(phone, message);
    if (res.success) {
      // Mark as notified — prevents future duplicate sends
      await supabase.from('shift_assignments')
        .update({ whatsapp_notified_at: new Date().toISOString() })
        .eq('id', ass.id);
      return workerName;
    }
    throw new Error((res as any).error || 'UltraMsg failed');
  }));

  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value) notifiedWorkers.push(r.value as string);
  });

  return { success: true, notifiedWorkers, total: uniqueAssignments.length };
}

export async function unpublishAssignments(assignmentIds: string[]) {

  if (!await isAdmin()) return { success: false, error: 'No autorizado' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('shift_assignments')
    .update({ 
      is_published: false,
      is_validated: false 
    })
    .in('id', assignmentIds);

  revalidatePath('/shifts/roster');
  revalidatePath('/shifts/daily');
  return { success: !error, error: error?.message };
}

export async function moveAssignment(assignmentId: string, newDate: string, reason?: string) {
  const supabase = await createClient();
  const userId = await getCurrentUserId();

  // Fetch current state for audit and notifications
  const { data: current } = await supabase
    .from('shift_assignments')
    .select('*, personnel:personnel(first_name, last_name_father, phone), shift:shifts(name, start_time, end_time), area:areas(name), position:positions(name)')
    .eq('id', assignmentId)
    .maybeSingle() as any;

  if (!current) return { success: false, error: 'Turno no encontrado' };

  // Validate personnel availability for the new date
  const validation = await validatePersonnelAvailabilityForDates(current.personnel_id, [newDate]);
  if (!validation.success) {
    return { success: false, error: validation.error };
  }

  // Update
  const { error } = await supabase
    .from('shift_assignments')
    .update({ 
      date: newDate,
      is_manual: true
    })
    .eq('id', assignmentId);

  if (error) return { success: false, error: error.message };

  // Always audit date movements so publishAssignments can detect the change
  // and send WhatsApp notifications even if not previously validated.
  // Non-fatal: if roster_audit_logs table doesn't exist yet, we continue.
  try {
    await supabase.from('roster_audit_logs').insert({
      assignment_id: assignmentId,
      personnel_id: current.personnel_id,
      date: newDate,
      previous_shift_id: current.shift_id,
      new_shift_id: current.shift_id, // Same shift, different date
      reason: reason || 'Movimiento Drag & Drop',
      changed_by: userId
    });
  } catch (auditErr) {
    console.warn('[moveAssignment] Could not insert audit log (table may not exist yet):', auditErr);
  }

  // If already published, notify the worker immediately of the date movement
  if (current.is_published && current.personnel?.phone) {
    (async () => {
      try {
        const person = current.personnel;
        let phone = person.phone.replace(/[^\d+]/g, '');
        if (!phone.startsWith('+') && phone.startsWith('56')) {
          phone = '+' + phone;
        }

        const shiftStr = `${current.shift.name} (${current.shift.start_time.slice(0, 5)} - ${current.shift.end_time.slice(0, 5)})`;
        const areaName = current.area?.name || 'No especificada';
        const positionName = current.position?.name || 'No especificada';

        let formattedOldDate = current.date;
        let formattedNewDate = newDate;
        try {
          const parsedOld = parseISO(current.date);
          const rawOld = format(parsedOld, "EEEE, dd 'de' MMMM", { locale: esLocale });
          formattedOldDate = rawOld.charAt(0).toUpperCase() + rawOld.slice(1);

          const parsedNew = parseISO(newDate);
          const rawNew = format(parsedNew, "EEEE, dd 'de' MMMM", { locale: esLocale });
          formattedNewDate = rawNew.charAt(0).toUpperCase() + rawNew.slice(1);
        } catch (e) {}

        const workerName = `${person.first_name} ${person.last_name_father}`;
        const platformUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hrm-roster-manager.vercel.app';

        const message = `🔄 *Notificación de Cambio de Turno*\n\n` +
          `Hola *${workerName}*,\n` +
          `Se ha registrado una modificación en tu programación de turnos:\n\n` +
          `📅 Tu turno ha sido **trasladado de fecha**:\n\n` +
          `* *Fecha Anterior:* ${formattedOldDate}\n` +
          `* *Nueva Fecha:* *${formattedNewDate}*\n` +
          `⏰ *Turno:* ${shiftStr}\n` +
          `📍 *Área:* ${areaName}\n` +
          `💼 *Función:* ${positionName}\n\n` +
          `Por favor, planifica tu jornada considerando esta actualización. Puedes revisar tu planilla completa en la plataforma: ${platformUrl}\n\n` +
          `*Este es un mensaje automático. No lo responda. Si tiene alguna duda comuníquese con su supervisor.*`;

        await sendWhatsAppMessage(phone, message);
      } catch (err) {
        console.error('[moveAssignment] Failed to send WhatsApp notification:', err);
      }
    })();
  }

  revalidatePath('/shifts/roster');
  revalidatePath('/shifts/daily');
  return { success: true };
}
export async function deleteAssignment(id: string) {
  const supabase = await createClient();

  // 1. Fetch current assignment details before deleting
  const { data: current } = await supabase
    .from('shift_assignments')
    .select('*, personnel:personnel(first_name, last_name_father, phone), shift:shifts(name, start_time, end_time), area:areas(name), position:positions(name)')
    .eq('id', id)
    .maybeSingle() as any;

  const { error } = await supabase.from('shift_assignments').delete().eq('id', id);
  if (error) return { success: false, error: error.message };

  // 2. If it was published, notify the worker immediately of the change to Libre
  if (current && current.is_published && current.personnel?.phone) {
    (async () => {
      try {
        const person = current.personnel;
        let phone = person.phone.replace(/[^\d+]/g, '');
        if (!phone.startsWith('+') && phone.startsWith('56')) {
          phone = '+' + phone;
        }

        const oldShiftStr = `${current.shift.name} (${current.shift.start_time.slice(0, 5)} - ${current.shift.end_time.slice(0, 5)})`;
        const areaName = current.area?.name || 'No especificada';
        const positionName = current.position?.name || 'No especificada';

        let formattedDate = current.date;
        try {
          const parsed = parseISO(current.date);
          const rawFormat = format(parsed, "EEEE, dd 'de' MMMM", { locale: esLocale });
          formattedDate = rawFormat.charAt(0).toUpperCase() + rawFormat.slice(1);
        } catch (e) {}

        const workerName = `${person.first_name} ${person.last_name_father}`;
        const platformUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hrm-roster-manager.vercel.app';

        const message = `🔄 *Notificación de Cambio de Turno*\n\n` +
          `Hola *${workerName}*,\n` +
          `Se ha registrado una modificación en tu programación de turnos:\n\n` +
          `📅 *Fecha:* ${formattedDate}\n\n` +
          `* *Turno Anterior:* ${oldShiftStr}\n` +
          `* *Nuevo Turno:* *Libre / Sin Turno*\n` +
          `📍 *Área:* ${areaName}\n` +
          `💼 *Función:* ${positionName}\n\n` +
          `Por favor, planifica tu jornada considerando esta actualización. Puedes revisar tu planilla completa en la plataforma: ${platformUrl}\n\n` +
          `*Este es un mensaje automático. No lo responda. Si tiene alguna duda comuníquese con su supervisor.*`;

        await sendWhatsAppMessage(phone, message);
      } catch (err) {
        console.error('[deleteAssignment] Failed to send WhatsApp notification:', err);
      }
    })();
  }

  revalidatePath('/shifts/assignments');
  revalidatePath('/shifts/roster');
  revalidatePath('/shifts/daily');
  return { success: true, error: null };
}

export async function bulkDeleteManualAssignments(personnelId: string, dates: string[]) {
  const supabase = await createClient();
  
  if (!dates || dates.length === 0) return { success: true, error: null };

  const { error } = await supabase
    .from('shift_assignments')
    .delete()
    .eq('personnel_id', personnelId)
    .in('date', dates);

  if (error) return { success: false, error: error.message };

  revalidatePath('/shifts/assignments');
  revalidatePath('/shifts/roster');
  revalidatePath('/shifts/daily');
  return { success: true, error: null };
}

export async function bulkDeleteAssignmentsByIds(ids: string[]) {
  if (ids.length === 0) return { success: true };
  const supabase = await createClient();
  const { error } = await supabase
    .from('shift_assignments')
    .delete()
    .in('id', ids);
  
  if (error) return { success: false, error: error.message };
  
  revalidatePath('/shifts/assignments');
  revalidatePath('/shifts/roster');
  revalidatePath('/shifts/daily');
  return { success: true };
}
// ─── Scheduling Engine Actions ────────────────────────────────────────────────

export async function runScheduler(startDate: string, endDate: string, areaId?: string, personnelIds?: string[], positionFilter?: string, shouldValidate: boolean = false) {
  try {
    // Extend end date to the end of the current week (Sunday) to ensure full week analysis
    const end = parseISO(endDate);
    const extendedEnd = format(endOfWeek(end, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const result = await generateSchedule(startDate, extendedEnd, areaId, personnelIds, positionFilter, shouldValidate);
    
    // CONFIGURACIÓN DE RANGO MENSUAL
    const sDate = parseISO(startDate);
    const monthStart = startOfMonth(sDate);
    const monthEnd = endOfMonth(sDate);
    const monthStartStr = format(monthStart, 'yyyy-MM-dd');
    const monthEndStr = format(monthEnd, 'yyyy-MM-dd');

    const supabase = await createClient();

    // 1. Obtener la lista de IDs de personal a auditar
    let targetIds = personnelIds || [];
    if (targetIds.length === 0) {
      let pQuery = supabase.from('personnel').select('id');
      if (areaId && areaId !== 'all') pQuery = pQuery.eq('area_id', areaId);
      if (positionFilter && positionFilter !== 'none') pQuery = pQuery.ilike('main_position_name', `%${positionFilter}%`);
      const { data: pData } = await pQuery;
      targetIds = (pData || []).map(p => p.id);
    }

    // 2. Obtener datos de este personal y sus turnos
    const { data: personnelData } = await supabase
      .from('personnel')
      .select('id, first_name, last_name_father, rotation_pattern')
      .in('id', targetIds);

    const { data: allAssignments } = await supabase
      .from('shift_assignments')
      .select('*')
      .in('personnel_id', targetIds)
      .gte('date', monthStartStr)
      .lte('date', monthEndStr);

    // 3. Definir las semanas naturales del mes (Lunes a Domingo)
    const weeksList: string[] = [];
    let currW = startOfWeek(monthStart, { weekStartsOn: 1 });
    
    // Generar al menos 5 semanas para cubrir el mes
    for (let i = 0; i < 6; i++) {
      const wLabel = format(currW, 'dd/MM');
      weeksList.push(wLabel);
      currW = new Date(currW.getTime() + 7 * 24 * 60 * 60 * 1000);
      if (currW > monthEnd && i >= 3) break; 
    }
    
    console.log(`[Audit] Generadas semanas para ${format(monthStart, 'MMMM')}: ${weeksList.join(', ')}`);

    // 4. Construir el resumen
    const auditSummary = (personnelData || []).map(p => {
      const pAssignments = (allAssignments || []).filter(a => a.personnel_id === p.id);
      const weekCounts: Record<string, number> = {};
      weeksList.forEach(w => weekCounts[w] = 0);

      pAssignments.forEach((a: any) => {
        const d = parseISO(a.date);
        const w = format(startOfWeek(d, { weekStartsOn: 1 }), 'dd/MM');
        if (weekCounts.hasOwnProperty(w)) weekCounts[w]++;
      });

      let sundaysOff = 0;
      let currD = new Date(monthStart);
      while (currD <= monthEnd) {
        if (currD.getDay() === 0) {
          const dStr = format(currD, 'yyyy-MM-dd');
          if (!pAssignments.some(a => a.date === dStr)) sundaysOff++;
        }
        currD.setDate(currD.getDate() + 1);
      }

      return {
        personId: p.id,
        personName: `${p.first_name} ${p.last_name_father}`,
        pattern: p.rotation_pattern || '5x2',
        weekCounts,
        sundaysOff
      };
    });

    revalidatePath('/shifts/assignments');
    revalidatePath('/shifts/roster');
    revalidatePath('/shifts/daily');
    
    // Diagnóstico extra para ver qué pasó en el servidor
    console.log(`[Scheduler] Terminado. Cobertura: ${result.coverage}%, Turnos: ${result.count}`);
    console.log(`[Scheduler] Detalle: ${result.stats?.total_slots || 0} slots, ${result.stats?.filled_slots || 0} llenos`);

    return { 
      success: true, 
      coverage: result.coverage,
      count: result.count,
      stats: result.stats,
      auditSummary: auditSummary.length > 0 ? auditSummary : null,
      diagnosticLogs: [
        `Requerimientos encontrados: ${result.stats?.total_slots || 0}`,
        `Personal evaluado: ${result.stats?.recalculated_count || 0}`,
        ...(result as any).diagnosticLogs || []
      ]
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : 'Scheduler failed',
    };
  }
}

export async function runPartialRecalc(input: RecalculationInput) {
  try {
    const result = await partialRecalculate(input);
    revalidatePath('/shifts/assignments');
    revalidatePath('/dashboard');
    revalidatePath('/shifts/daily');
    
    // Diagnóstico extra para ver qué pasó
    console.log(`[Partial Recalc] Terminado. Cobertura: ${result.coverage}%, Turnos: ${result.count}`);

    return { 
      success: true, 
      data: result, 
      diagnosticLogs: [
        `Slots totales: ${result.stats?.total_slots || 0}`,
        `Asignaciones recalculadas: ${result.stats?.recalculated_count || 0}`,
        ...(result as any).diagnosticLogs || []
      ],
      error: null 
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : 'Partial recalculation failed',
    };
  }
}

export async function clearAutoAssignments(
  startDate: string, 
  endDate: string, 
  areaId?: string, 
  personnelIds?: string[], 
  positionFilter?: string,
  options?: {
    includeManual?: boolean;
    includeValidated?: boolean;
    includePublished?: boolean;
  }
) {
  const supabase = await createClient();
  
  let query = supabase
    .from('shift_assignments')
    .delete()
    .eq('is_extra', false)
    .gte('date', startDate)
    .lte('date', endDate);

  if (!options?.includeManual) query = query.eq('is_manual', false);
  if (!options?.includeValidated) query = query.eq('is_validated', false);
  if (!options?.includePublished) {
    // Note: if the column is_published doesn't exist yet, this might error or be ignored
    // Based on previous greps, it seems it exists.
    query = query.eq('is_published', false);
  }
  
  // Always protect locked assignments
  query = query.eq('is_locked', false);

  if (areaId) query = query.eq('area_id', areaId);
  if (personnelIds && personnelIds.length > 0) {
    query = query.in('personnel_id', personnelIds);
  }
  if (positionFilter) {
     const { data: pos } = await supabase.from('positions').select('id').eq('name', positionFilter).maybeSingle();
     if (pos) query = query.eq('position_id', pos.id);
  }

  const { error } = await query;
  
  if (error) return { success: false, error: error.message };
  
  revalidatePath('/shifts/assignments');
  revalidatePath('/shifts/roster');
  revalidatePath('/dashboard');
  revalidatePath('/shifts/daily');
  
  return { success: true, error: null };
}

export async function runDiagnostic() {
  const supabase = await createClient();
  const start = '2026-04-20';
  const end = '2026-04-21';

  const { data: reqs } = await supabase
    .from('shift_requirements')
    .select('*, shift:shifts(*), area:areas(name), position:positions(name)')
    .gte('date', start)
    .lte('date', end);

  const { data: rawPers } = await supabase.from('personnel').select('*');
  const { data: positions } = await supabase.from('positions').select('*');
  const { data: allShifts } = await supabase.from('shifts').select('*');
  
  const { validateAllConstraints } = await import('@/lib/scheduler/constraints');

  const mappedPersonnel = (rawPers || []).map((p: any) => ({
    ...p,
    main_position_name: positions?.find(pos => pos.id === p.main_position)?.name,
    fixed_shift_obj: allShifts?.find(s => s.id === p.fixed_shift_id)
  })).filter((p: any) => {
    const n = (p.main_position_name || '').toUpperCase();
    return n.includes('SUPERVISOR') || n.includes('GRÚA') || n.includes('HORQUILLA') || n.includes('AEROPUERTO');
  });

  const logs: string[] = [];

  for (const day of [start, end]) {
    const dailyReqs = (reqs || []).filter(r => r.date === day);
    logs.push(`--- DÍA ${day} ---`);
    
    for (const req of dailyReqs) {
      const posName = (req.position as any)?.name;
      const shiftName = (req.shift as any)?.name;
      logs.push(`Turno: ${shiftName} (${posName})`);

      for (const p of mappedPersonnel) {
        // Mock objects for validation
        const personAvail: any = {
          personnel_id: p.id,
          first_name: p.first_name,
          main_position: p.main_position,
          main_position_name: p.main_position_name,
          secondary_positions: p.secondary_positions || [],
          fixed_shift_id: p.fixed_shift_id,
          fixed_shift_name: (p.fixed_shift_obj as any)?.name,
          rotation_pattern: p.rotation_pattern,
          weekly_hours: 0,
          assigned_dates: new Set(),
          leave_dates: new Set()
        };

        const slot: any = {
          date: req.date,
          shift_id: req.shift_id,
          position_id: req.position_id,
          area_id: req.area_id,
          position_name: posName,
          shift_name: shiftName,
          shift_start: (req.shift as any)?.start_time || '08:00',
          shift_end: (req.shift as any)?.end_time || '18:00',
          area_name: (req.area as any)?.name
        };

        const violations = validateAllConstraints(personAvail, slot, []);
        const pID = p.main_position?.substring(0, 8);
        const rID = req.position_id?.substring(0, 8);
        
        if (violations.length > 0) {
          logs.push(`   × ${p.first_name}: BLOQUEADO (${violations[0].message}) [P:${pID} vs R:${rID}]`);
        } else {
          logs.push(`   √ ${p.first_name}: DISPONIBLE [P:${pID} vs R:${rID}]`);
        }
      }
    }
  }

  return { logs };
}

// ─── Blue Express Rotation Bulk Update ──────────────────────────────────────────

export async function bulkUpdateBlueRotations(
  updates: Array<{ id: string; pattern: string }>
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  for (const update of updates) {
    const { error } = await supabase
      .from('personnel')
      .update({ rotation_pattern: update.pattern })
      .eq('id', update.id);

    if (error) {
      return { error: `Error actualizando ${update.id}: ${error.message}` };
    }
  }

  revalidatePath('/shifts/roster');
  return { error: null };
}

export async function getMonthlyAudit(startDate: string, areaId?: string, personnelIds?: string[], positionFilter?: string) {
  try {
    const sDate = parseISO(startDate);
    const monthStart = startOfMonth(sDate);
    const monthEnd = endOfMonth(sDate);
    const monthStartStr = format(monthStart, 'yyyy-MM-dd');
    const monthEndStr = format(monthEnd, 'yyyy-MM-dd');

    const supabase = await createClient();

    let targetIds = personnelIds || [];
    if (targetIds.length === 0) {
      let pQuery = supabase.from('personnel').select('id');
      if (areaId && areaId !== 'all') pQuery = pQuery.eq('area_id', areaId);
      if (positionFilter && positionFilter !== 'none') pQuery = pQuery.ilike('main_position_name', `%${positionFilter}%`);
      const { data: pData } = await pQuery;
      targetIds = (pData || []).map(p => p.id);
    }

    const { data: personnelData } = await supabase
      .from('personnel')
      .select('id, first_name, last_name_father, rotation_pattern')
      .in('id', targetIds);

    const { data: allAssignments } = await supabase
      .from('shift_assignments')
      .select('*')
      .in('personnel_id', targetIds)
      .gte('date', monthStartStr)
      .lte('date', monthEndStr);

    const weeksList: string[] = [];
    let currW = startOfWeek(monthStart, { weekStartsOn: 1 });
    for (let i = 0; i < 6; i++) {
      const wLabel = format(currW, 'dd/MM');
      weeksList.push(wLabel);
      currW = new Date(currW.getTime() + 7 * 24 * 60 * 60 * 1000);
      if (currW > monthEnd && i >= 3) break; 
    }

    const auditSummary = (personnelData || []).map(p => {
      const pAssignments = (allAssignments || []).filter(a => a.personnel_id === p.id);
      const weekCounts: Record<string, number> = {};
      weeksList.forEach(w => weekCounts[w] = 0);

      pAssignments.forEach((a: any) => {
        const d = parseISO(a.date);
        const w = format(startOfWeek(d, { weekStartsOn: 1 }), 'dd/MM');
        if (weekCounts.hasOwnProperty(w)) weekCounts[w]++;
      });

      let sundaysOff = 0;
      const monthSundays = eachDayOfInterval({ start: monthStart, end: monthEnd }).filter(d => d.getDay() === 0);
      
      monthSundays.forEach(sun => {
        const dStr = format(sun, 'yyyy-MM-dd');
        if (!pAssignments.some(a => a.date === dStr)) sundaysOff++;
      });

      return {
        personId: p.id,
        personName: `${p.first_name} ${p.last_name_father}`,
        pattern: p.rotation_pattern || '5x2',
        weekCounts,
        sundaysOff
      };
    });

    return { success: true, auditSummary };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Audit failed' };
  }
}
