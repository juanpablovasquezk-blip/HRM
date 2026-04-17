'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { generateSchedule, partialRecalculate } from '@/lib/scheduler';
import type { RecalculationInput } from '@/lib/scheduler/types';

// ─── Shift CRUD ───────────────────────────────────────────────────────────────

export async function createShift(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from('shifts').insert({
    name: formData.get('name') as string,
    start_time: formData.get('start_time') as string,
    end_time: formData.get('end_time') as string,
    requires_transport: formData.get('requires_transport') === 'true',
    company_id: formData.get('company_id') as string,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath('/shifts');
  return { success: true, error: null };
}

export async function updateShift(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get('id') as string;
  const { error } = await supabase.from('shifts').update({
    name: formData.get('name') as string,
    start_time: formData.get('start_time') as string,
    end_time: formData.get('end_time') as string,
    requires_transport: formData.get('requires_transport') === 'true',
    company_id: formData.get('company_id') as string,
  }).eq('id', id);
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

export async function listRequirements(date?: string) {
  const supabase = await createClient();
  let query = supabase
    .from('shift_requirements')
    .select('*, shift:shifts(name, start_time, end_time), area:areas(name), position:positions(name)')
    .order('date', { ascending: true });
  if (date) query = query.eq('date', date);
  const { data, error } = await query;
  return { data: data || [], error: error?.message || null };
}

// ─── Requirement Templates (Reglas Permanentes) ───────────────────────────────

export async function createTemplate(formData: FormData) {
  const supabase = await createClient();
  const daysRaw = formData.getAll('days_of_week');
  const daysArray = daysRaw.map(v => Number(v));
  const companyId = formData.get('company_id') as string;

  const insertData: any = {
    area_id: formData.get('area_id') as string,
    position_id: formData.get('position_id') as string,
    shift_id: formData.get('shift_id') as string,
    required_count: parseInt(formData.get('required_count') as string, 10),
    days_of_week: daysArray,
    is_active: true,
  };
  if (companyId && companyId.length > 10) {
    insertData.company_id = companyId;
  }

  const { data, error } = await supabase
    .from('requirement_templates')
    .insert(insertData)
    .select();

  if (error) {
    console.error('createTemplate error:', error);
    return { success: false, error: error.message };
  }
  if (!data || data.length === 0) {
    return { success: false, error: 'No se pudo guardar. Verifica los permisos RLS de la tabla requirement_templates.' };
  }
  revalidatePath('/shifts/requirements');
  return { success: true, error: null };
}

export async function listTemplates() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('requirement_templates')
    .select('*, shift:shifts(name, start_time, end_time, duration_hours), area:areas(name), position:positions(name)')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  return { data: data || [], error: error?.message || null };
}

export async function deleteTemplate(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('requirement_templates').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/shifts/requirements');
  return { success: true, error: null };
}

export async function materializeTemplates(startDate: string, endDate: string) {
  const supabase = await createClient();
  
  // Fetch all active templates
  const { data: templates, error: fetchErr } = await supabase
    .from('requirement_templates')
    .select('*');

  if (fetchErr) return { success: false, error: fetchErr.message, count: 0 };
  if (!templates || templates.length === 0) return { success: true, error: null, count: 0 };

  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const inserts: any[] = [];

  for (const tmpl of templates) {
    const allowedDays: number[] = tmpl.days_of_week || [];
    const current = new Date(start);

    while (current.getTime() <= end.getTime()) {
      if (allowedDays.includes(current.getDay())) {
        inserts.push({
          date: current.toISOString().split('T')[0],
          shift_id: tmpl.shift_id,
          area_id: tmpl.area_id,
          position_id: tmpl.position_id,
          required_count: tmpl.required_count,
        });
      }
      current.setDate(current.getDate() + 1);
    }
  }

  if (inserts.length > 0) {
    // Upsert: avoid duplicates by date+shift+area+position
    const { error } = await supabase.from('shift_requirements').upsert(inserts, {
      onConflict: 'date,shift_id,area_id,position_id',
      ignoreDuplicates: true,
    });
    if (error) {
      // Fallback: just insert, ignore duplicates manually
      const { error: insertErr } = await supabase.from('shift_requirements').insert(inserts);
      if (insertErr) return { success: false, error: insertErr.message, count: 0 };
    }
  }

  revalidatePath('/shifts/requirements');
  return { success: true, error: null, count: inserts.length };
}

// ─── Assignments ──────────────────────────────────────────────────────────────

export async function listAssignments(startDate: string, endDate: string, areaId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from('shift_assignments')
    .select('*, personnel:personnel(first_name, last_name_father), shift:shifts(name, start_time, end_time), area:areas(name), position:positions(name)')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true });
  if (areaId) query = query.eq('area_id', areaId);
  const { data, error } = await query;
  return { data: data || [], error: error?.message || null };
}

export async function createManualAssignment(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from('shift_assignments').insert({
    personnel_id: formData.get('personnel_id') as string,
    shift_id: formData.get('shift_id') as string,
    date: formData.get('date') as string,
    area_id: formData.get('area_id') as string,
    position_id: formData.get('position_id') as string,
    status: 'scheduled',
    is_manual: true,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath('/shifts/assignments');
  return { success: true, error: null };
}
export async function deleteAssignment(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('shift_assignments').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/shifts/assignments');
  revalidatePath('/shifts/roster');
  return { success: true, error: null };
}
// ─── Scheduling Engine Actions ────────────────────────────────────────────────

export async function runScheduler(startDate: string, endDate: string, areaId?: string) {
  try {
    const result = await generateSchedule(startDate, endDate, areaId);
    revalidatePath('/shifts/assignments');
    revalidatePath('/dashboard');
    return { success: true, data: result, error: null };
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
    return { success: true, data: result, error: null };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : 'Recalculation failed',
    };
  }
}

export async function clearAutoAssignments(startDate: string, endDate: string, areaId?: string) {
  const supabase = await createClient();
  
  let query = supabase
    .from('shift_assignments')
    .delete()
    .eq('is_manual', false)
    .eq('is_locked', false)
    .gte('date', startDate)
    .lte('date', endDate);

  if (areaId) query = query.eq('area_id', areaId);

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
    return n.includes('SUPERVISOR') || n.includes('GRÚA') || n.includes('HORQUILLA');
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
