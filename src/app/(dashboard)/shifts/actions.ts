'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { generateSchedule, partialRecalculate } from '@/lib/scheduler';
import type { RecalculationInput } from '@/lib/scheduler/types';
import { parseISO, format, endOfWeek, startOfWeek, isAfter, startOfMonth, endOfMonth } from 'date-fns';

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

export async function createShift(formData: FormData) {
  const supabase = await createClient();
  const geovRaw = formData.get('geov');
  const companyId = formData.get('company_id') as string;
  
  const shiftData = {
    name: formData.get('name') as string,
    start_time: formData.get('start_time') as string,
    end_time: formData.get('end_time') as string,
    requires_transport: formData.get('requires_transport') === 'true',
    geov: geovRaw ? parseFloat(geovRaw as string) : null,
  };

  if (!companyId || companyId === '') {
    // If no company selected, create for ALL companies to bypass NOT NULL constraint
    const { data: companies } = await supabase.from('companies').select('id');
    if (companies && companies.length > 0) {
      const inserts = companies.map(c => ({ ...shiftData, company_id: c.id }));
      const { error } = await supabase.from('shifts').insert(inserts);
      if (error) return { success: false, error: error.message };
    } else {
      return { success: false, error: 'No se encontraron compañías para crear el turno global.' };
    }
  } else {
    const { error } = await supabase.from('shifts').insert({
      ...shiftData,
      company_id: companyId,
    });
    if (error) return { success: false, error: error.message };
  }

  revalidatePath('/shifts');
  return { success: true, error: null };
}

export async function updateShift(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get('id') as string;
  const geovRaw = formData.get('geov');
  const companyId = formData.get('company_id') as string;

  // Note: For update, we only update the specific shift record
  // If it was global, it was created as separate records, so we update them individually
  const updateData: any = {
    name: formData.get('name') as string,
    start_time: formData.get('start_time') as string,
    end_time: formData.get('end_time') as string,
    requires_transport: formData.get('requires_transport') === 'true',
    geov: geovRaw ? parseFloat(geovRaw as string) : null,
  };

  if (companyId && companyId !== '') {
    updateData.company_id = companyId;
  }

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
  const days = formData.get('days_of_week') as string;
  const { error } = await supabase.from('requirement_templates').insert({
    area_id: formData.get('area_id') as string,
    position_id: formData.get('position_id') as string,
    shift_id: formData.get('shift_id') as string,
    required_count: parseInt(formData.get('required_count') as string),
    days_of_week: days.split(',').map(Number),
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
  const days = formData.get('days_of_week') as string;
  const { error } = await supabase.from('requirement_templates').update({
    area_id: formData.get('area_id') as string,
    position_id: formData.get('position_id') as string,
    shift_id: formData.get('shift_id') as string,
    required_count: parseInt(formData.get('required_count') as string),
    days_of_week: days.split(',').map(Number),
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
  
  const inserts: any[] = [];

  // 2. Generar requerimientos día por día basados en las reglas
  for (const day of days) {
    const dayOfWeek = getDay(day); // 0 (Sun) to 6 (Sat)
    // El sistema usa 1 (Mon) a 7 (Sun)
    const normalizedDay = dayOfWeek === 0 ? 7 : dayOfWeek;

    for (const template of templates) {
      if (template.days_of_week.includes(normalizedDay)) {
        inserts.push({
          area_id: template.area_id,
          position_id: template.position_id,
          shift_id: template.shift_id,
          required_count: template.required_count,
          date: format(day, 'yyyy-MM-dd')
        });
      }
    }
  }

  if (inserts.length > 0) {
    const { error: iError } = await supabase.from('shift_requirements').upsert(inserts, {
       onConflict: 'area_id,position_id,shift_id,date'
    });
    if (iError) return { success: false, error: iError.message };
  }

  revalidatePath('/shifts/requirements');
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

export async function createManualAssignment(formData: FormData) {
  const supabase = await createClient();
  const personnelId = formData.get('personnel_id') as string;
  const shiftId = formData.get('shift_id') as string;
  const areaId = formData.get('area_id') as string;
  const positionId = formData.get('position_id') as string;
  const dateInput = formData.get('date') as string;

  // Support multiple dates if comma separated (from multi-selection)
  const dates = dateInput.includes(',') ? dateInput.split(',') : [dateInput];

  const inserts = dates.map(date => ({
    personnel_id: personnelId,
    shift_id: shiftId,
    date: date,
    area_id: areaId,
    position_id: positionId,
    status: 'scheduled',
    is_manual: true,
  }));

  // Clean existing manual assignments on these dates for this person to avoid duplicates
  // and ensure we are updating to the new selection
  const { error } = await supabase
    .from('shift_assignments')
    .upsert(inserts, { 
      onConflict: 'personnel_id,date,shift_id',
      ignoreDuplicates: false 
    });

  if (error) return { success: false, error: error.message };

  // AUDIT LOGGING: If these dates were already validated, log the changes
  const userId = await getCurrentUserId();
  for (const date of dates) {
    // Check if there's an original AI proposal to compare against
    const { data: prev } = await supabase
      .from('shift_assignments')
      .select('id, shift_id, original_shift_id, is_validated')
      .eq('personnel_id', personnelId)
      .eq('date', date)
      .maybeSingle();

    if (prev?.is_validated) {
      await supabase.from('roster_audit_logs').insert({
        assignment_id: prev.id,
        personnel_id: personnelId,
        date: date,
        previous_shift_id: prev.shift_id,
        new_shift_id: shiftId,
        reason: (formData.get('reason') as string) || 'Cambio manual post-validación',
        changed_by: userId
      });
    }
  }
  
  revalidatePath('/shifts/assignments');
  revalidatePath('/shifts/roster');
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
  return { success: !error, error: error?.message };
}

export async function publishAssignments(input: string | string[], endDate?: string, areaId?: string) {
  if (!await isAdmin()) return { success: false, error: 'No autorizado' };
  const supabase = await createClient();
  
  let query = supabase.from('shift_assignments').update({ is_published: true });
  
  if (Array.isArray(input)) {
    query = query.in('id', input);
  } else if (typeof input === 'string' && endDate) {
    query = query.gte('date', input).lte('date', endDate);
    if (areaId) query = query.eq('area_id', areaId);
  } else {
    return { success: false, error: 'Parámetros inválidos' };
  }

  const { error } = await query;
  revalidatePath('/shifts/roster');
  revalidatePath('/dashboard');
  return { success: !error, error: error?.message };
}

export async function moveAssignment(assignmentId: string, newDate: string, reason?: string) {
  const supabase = await createClient();
  const userId = await getCurrentUserId();

  // Fetch current state for audit
  const { data: current } = await supabase
    .from('shift_assignments')
    .select('*')
    .eq('id', assignmentId)
    .single();

  if (!current) return { success: false, error: 'Turno no encontrado' };

  // Update
  const { error } = await supabase
    .from('shift_assignments')
    .update({ 
      date: newDate,
      is_manual: true
    })
    .eq('id', assignmentId);

  if (error) return { success: false, error: error.message };

  // Audit if validated
  if (current.is_validated) {
    await supabase.from('roster_audit_logs').insert({
      assignment_id: assignmentId,
      personnel_id: current.personnel_id,
      date: newDate,
      previous_shift_id: current.shift_id,
      new_shift_id: current.shift_id, // Same shift, different date
      reason: reason || 'Movimiento Drag & Drop',
      changed_by: userId
    });
  }

  revalidatePath('/shifts/roster');
  return { success: true };
}
export async function deleteAssignment(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('shift_assignments').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/shifts/assignments');
  revalidatePath('/shifts/roster');
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
    
    return { 
      success: true, 
      coverage: result.coverage,
      count: result.count,
      stats: result.stats,
      auditSummary: auditSummary.length > 0 ? auditSummary : null,
      diagnosticLogs: (result as any).diagnosticLogs || []
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
    return { 
      success: true, 
      data: result, 
      diagnosticLogs: (result as any).diagnosticLogs || [],
      error: null 
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : 'Recalculation failed',
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

    return { success: true, auditSummary };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Audit failed' };
  }
}
