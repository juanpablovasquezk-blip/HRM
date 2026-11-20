'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { generateSchedule, partialRecalculate } from '@/lib/scheduler';
import {
  buildBlueExpressApplyPlan,
  calculateBlueExpressNightStaffingProposal,
  getTwoMonthHistoryWindow,
  validateApprovedTrucksByWeekday,
  type BlueExpressNightProposal,
} from '@/lib/scheduler/v2/blue-express';
import { compareEnginesPreview } from '@/lib/scheduler/v2/preview-compare';
import { deriveNs22AnchorFromHistory } from '@/lib/scheduler/v2/aeropuerto-ns22';
import { fetchAllPaginated } from '@/lib/scheduler/v2/pagination';
import { scheduleCrossArea } from '@/lib/scheduler/v2/cobertura';
import {
  isProtectedPersistedAssignment,
  isV2SaveEnabled,
  recoverRosterFromSnapshot,
  saveV2Schedule,
  validateNs22OperationalConfig,
  type Ns22OperationalConfirmation,
  type PersistedAssignmentRow,
} from '@/lib/scheduler/v2/save-recover';
import {
  createSupabaseRosterPersistenceAdapter,
  type SupabaseLikeClient,
} from '@/lib/scheduler/v2/supabase-adapter';
import type { RecalculationInput } from '@/lib/scheduler/types';
import { parseISO, format, endOfWeek, startOfWeek, isAfter, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addDays, subDays } from 'date-fns';
import { requireActionAuth } from '@/lib/auth/action-guard';
import { sendWhatsAppMessage } from '@/lib/ultramsg';
import { es as esLocale } from 'date-fns/locale';
import { buildConsolidatedRequirements, filterMissingRequirements } from './dotacion/materialize-utils';
import {
  buildOrdinaryRequirementRangePreview,
  type OrdinaryRequirementRangeDeletePreview,
  type OrdinaryRequirementRangeFilter,
} from './dotacion/range-delete-utils';
import {
  groupDailyCountsToTemplates,
  normalizePriority,
  normalizePriorityOverrides,
  type OperationalPriority,
  type PriorityOverridesMap,
} from './dotacion/matrix-utils';
import { calcEffectiveShiftDuration, resolveShiftDurationHours } from './shift-duration';
import { getUserRole } from '@/app/role-actions';
import { hasPermission } from '@/lib/auth/roles';
import type { Role } from '@/types/database';


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
  const startTime = formData.get('start_time') as string;
  const endTime = formData.get('end_time') as string;

  const shiftData = {
    name: formData.get('name') as string,
    start_time: startTime,
    end_time: endTime,
    duration_hours: calcEffectiveShiftDuration(startTime, endTime) ?? 0,
    requires_transport: formData.get('requires_transport') === 'true',
    geov: geovRaw ? parseFloat(geovRaw as string) : null,
  };

  // company_id is NOT NULL in the DB — create one row per company so the shift
  // is available to all of them without requiring a schema migration.
  const { data: companies } = await supabase.from('companies').select('id');
  if (!companies || companies.length === 0) {
    return { success: false, error: 'No se encontraron compañías para crear el turno.' };
  }

  const inserts = companies.map(c => ({ ...shiftData, company_id: c.id }));
  const { error } = await supabase.from('shifts').insert(inserts);
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
    duration_hours: calcEffectiveShiftDuration(startTime, endTime) ?? 0,
    requires_transport: formData.get('requires_transport') === 'true',
    geov: geovRaw ? parseFloat(geovRaw as string) : null,
  };

  // First fetch the canonical shift so we can find all company copies of it
  const { data: original } = await supabase.from('shifts').select('name, start_time, end_time').eq('id', id).single();

  if (original) {
    // Update all company copies that share the same name+start+end
    const { error } = await supabase
      .from('shifts')
      .update(updateData)
      .eq('name', original.name)
      .eq('start_time', original.start_time)
      .eq('end_time', original.end_time);
    if (error) return { success: false, error: error.message };
  } else {
    // Fallback: update by id only
    const { error } = await supabase.from('shifts').update(updateData).eq('id', id);
    if (error) return { success: false, error: error.message };
  }

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
  const requiresShiftsVal = formData.get('requires_shifts');
  const requires_shifts = requiresShiftsVal !== null ? (requiresShiftsVal === 'true' || requiresShiftsVal === 'on' || requiresShiftsVal === '1') : true;

  const insertData: any = {
    area_id: formData.get('area_id') as string,
    name: formData.get('name') as string,
    requires_shifts,
  };

  let { error } = await supabase.from('positions').insert(insertData);

  if (error && (error.message?.includes('requires_shifts') || error.code === '42703')) {
    delete insertData.requires_shifts;
    const retry = await supabase.from('positions').insert(insertData);
    error = retry.error;
  }

  if (error) return { success: false, error: error.message };
  revalidatePath('/shifts/areas');
  revalidatePath('/settings/areas');
  return { success: true, error: null };
}

export async function updatePosition(id: string, formData: FormData) {
  const supabase = await createClient();
  const requiresShiftsVal = formData.get('requires_shifts');
  const requires_shifts = requiresShiftsVal !== null ? (requiresShiftsVal === 'true' || requiresShiftsVal === 'on' || requiresShiftsVal === '1') : true;

  const updateData: any = {
    name: formData.get('name') as string,
    requires_shifts,
  };

  let { error } = await supabase.from('positions').update(updateData).eq('id', id);

  if (error && (error.message?.includes('requires_shifts') || error.code === '42703')) {
    delete updateData.requires_shifts;
    const retry = await supabase.from('positions').update(updateData).eq('id', id);
    error = retry.error;
  }

  if (error) return { success: false, error: error.message };
  revalidatePath('/shifts/areas');
  revalidatePath('/settings/areas');
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
        is_extra: false,
      });
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  if (inserts.length > 0) {
    const { error } = await supabase
      .from('shift_requirements')
      .upsert(inserts, {
        onConflict: 'area_id,position_id,shift_id,date,is_extra',
        ignoreDuplicates: true,
      });
    if (error) return { success: false, error: error.message };
  }

  revalidatePath('/shifts/requirements');
  revalidatePath('/shifts/dotacion');
  return { success: true, error: null };
}

export async function deleteRequirement(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('shift_requirements').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/shifts/requirements');
  return { success: true, error: null };
}

/**
 * Vista previa en solo lectura de requerimientos ordinarios fechados a eliminar por rango y filtros.
 */
export async function previewDeleteOrdinaryRequirementsByRange(
  filter: OrdinaryRequirementRangeFilter
): Promise<{ success: boolean; preview: OrdinaryRequirementRangeDeletePreview | null; error: string | null }> {
  try {
    const auth = await requireActionAuth({ roles: ['ADMIN', 'SUPERVISOR'] });
    if (!auth.ok) return { success: false, preview: null, error: auth.error };

    if (!filter.startDate || !filter.endDate || filter.startDate > filter.endDate) {
      return {
        success: false,
        preview: null,
        error: 'El rango de fechas es inválido (la fecha inicial debe ser menor o igual a la final).',
      };
    }

    const supabase = await createClient();
    const paged = await fetchAllPaginated<any>(async (from, to) => {
      let q = supabase
        .from('shift_requirements')
        .select('id, date, area_id, position_id, shift_id, required_count, is_extra, area:areas(name), position:positions(name), shift:shifts(name)')
        .eq('is_extra', false)
        .gte('date', filter.startDate)
        .lte('date', filter.endDate)
        .order('date', { ascending: true })
        .order('id', { ascending: true });

      if (filter.areaId && filter.areaId !== 'all') q = q.eq('area_id', filter.areaId);
      if (filter.positionId && filter.positionId !== 'all') q = q.eq('position_id', filter.positionId);
      if (filter.shiftId && filter.shiftId !== 'all') q = q.eq('shift_id', filter.shiftId);
      return q.range(from, to);
    });

    if (paged.error || !paged.data) {
      return {
        success: false,
        preview: null,
        error: paged.error || 'Error cargando vista previa de requerimientos.',
      };
    }

    const preview = buildOrdinaryRequirementRangePreview(paged.data, filter);
    return { success: true, preview, error: null };
  } catch (err) {
    return {
      success: false,
      preview: null,
      error: err instanceof Error ? err.message : 'Error calculando vista previa de eliminación',
    };
  }
}

/**
 * Elimina en una sola operación únicamente los requerimientos ordinarios fechados (`is_extra = false`)
 * dentro del rango y filtros elegidos. Conserva Matriz Semanal, requerimientos extra y asignaciones.
 */
export async function deleteOrdinaryRequirementsByRange(
  filter: OrdinaryRequirementRangeFilter
): Promise<{ success: boolean; deletedCount: number; error: string | null }> {
  try {
    const auth = await requireActionAuth({ roles: ['ADMIN', 'SUPERVISOR'] });
    if (!auth.ok) return { success: false, deletedCount: 0, error: auth.error };

    if (!filter.startDate || !filter.endDate || filter.startDate > filter.endDate) {
      return {
        success: false,
        deletedCount: 0,
        error: 'El rango de fechas es inválido.',
      };
    }

    const supabase = await createClient();
    let delQuery = supabase
      .from('shift_requirements')
      .delete()
      .eq('is_extra', false)
      .gte('date', filter.startDate)
      .lte('date', filter.endDate);

    if (filter.areaId && filter.areaId !== 'all') delQuery = delQuery.eq('area_id', filter.areaId);
    if (filter.positionId && filter.positionId !== 'all') delQuery = delQuery.eq('position_id', filter.positionId);
    if (filter.shiftId && filter.shiftId !== 'all') delQuery = delQuery.eq('shift_id', filter.shiftId);

    const { data, error } = await delQuery.select('id');
    if (error) {
      return { success: false, deletedCount: 0, error: error.message };
    }

    if (process.env.ROSTER_ISOLATED_TEST !== 'true') {
      revalidatePath('/shifts/dotacion');
      revalidatePath('/shifts/requirements');
      revalidatePath('/shifts/daily');
    }

    return { success: true, deletedCount: data?.length || 0, error: null };
  } catch (err) {
    return {
      success: false,
      deletedCount: 0,
      error: err instanceof Error ? err.message : 'Error eliminando necesidades por rango',
    };
  }
}

export async function listRequirements(startDate?: string, endDate?: string) {
  const supabase = await createClient();
  const effectiveStart = startDate || format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const effectiveEnd = endDate || (!startDate ? format(endOfMonth(new Date()), 'yyyy-MM-dd') : undefined);

  const allRows: any[] = [];
  let from = 0;
  const PAGE_SIZE = 1000;

  while (true) {
    let query = supabase
      .from('shift_requirements')
      .select('*, shift:shifts(name, start_time, end_time), area:areas(name), position:positions(name)')
      .order('date', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (effectiveStart && effectiveEnd) {
      query = query.gte('date', effectiveStart).lte('date', effectiveEnd);
    } else if (startDate) {
      query = query.eq('date', startDate);
    }

    const { data, error } = await query;
    if (error) return { data: allRows, error: error.message };
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { data: allRows, error: null };
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

export interface WeeklyMatrixRowChange {
  area_id: string;
  position_id: string;
  shift_id: string;
  priority?: OperationalPriority;
  priority_overrides?: PriorityOverridesMap;
  /** 7 integer counts >= 0 ordered Monday..Sunday */
  counts: number[];
  /** Optimistic concurrency fields */
  is_new?: boolean;
  expected_counts?: number[];
  expected_priority?: OperationalPriority;
  expected_priority_overrides?: PriorityOverridesMap;
}

export async function saveWeeklyMatrixChanges(changes: WeeklyMatrixRowChange[]) {
  if (!Array.isArray(changes) || changes.length === 0) {
    return { success: false, error: 'No hay cambios pendientes para guardar.' };
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Usuario no autenticado.' };
  }

  const role = await getUserRole();
  if (!role || !hasPermission(role as Role, 'manageShifts')) {
    return { success: false, error: 'No autorizado para modificar reglas operacionales.' };
  }

  const prepared: Array<{
    area_id: string;
    position_id: string;
    shift_id: string;
    priority: OperationalPriority;
    priority_overrides: PriorityOverridesMap;
    specs: Array<{ required_count: number; days_of_week: number[] }>;
    is_new?: boolean;
    expected_counts?: number[];
    expected_priority?: OperationalPriority;
    expected_priority_overrides?: PriorityOverridesMap;
  }> = [];

  try {
    for (const item of changes) {
      if (!item.area_id || !item.position_id || !item.shift_id) {
        return { success: false, error: 'Faltan identificadores de área, cargo o turno.' };
      }
      const specs = groupDailyCountsToTemplates(item.counts);
      const priority = normalizePriority(item.priority);
      const priority_overrides = normalizePriorityOverrides(
        item.priority_overrides,
        priority,
        item.counts
      );
      prepared.push({
        area_id: item.area_id,
        position_id: item.position_id,
        shift_id: item.shift_id,
        priority,
        priority_overrides,
        specs,
        ...(item.is_new ? { is_new: true } : {}),
        ...(Array.isArray(item.expected_counts) && item.expected_counts.length === 7
          ? { expected_counts: item.expected_counts }
          : {}),
        ...(item.expected_priority
          ? { expected_priority: normalizePriority(item.expected_priority) }
          : {}),
        ...(!item.is_new
          ? {
              expected_priority_overrides: item.expected_priority_overrides || {},
            }
          : {}),
      });
    }
  } catch (validationErr: any) {
    return { success: false, error: validationErr?.message || 'Cantidades inválidas en la matriz.' };
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc('save_weekly_matrix_changes', {
    p_changes: prepared,
  });

  if (rpcError) {
    return { success: false, error: `Error al guardar reglas operacionales: ${rpcError.message}` };
  }

  revalidatePath('/shifts/dotacion');
  return {
    success: true,
    error: null,
    updatedRows: (rpcData as { updated_rows?: number } | null)?.updated_rows ?? prepared.length,
  };
}

export async function materializeTemplates(startDate: string, endDate: string) {
  if (!startDate || !endDate || startDate > endDate) {
    return { success: false, error: 'Rango de fechas inválido.', count: 0, createdCount: 0, skippedCount: 0 };
  }

  const supabase = await createClient();

  // 1. Obtener todas las reglas activas y catálogos de área/cargo para feriados nacionales
  const [{ data: templates, error: tError }, { data: areas }, { data: positions }] = await Promise.all([
    supabase.from('requirement_templates').select('*'),
    supabase.from('areas').select('id, name'),
    supabase.from('positions').select('id, name'),
  ]);
  if (tError) return { success: false, error: tError.message, count: 0, createdCount: 0, skippedCount: 0 };
  if (!templates || templates.length === 0) {
    return { success: true, error: null, count: 0, createdCount: 0, skippedCount: 0 };
  }

  const areaNameById = new Map<string, string>((areas || []).map((a) => [a.id, a.name]));
  const positionNameById = new Map<string, string>((positions || []).map((p) => [p.id, p.name]));
  const holidayWarnings: string[] = [];

  // 2. Consolidar reglas día por día en memoria (aplicando feriados nacionales de Chile)
  const inserts = buildConsolidatedRequirements(templates, startDate, endDate, {
    areaNameById,
    positionNameById,
    warningsOut: holidayWarnings,
  });
  if (inserts.length === 0) {
    return {
      success: true,
      error: null,
      count: 0,
      createdCount: 0,
      skippedCount: 0,
      holidayWarnings,
    };
  }

  // 3. Consultar necesidades ordinarias ya existentes en el rango (paginado)
  const existingRows: any[] = [];
  let from = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data: chunk, error: eError } = await supabase
      .from('shift_requirements')
      .select('area_id, position_id, shift_id, date, is_extra')
      .eq('is_extra', false)
      .gte('date', startDate)
      .lte('date', endDate)
      .range(from, from + PAGE_SIZE - 1);

    if (eError) {
      return { success: false, error: eError.message, count: 0, createdCount: 0, skippedCount: 0 };
    }
    if (!chunk || chunk.length === 0) break;
    existingRows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  // 4. Filtrar solo los registros faltantes (sin sobrescribir ni sumar sobre existentes)
  const { missingInserts } = filterMissingRequirements(inserts, existingRows);

  // 5. Insertar únicamente faltantes con ON CONFLICT DO NOTHING (ignoreDuplicates: true)
  let createdCount = 0;
  const CHUNK_SIZE = 200;
  for (let i = 0; i < missingInserts.length; i += CHUNK_SIZE) {
    const chunk = missingInserts.slice(i, i + CHUNK_SIZE);
    const { data: insertedRows, error: iError } = await supabase
      .from('shift_requirements')
      .upsert(chunk, {
        onConflict: 'area_id,position_id,shift_id,date,is_extra',
        ignoreDuplicates: true,
      })
      .select('id');

    if (iError) {
      return {
        success: false,
        error: iError.message,
        count: createdCount,
        createdCount,
        skippedCount: inserts.length - createdCount,
      };
    }
    createdCount += insertedRows?.length || 0;
  }

  const skippedCount = inserts.length - createdCount;

  revalidatePath('/shifts/dotacion');
  revalidatePath('/shifts/requirements');
  revalidatePath('/shifts/daily');
  return {
    success: true,
    error: null,
    count: createdCount,
    createdCount,
    skippedCount,
    totalEvaluated: inserts.length,
    holidayWarnings,
  };
}

/**
 * ROSTER-09: Propuesta en solo lectura de dotación nocturna (AM 00) de Blue Express
 * para Dotación -> Generar Mes. Nunca modifica historial ni requerimientos.
 */
export async function previewBlueExpressNightStaffing(
  startDate: string,
  endDate: string
): Promise<{ success: boolean; proposal: BlueExpressNightProposal | null; error: string | null }> {
  try {
    const auth = await requireActionAuth({ roles: ['ADMIN', 'SUPERVISOR'] });
    if (!auth.ok) {
      return { success: false, proposal: null, error: auth.error };
    }

    const supabase = await createClient();
    const referenceDate = format(new Date(), 'yyyy-MM-dd');
    const { historyStartDate, elapsedEndDate } = getTwoMonthHistoryWindow(startDate, referenceDate);

    const [{ data: areas, error: aErr }, { data: shifts, error: sErr }, { data: positions, error: pErr }] =
      await Promise.all([
        supabase.from('areas').select('id, name'),
        supabase.from('shifts').select('id, name, start_time, end_time'),
        supabase.from('positions').select('id, name'),
      ]);

    if (aErr || sErr || pErr) {
      return {
        success: false,
        proposal: null,
        error: aErr?.message || sErr?.message || pErr?.message || 'Error cargando catálogos HRM',
      };
    }

    const blueArea = (areas || []).find((a: any) => /blue/i.test(a.name || ''));
    const am00Shift = (shifts || []).find(
      (s: any) => /am\s*00/i.test(s.name || '') || String(s.start_time || '').startsWith('00:')
    );
    const conductorPos = (positions || []).find((p: any) => /conductor/i.test(p.name || ''));
    const ayudantePos = (positions || []).find((p: any) => /ayudante/i.test(p.name || ''));

    if (!blueArea || !am00Shift || !conductorPos || !ayudantePos) {
      return {
        success: false,
        proposal: null,
        error: `No se pudieron identificar todos los registros de Blue Express AM 00 (área=${blueArea ? 'OK' : 'faltante'}, turno AM 00=${am00Shift ? 'OK' : 'faltante'}, conductor=${conductorPos ? 'OK' : 'faltante'}, ayudante=${ayudantePos ? 'OK' : 'faltante'}).`,
      };
    }

    const [histAssigns, histReqs, targetReqs] = await Promise.all([
      fetchAllPaginated<any>(async (from, to) =>
        supabase
          .from('shift_assignments')
          .select('id, date, area_id, position_id, shift_id, personnel_id, status, is_extra, attendance_status')
          .eq('area_id', blueArea.id)
          .eq('shift_id', am00Shift.id)
          .gte('date', historyStartDate)
          .lte('date', elapsedEndDate)
          .order('date', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ),
      fetchAllPaginated<any>(async (from, to) =>
        supabase
          .from('shift_requirements')
          .select('id, date, area_id, position_id, shift_id, required_count, is_extra')
          .eq('area_id', blueArea.id)
          .eq('shift_id', am00Shift.id)
          .gte('date', historyStartDate)
          .lte('date', elapsedEndDate)
          .order('date', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ),
      fetchAllPaginated<any>(async (from, to) =>
        supabase
          .from('shift_requirements')
          .select('id, date, area_id, position_id, shift_id, required_count, is_extra')
          .eq('area_id', blueArea.id)
          .eq('shift_id', am00Shift.id)
          .eq('is_extra', false)
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ),
    ]);

    if (histAssigns.error || !histAssigns.data || histReqs.error || !histReqs.data || targetReqs.error || !targetReqs.data) {
      return {
        success: false,
        proposal: null,
        error:
          histAssigns.error ||
          histReqs.error ||
          targetReqs.error ||
          'Error cargando historial de Blue Express AM 00.',
      };
    }

    const proposal = calculateBlueExpressNightStaffingProposal({
      identifiers: {
        areaId: blueArea.id,
        areaName: blueArea.name,
        shiftId: am00Shift.id,
        shiftName: am00Shift.name,
        conductorPositionId: conductorPos.id,
        conductorPositionName: conductorPos.name,
        ayudantePositionId: ayudantePos.id,
        ayudantePositionName: ayudantePos.name,
      },
      targetStartDate: startDate,
      targetEndDate: endDate,
      referenceDate,
      historyAssignments: histAssigns.data,
      historyRequirements: histReqs.data,
      targetExistingRequirements: targetReqs.data,
    });

    return { success: true, proposal, error: null };
  } catch (err) {
    return {
      success: false,
      proposal: null,
      error: err instanceof Error ? err.message : 'Error calculando propuesta Blue Express AM 00',
    };
  }
}

/**
 * ROSTER-09: Aplica la propuesta aprobada de Blue Express AM 00 (Conductor Camion y Ayudante)
 * a los cupos ordinarios (`is_extra = false`) del rango, conservando turnos diurnos y extras.
 */
export async function applyBlueExpressNightStaffingProposal(
  startDate: string,
  endDate: string,
  approvedByWeekday?: Record<number, number>
): Promise<{ success: boolean; upsertedCount: number; proposal: BlueExpressNightProposal | null; error: string | null }> {
  try {
    const auth = await requireActionAuth({ roles: ['ADMIN', 'SUPERVISOR'] });
    if (!auth.ok) {
      return { success: false, upsertedCount: 0, proposal: null, error: auth.error };
    }

    let validatedApproved: Record<number, number> | undefined;
    if (approvedByWeekday) {
      const check = validateApprovedTrucksByWeekday(approvedByWeekday);
      if (!check.ok) {
        return { success: false, upsertedCount: 0, proposal: null, error: check.error };
      }
      validatedApproved = check.normalized;
    }

    const preview = await previewBlueExpressNightStaffing(startDate, endDate);
    if (!preview.success || !preview.proposal) {
      return {
        success: false,
        upsertedCount: 0,
        proposal: null,
        error: preview.error || 'No se pudo calcular la propuesta Blue Express AM 00.',
      };
    }

    const rows = buildBlueExpressApplyPlan(preview.proposal, validatedApproved);
    const supabase = createAdminClient();
    let upsertedCount = 0;
    const CHUNK_SIZE = 200;

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { data, error } = await supabase
        .from('shift_requirements')
        .upsert(chunk, {
          onConflict: 'area_id,position_id,shift_id,date,is_extra',
          ignoreDuplicates: false,
        })
        .select('id');

      if (error) {
        return {
          success: false,
          upsertedCount,
          proposal: preview.proposal,
          error: error.message,
        };
      }
      upsertedCount += data?.length || chunk.length;
    }

    if (process.env.ROSTER_ISOLATED_TEST !== 'true') {
      revalidatePath('/shifts/dotacion');
      revalidatePath('/shifts/requirements');
      revalidatePath('/shifts/daily');
    }

    return {
      success: true,
      upsertedCount,
      proposal: preview.proposal,
      error: null,
    };
  } catch (err) {
    return {
      success: false,
      upsertedCount: 0,
      proposal: null,
      error: err instanceof Error ? err.message : 'Error aplicando dotación Blue Express AM 00',
    };
  }
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
      // was_published captures whether the assignment was already published at the
      // time of the manual change. publishAssignments uses this flag to decide
      // whether to send a WhatsApp notification: only published assignments that
      // were later changed manually should trigger an alert.
      // Non-fatal: if roster_audit_logs table doesn't exist yet, we continue.
      try {
        await supabase.from('roster_audit_logs').insert({
          assignment_id: existing.id,
          personnel_id: personnelId,
          date: date,
          previous_shift_id: existing.shift_id,
          new_shift_id: shiftId,
          was_published: existing.is_published === true,
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

      // Clean up obsolete pending transport requests for this assignment
      await supabase
        .from('transport_requests')
        .delete()
        .eq('assignment_id', existing.id)
        .eq('status', 'ABIERTO');

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

      // Log the insertion (Libre → new shift). Since there was no prior assignment,
      // was_published is always false: a brand-new slot has never been published.
      // Non-fatal: if roster_audit_logs table doesn't exist yet, we continue.
      try {
        await supabase.from('roster_audit_logs').insert({
          assignment_id: newAsg.id,
          personnel_id: personnelId,
          date: date,
          previous_shift_id: null,
          new_shift_id: shiftId,
          was_published: false,
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
  revalidatePath('/transport');
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

export async function publishAssignments(input: string | string[], endDate?: string, areaId?: string, options?: { skipWhatsApp?: boolean }) {
  if (!await isAdmin()) return { success: false, error: 'No authorized' };
  // Use the admin client (service role) for all DB operations in this function.
  // Auth is already verified above via isAdmin(). The service role bypasses RLS,
  // which is necessary because the anon-key client is blocked by RLS policies
  // on shift_assignments and roster_audit_logs.
  const supabase = createAdminClient();
  
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

  // Guard: Supabase returns 400 Bad Request for .in('id', []) with an empty array
  if (Array.isArray(input) && input.length === 0) {
    return { success: true, notifiedWorkers: [], skippedWorkers: [], failedWorkers: [] };
  }

  // ── Helper: chunk array into batches to avoid PostgREST URL-length limits ──
  const CHUNK_SIZE = 200;
  function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
  }

  // 1. Fetch assignments that are about to be published (were not published before)
  //    When input is a large ID array, split into chunks to avoid URL length limits.
  let assignmentsToPublish: { id: string; date: string; personnel_id: string; shift_id: string; area_id: string; position_id: string }[] = [];

  if (Array.isArray(input)) {
    const idChunks = chunkArray(input, CHUNK_SIZE);
    for (const chunk of idChunks) {
      const { data, error: selectError } = await supabase
        .from('shift_assignments')
        .select('id, date, personnel_id, shift_id, area_id, position_id')
        .eq('is_published', false)
        .in('id', chunk);
      if (selectError) {
        console.error('[publishAssignments] SELECT chunk error:', JSON.stringify(selectError));
        return { success: false, error: `SELECT falló: ${selectError.message}` };
      }
      if (data) assignmentsToPublish.push(...data);
    }
  } else if (typeof input === 'string' && endDate) {
    const { data, error: selectError } = await supabase
      .from('shift_assignments')
      .select('id, date, personnel_id, shift_id, area_id, position_id')
      .eq('is_published', false)
      .gte('date', input)
      .lte('date', endDate)
      .eq('area_id', areaId ?? '');
    if (selectError) {
      console.error('[publishAssignments] SELECT date-range error:', JSON.stringify(selectError));
      return { success: false, error: `SELECT falló: ${selectError.message}` };
    }
    if (data) assignmentsToPublish = data;
  } else {
    return { success: false, error: 'Parámetros inválidos' };
  }

  // 2. Perform the update in chunks to avoid URL-length limits
  if (Array.isArray(input)) {
    const idChunks = chunkArray(input, CHUNK_SIZE);
    for (const chunk of idChunks) {
      const { error, status } = await supabase
        .from('shift_assignments')
        .update({ is_published: true })
        .in('id', chunk);
      if (error) {
        console.error('[publishAssignments] UPDATE chunk error:', JSON.stringify(error), 'status:', status);
        return { success: false, error: `UPDATE falló (${status}): ${error.message}` };
      }
    }
  } else if (typeof input === 'string' && endDate) {
    let updateQuery = supabase.from('shift_assignments').update({ is_published: true })
      .gte('date', input).lte('date', endDate);
    if (areaId) updateQuery = updateQuery.eq('area_id', areaId);
    const { error, status } = await updateQuery;
    if (error) {
      console.error('[publishAssignments] UPDATE date-range error:', JSON.stringify(error), 'status:', status);
      return { success: false, error: `UPDATE falló (${status}): ${error.message}` };
    }
  }

  // 3. Trigger WhatsApp notifications for actual shift changes
  const notifiedWorkers: string[] = [];
  const skippedWorkers: string[] = [];  // no phone number
  const failedWorkers: string[] = [];   // API error

  if (!options?.skipWhatsApp && assignmentsToPublish && assignmentsToPublish.length > 0) {
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
      // Only notify when the assignment was ALREADY published before the manual change
      // (was_published = true in the audit log). First-time publications never send alerts.
      // FALLBACK: if audit logs are unavailable, send nothing (safe default).
      let changedAssignments: typeof assignmentsToPublish;

      if (latestAuditMap.size > 0) {
        // Primary path: only assignments whose audit log shows was_published = true
        // AND the shift actually changed (previous_shift_id !== current shift_id)
        // Skip past or today's dates in Santiago time to prevent sending WhatsApp notifications.
        const chileTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Santiago" }));
        const todayStr = format(chileTime, 'yyyy-MM-dd');

        changedAssignments = assignmentsToPublish.filter(a => {
          const key = `${a.personnel_id}_${a.date}`;
          const log = latestAuditMap.get(key);
          const isPastOrToday = a.date <= todayStr;
          return log && log.was_published === true && log.previous_shift_id !== a.shift_id && !isPastOrToday;
        });
      } else {
        // Fallback: audit logs unavailable → do not send any notifications
        // (safer than notifying workers for first-time publications)
        changedAssignments = [];
        console.log('[publishAssignments] Fallback: audit_logs unavailable, skipping WhatsApp notifications.');
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
        const chileTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Santiago" }));
        const todayStr = format(chileTime, 'yyyy-MM-dd');

        // Skip notification if the old date or new date is in the past or today
        if (current.date <= todayStr || newDate <= todayStr) {
          console.log(`[moveAssignment] Skipping WhatsApp notification for date move (${current.date} -> ${newDate}) because it is past or today.`);
          return;
        }

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

  // Clean up pending transport requests for this deleted assignment
  await supabase
    .from('transport_requests')
    .delete()
    .eq('assignment_id', id)
    .eq('status', 'ABIERTO');

  // 2. If it was published, notify the worker immediately of the change to Libre
  if (current && current.is_published && current.personnel?.phone) {
    (async () => {
      try {
        const chileTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Santiago" }));
        const todayStr = format(chileTime, 'yyyy-MM-dd');

        // Skip notification if the deleted assignment date is in the past or today
        if (current.date <= todayStr) {
          console.log(`[deleteAssignment] Skipping WhatsApp notification for deleted assignment on ${current.date} because it is past or today.`);
          return;
        }

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
  revalidatePath('/transport');
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

  await supabase
    .from('transport_requests')
    .delete()
    .eq('personnel_id', personnelId)
    .in('date', dates)
    .eq('status', 'ABIERTO');

  revalidatePath('/shifts/assignments');
  revalidatePath('/shifts/roster');
  revalidatePath('/shifts/daily');
  revalidatePath('/transport');
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

  await supabase
    .from('transport_requests')
    .delete()
    .in('assignment_id', ids)
    .eq('status', 'ABIERTO');
  
  revalidatePath('/shifts/assignments');
  revalidatePath('/shifts/roster');
  revalidatePath('/shifts/daily');
  revalidatePath('/transport');
  return { success: true };
}
// ─── Scheduling Engine Actions ────────────────────────────────────────────────

async function buildMonthlyAuditSummary(
  supabase: any,
  targetIds: string[],
  monthStart: Date,
  monthEnd: Date
) {
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');
  const monthEndStr = format(monthEnd, 'yyyy-MM-dd');

  // 1. Obtener datos de este personal
  const { data: personnelData } = await supabase
    .from('personnel')
    .select('id, first_name, last_name_father, rotation_pattern')
    .in('id', targetIds);

  // 2. Obtener asignaciones del mes
  const { data: allAssignments } = await supabase
    .from('shift_assignments')
    .select('*')
    .in('personnel_id', targetIds)
    .gte('date', monthStartStr)
    .lte('date', monthEndStr);

  // 3. Obtener licencias y permisos aprobados
  const { data: allLeaves } = await supabase
    .from('leaves')
    .select('*')
    .in('personnel_id', targetIds)
    .eq('status', 'approved')
    .lte('start_date', monthEndStr)
    .gte('end_date', monthStartStr);

  // 4. Definir las semanas naturales del mes (Lunes a Domingo)
  const weeksList: string[] = [];
  let currW = startOfWeek(monthStart, { weekStartsOn: 1 });
  for (let i = 0; i < 6; i++) {
    const wLabel = format(currW, 'dd/MM');
    weeksList.push(wLabel);
    currW = new Date(currW.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (currW > monthEnd && i >= 3) break; 
  }

  const monthSundays = eachDayOfInterval({ start: monthStart, end: monthEnd }).filter(d => d.getDay() === 0);

  return (personnelData || []).map((p: any) => {
    const pLeaves = (allLeaves || []).filter((l: any) => l.personnel_id === p.id);
    const leaveDates = new Set<string>();
    pLeaves.forEach((l: any) => {
      try {
        const lStart = parseISO(l.start_date);
        const lEnd = parseISO(l.end_date);
        const clipStart = lStart < monthStart ? monthStart : lStart;
        const clipEnd = lEnd > monthEnd ? monthEnd : lEnd;
        if (clipStart <= clipEnd) {
          eachDayOfInterval({ start: clipStart, end: clipEnd }).forEach(d => {
            leaveDates.add(format(d, 'yyyy-MM-dd'));
          });
        }
      } catch (e) {
        console.error('[Audit] Error al procesar rango de licencia:', e);
      }
    });

    // Solo turnos efectivamente trabajados: excluye cancelados/ausencias y días con permiso/licencia aprobada
    const pAssignments = (allAssignments || []).filter((a: any) => 
      a.personnel_id === p.id && 
      a.status !== 'cancelled' && 
      !leaveDates.has(a.date)
    );

    const weekCounts: Record<string, number> = {};
    weeksList.forEach(w => (weekCounts[w] = 0));

    pAssignments.forEach((a: any) => {
      const d = parseISO(a.date);
      const w = format(startOfWeek(d, { weekStartsOn: 1 }), 'dd/MM');
      if (weekCounts.hasOwnProperty(w)) weekCounts[w]++;
    });

    let sundaysOff = 0;
    monthSundays.forEach(sun => {
      const dStr = format(sun, 'yyyy-MM-dd');
      if (!pAssignments.some((a: any) => a.date === dStr)) sundaysOff++;
    });

    return {
      personId: p.id,
      personName: `${p.first_name} ${p.last_name_father}`,
      pattern: p.rotation_pattern || '5x2',
      weekCounts,
      sundaysOff
    };
  });
}

export async function runScheduler(startDate: string, endDate: string, areaId?: string, personnelIds?: string[], positionFilter?: string | string[], shouldValidate: boolean = false) {
  try {
    // Extend end date to the end of the current week (Sunday) to ensure full week analysis
    const end = parseISO(endDate);
    const extendedEnd = format(endOfWeek(end, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const result = await generateSchedule(startDate, extendedEnd, areaId, personnelIds, positionFilter, shouldValidate);
    
    // CONFIGURACIÓN DE RANGO MENSUAL
    const sDate = parseISO(startDate);
    const monthStart = startOfMonth(sDate);
    const monthEnd = endOfMonth(sDate);

    const supabase = await createClient();

    // 1. Obtener la lista de IDs de personal a auditar
    let targetIds = personnelIds || [];
    if (targetIds.length === 0) {
      let pQuery = supabase.from('personnel').select('id');
      if (areaId && areaId !== 'all') pQuery = pQuery.eq('area_id', areaId);
      if (positionFilter) {
        if (Array.isArray(positionFilter)) {
          if (positionFilter.length > 0) {
            const filters = positionFilter.map(pf => `main_position_name.ilike.%${pf}%`).join(',');
            pQuery = pQuery.or(filters);
          }
        } else if (positionFilter !== 'none') {
          pQuery = pQuery.ilike('main_position_name', `%${positionFilter}%`);
        }
      }
      const { data: pData } = await pQuery;
      targetIds = (pData || []).map(p => p.id);
    }

    // 2. Construir el resumen de auditoría
    const auditSummary = await buildMonthlyAuditSummary(supabase, targetIds, monthStart, monthEnd);

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

/**
 * ROSTER-06: Read-only side-by-side preview comparison of v1 (default) vs v2 (parallel).
 * Never writes to the database and never calls `generateSchedule`.
 */
export async function previewCompareSchedulers(
  startDate: string,
  endDate: string,
  areaId?: string,
  personnelIds?: string[],
  positionFilter?: string | string[]
) {
  try {
    const auth = await requireActionAuth({ permission: 'runScheduler' });
    if (!auth.ok) {
      return { success: false, comparison: null, error: auth.error };
    }

    const supabase = createAdminClient();
    const sDate = parseISO(startDate);
    const eDate = parseISO(endDate);

    // Load full calendar month(s) + 14d lookback / 7d lookahead for weeks, Sundays, streaks, and 12h rests
    const monthBoundStart = format(startOfMonth(sDate), 'yyyy-MM-dd');
    const weekLookbackStart = format(startOfWeek(subDays(sDate, 14), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const extendedStart = monthBoundStart < weekLookbackStart ? monthBoundStart : weekLookbackStart;

    const monthBoundEnd = format(endOfMonth(eDate), 'yyyy-MM-dd');
    const weekLookaheadEnd = format(endOfWeek(addDays(eDate, 7), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const extendedEnd = monthBoundEnd > weekLookaheadEnd ? monthBoundEnd : weekLookaheadEnd;

    const [
      reqRes,
      persRes,
      posRes,
      shiftRes,
      areaRes,
      assRes,
      leaveRes,
    ] = await Promise.all([
      fetchAllPaginated<any>(async (from, to) =>
        await supabase
          .from('shift_requirements')
          .select('*, shift:shifts(name, start_time, end_time, duration_hours, requires_transport), area:areas(name), positions(name)')
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ),
      supabase.from('personnel').select('*').eq('is_active', true),
      supabase.from('positions').select('*'),
      supabase.from('shifts').select('*'),
      supabase.from('areas').select('id, name'),
      fetchAllPaginated<any>(async (from, to) =>
        await supabase
          .from('shift_assignments')
          .select('*, shift:shifts!shift_id(name, start_time, end_time, duration_hours)')
          .gte('date', extendedStart)
          .lte('date', extendedEnd)
          .order('date', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ),
      fetchAllPaginated<any>(async (from, to) =>
        await supabase
          .from('leaves')
          .select('*')
          .eq('status', 'approved')
          .lte('start_date', extendedEnd)
          .gte('end_date', extendedStart)
          .order('start_date', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ),
    ]);

    const queryErrors = [
      reqRes.error && `shift_requirements: ${reqRes.error}`,
      persRes.error && `personnel: ${persRes.error.message}`,
      posRes.error && `positions: ${posRes.error.message}`,
      shiftRes.error && `shifts: ${shiftRes.error.message}`,
      areaRes.error && `areas: ${areaRes.error.message}`,
      assRes.error && `shift_assignments: ${assRes.error}`,
      leaveRes.error && `leaves: ${leaveRes.error}`,
    ].filter(Boolean);

    if (queryErrors.length > 0) {
      return {
        success: false,
        comparison: null,
        error: `Error al cargar datos para vista previa (${queryErrors.join(' | ')})`,
      };
    }

    const rawRequirements = reqRes.data || [];
    const personnelRaw = persRes.data || [];
    const positions = posRes.data || [];
    const allShifts = shiftRes.data || [];
    const areas = areaRes.data || [];
    const existingAssignments = assRes.data || [];
    const leaves = leaveRes.data || [];

    const unconfirmedRules: string[] = [];
    const areaNameById = new Map<string, string>(areas.map((a) => [a.id, a.name]));
    const positionNameById = new Map<string, string>(positions.map((p) => [p.id, p.name]));
    const blueAreaId = areas.find((a) => (a.name || '').toLowerCase().includes('blue'))?.id || '';

    const rawPosFilters = Array.isArray(positionFilter)
      ? positionFilter
      : positionFilter && positionFilter !== 'none'
        ? [positionFilter]
        : [];
    const targetPositionIds =
      rawPosFilters.length > 0
        ? positions
            .filter((pos) =>
              rawPosFilters.some((f) => (pos.name || '').toLowerCase().includes(f.trim().toLowerCase()))
            )
            .map((pos) => pos.id)
        : null;

    const activePersonnel = personnelRaw.filter((p) => {
      if (p.requires_shifts === false) return false;
      const mainPos = positions.find((pos) => pos.id === p.main_position);
      if (mainPos && mainPos.requires_shifts === false) return false;
      if (personnelIds && personnelIds.length > 0 && !personnelIds.includes(p.id)) return false;
      return true;
    });

    const personnelProfiles = activePersonnel.map((p) => {
      const mainPos = positions.find((pos) => pos.id === p.main_position);
      return {
        personnel_id: p.id,
        first_name: p.first_name,
        main_position: p.main_position,
        main_position_name: mainPos?.name,
        secondary_positions: p.secondary_positions || [],
        rotation_pattern: p.rotation_pattern,
        has_special_contract: Boolean(p.has_special_contract),
        fixed_shift_id: p.fixed_shift_id,
        area_id: mainPos?.area_id || '',
        prefers_night: Boolean(p.prefers_night),
        avoids_night: Boolean(p.avoids_night),
      };
    });

    // Build NS22 config for v2 from DB metadata + record unconfirmed items
    const norm = (v?: string | null) =>
      (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const aeroArea = areas.find((a) => norm(a.name).includes('AEROPUERTO'));
    const aeroPos = positions.find((p) => norm(p.name).includes('AEROPUERTO'));
    const ns22Shift = allShifts.find(
      (s) => norm(s.name).includes('NS 22') || (s.start_time || '').startsWith('22:00')
    );

    const aero4x4Workers = activePersonnel.filter((p) => {
      const mainPos = positions.find((pos) => pos.id === p.main_position);
      return (
        norm(p.rotation_pattern).includes('4X4') &&
        norm(mainPos?.name).includes('AEROPUERTO')
      );
    });

    let ns22Config: {
      titulares: Array<{
        personnel_id: string;
        first_name?: string;
        anchor_date: string;
        cycle_offset?: number;
        confirmed_4x4_regime?: boolean;
      }>;
      shiftDef: {
        shift_id: string;
        area_id: string;
        position_id: string;
        shift_start?: string;
        shift_end?: string;
        duration_hours?: number;
      };
    } | null = null;

    if (aeroArea && aeroPos && ns22Shift && aero4x4Workers.length === 2) {
      const preStartDt = subDays(sDate, 1);
      const extStartDt = parseISO(extendedStart);
      const observedWindowDates =
        extStartDt <= preStartDt
          ? eachDayOfInterval({ start: extStartDt, end: preStartDt }).map((d) =>
              format(d, 'yyyy-MM-dd')
            )
          : [];

      const titulares = aero4x4Workers.map((w) => {
        const pastNs22 = existingAssignments
          .filter(
            (a: any) =>
              a.personnel_id === w.id &&
              a.shift_id === ns22Shift.id &&
              a.status !== 'cancelled' &&
              String(a.date).split('T')[0] < startDate
          )
          .map((a: any) => String(a.date).split('T')[0]);

        const personLeaveDates = new Set<string>();
        for (const l of leaves as any[]) {
          if (l.personnel_id !== w.id || l.status !== 'approved') continue;
          const ls = parseISO(String(l.start_date).split('T')[0]);
          const le = parseISO(String(l.end_date).split('T')[0]);
          if (!isNaN(ls.getTime()) && !isNaN(le.getTime()) && ls <= le) {
            for (const d of eachDayOfInterval({ start: ls, end: le })) {
              personLeaveDates.add(format(d, 'yyyy-MM-dd'));
            }
          }
        }

        const resolved = deriveNs22AnchorFromHistory({
          personnelId: w.id,
          firstName: w.first_name,
          confirmedAnchorDate: (w as any).ns22_anchor_date ?? null,
          observedNs22Dates: pastNs22,
          observedWindowDates,
          leaveDates: personLeaveDates,
        });

        if (resolved.notice) {
          unconfirmedRules.push(resolved.notice);
        }

        return {
          personnel_id: w.id,
          first_name: w.first_name,
          anchor_date: resolved.anchor_date,
          cycle_offset: resolved.cycle_offset,
          confirmed_4x4_regime: false,
        };
      });

      ns22Config = {
        titulares,
        shiftDef: {
          shift_id: ns22Shift.id,
          area_id: aeroArea.id,
          position_id: aeroPos.id,
          shift_start: ns22Shift.start_time,
          shift_end: ns22Shift.end_time,
          duration_hours: resolveShiftDurationHours(ns22Shift).hours,
        },
      };
    } else {
      unconfirmedRules.push(
        `Regla NS22 4x4 sin evaluar completamente en vista previa (área=${aeroArea ? 'OK' : 'faltante'}, cargo=${aeroPos ? 'OK' : 'faltante'}, turno NS22=${ns22Shift ? 'OK' : 'faltante'}, titulares 4x4=${aero4x4Workers.length}).`
      );
    }

    // Build reinforcement rules: Airport AM07 Mon-Fri + Bodegas AM04 in enabled Bodegas
    const reinforcementConfig: Record<string, any> = {};
    const am07Shift = allShifts.find(
      (s) => norm(s.name).includes('AM 07') || (s.start_time || '').startsWith('07:00')
    );
    const am04Shift = allShifts.find(
      (s) => norm(s.name).includes('AM 04') || (s.start_time || '').startsWith('04:00')
    );

    if (aeroPos && aeroArea && am07Shift) {
      reinforcementConfig[aeroPos.id] = {
        shift_id: am07Shift.id,
        shift_start: am07Shift.start_time,
        shift_end: am07Shift.end_time,
        duration_hours: Number(am07Shift.duration_hours) || 8,
        area_id: aeroArea.id,
        position_id: aeroPos.id,
        days_of_week: [1, 2, 3, 4, 5],
      };
    } else {
      unconfirmedRules.push('Refuerzo Aeropuerto AM07 (L-V) sin evaluar: falta turno AM07 o catálogo de Aeropuerto.');
    }

    const bodegaPositions = positions.filter((p) => {
      const pn = norm(p.name);
      return pn.includes('BODEGA') || pn.includes('FEDEX') || pn.includes('DHL');
    });
    if (am04Shift && bodegaPositions.length > 0) {
      for (const bp of bodegaPositions) {
        if (!bp.area_id) continue;
        reinforcementConfig[bp.id] = {
          shift_id: am04Shift.id,
          shift_start: am04Shift.start_time,
          shift_end: am04Shift.end_time,
          duration_hours: Number(am04Shift.duration_hours) || 8,
          area_id: bp.area_id,
          position_id: bp.id,
        };
      }
    } else {
      unconfirmedRules.push('Refuerzo Bodegas AM04 sin evaluar: falta turno AM04 o cargos de Bodega.');
    }

    // Build base calendar per person from existing non-extra assignments in range
    const baseCalendarByPerson = new Map<string, Set<string>>();
    for (const a of existingAssignments as any[]) {
      if (a.status === 'cancelled' || a.is_extra) continue;
      const d = String(a.date).split('T')[0];
      if (!baseCalendarByPerson.has(a.personnel_id)) {
        baseCalendarByPerson.set(a.personnel_id, new Set<string>());
      }
      baseCalendarByPerson.get(a.personnel_id)!.add(d);
    }

    const comparison = compareEnginesPreview({
      startDate,
      endDate,
      rawRequirements: rawRequirements as any,
      existingAssignments: existingAssignments.map((a: any) => ({
        ...a,
        shift_start: a.shift?.start_time,
        shift_end: a.shift?.end_time,
        duration_hours: a.shift?.duration_hours,
      })),
      personnel: personnelProfiles,
      approvedLeaves: leaves as any,
      allShifts: allShifts as any,
      blueAreaId,
      areaFilter: areaId && areaId !== 'all' ? areaId : null,
      positionFilter: targetPositionIds,
      ns22Config,
      reinforcementConfig,
      areaNameById,
      positionNameById,
      baseCalendarByPerson,
      unconfirmedRules,
    });

    return { success: true, comparison, error: null };
  } catch (err) {
    return {
      success: false,
      comparison: null,
      error: err instanceof Error ? err.message : 'Preview comparison failed',
    };
  }
}

function safeRevalidateRosterPaths() {
  if (process.env.ROSTER_ISOLATED_TEST === 'true') return;
  revalidatePath('/shifts/assignments');
  revalidatePath('/shifts/roster');
  revalidatePath('/shifts/daily');
}

/**
 * ROSTER-07: Guardado operativo de `v2` con respaldo previo, transacción y bloqueo por falta de confirmación NS22.
 * Deshabilitado por defecto (`ROSTER_V2_SAVE_ENABLED !== 'true'`) hasta aprobación expresa.
 */
export async function runSchedulerV2(params: {
  startDate: string;
  endDate: string;
  areaId?: string;
  personnelIds?: string[];
  positionFilter?: string | string[];
  shouldValidate?: boolean;
  ns22Confirmation?: Ns22OperationalConfirmation | null;
  expectedBaselineAt?: string | null;
  expectedBaselineHash?: string | null;
  testHooks?: {
    supabase?: SupabaseLikeClient;
    authOk?: boolean;
  };
}) {
  try {
    const isIsolatedTest = process.env.ROSTER_ISOLATED_TEST === 'true' && Boolean(params.testHooks?.supabase);
    if (!isIsolatedTest) {
      const auth = await requireActionAuth({ permission: 'runScheduler' });
      if (!auth.ok) {
        return { success: false, rolledBack: false, snapshotId: null, error: auth.error };
      }
    } else if (params.testHooks?.authOk === false) {
      return { success: false, rolledBack: false, snapshotId: null, error: 'No autorizado.' };
    }

    if (!isV2SaveEnabled()) {
      return {
        success: false,
        rolledBack: false,
        snapshotId: null,
        error:
          'El guardado operativo de v2 está deshabilitado hasta aprobación expresa de ROSTER-07. v1 sigue siendo el motor predeterminado.',
      };
    }

    const gate = validateNs22OperationalConfig(params.ns22Confirmation);
    if (!gate.ok || !params.ns22Confirmation) {
      return {
        success: false,
        rolledBack: false,
        snapshotId: null,
        error: `Guardado operativo v2 bloqueado: ${gate.unconfirmedReasons.join(' ')}`,
        unconfirmedReasons: gate.unconfirmedReasons,
      };
    }

    const supabase: any = isIsolatedTest ? params.testHooks!.supabase : createAdminClient();
    const sDate = parseISO(params.startDate);
    const eDate = parseISO(params.endDate);

    const monthBoundStart = format(startOfMonth(sDate), 'yyyy-MM-dd');
    const weekLookbackStart = format(startOfWeek(subDays(sDate, 14), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const extendedStart = monthBoundStart < weekLookbackStart ? monthBoundStart : weekLookbackStart;

    const monthBoundEnd = format(endOfMonth(eDate), 'yyyy-MM-dd');
    const weekLookaheadEnd = format(endOfWeek(addDays(eDate, 7), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const extendedEnd = monthBoundEnd > weekLookaheadEnd ? monthBoundEnd : weekLookaheadEnd;

    const [
      { data: personnelRaw, error: persErr },
      { data: positions, error: posErr },
      { data: allShifts, error: shiftErr },
      { data: areas, error: areaErr },
    ] = await Promise.all([
      supabase.from('personnel').select('*').eq('is_active', true),
      supabase.from('positions').select('*'),
      supabase.from('shifts').select('*'),
      supabase.from('areas').select('id, name'),
    ]);

    if (persErr || posErr || shiftErr || areaErr) {
      const msg = persErr?.message || posErr?.message || shiftErr?.message || areaErr?.message || 'Error cargando catálogos';
      return { success: false, rolledBack: false, snapshotId: null, error: msg };
    }

    const [reqPaged, assignPaged, leavePaged] = await Promise.all([
      fetchAllPaginated<any>((from, to) =>
        supabase
          .from('shift_requirements')
          .select('id, date, area_id, position_id, shift_id, required_count, is_extra, priority')
          .gte('date', extendedStart)
          .lte('date', extendedEnd)
          .order('date', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ),
      fetchAllPaginated<any>((from, to) =>
        supabase
          .from('shift_assignments')
          .select('*, shift:shifts!shift_assignments_shift_id_fkey(name, start_time, end_time, duration_hours)')
          .gte('date', extendedStart)
          .lte('date', extendedEnd)
          .order('date', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ),
      fetchAllPaginated<any>((from, to) =>
        supabase
          .from('leaves')
          .select('*')
          .eq('status', 'approved')
          .lte('start_date', extendedEnd)
          .gte('end_date', extendedStart)
          .order('start_date', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ),
    ]);

    if (reqPaged.error || !reqPaged.data || assignPaged.error || !assignPaged.data || leavePaged.error || !leavePaged.data) {
      return {
        success: false,
        rolledBack: false,
        snapshotId: null,
        error: reqPaged.error || assignPaged.error || leavePaged.error || 'Error cargando datos paginados.',
      };
    }

    const posById = new Map((positions || []).map((p: any) => [p.id, p]));
    const rawFilters = Array.isArray(params.positionFilter)
      ? params.positionFilter
      : params.positionFilter && params.positionFilter !== 'none'
        ? [params.positionFilter]
        : [];
    const targetPositionIds: string[] = [];
    if (rawFilters.length > 0) {
      for (const pos of positions || []) {
        const pname = (pos.name || '').toLowerCase();
        if (rawFilters.some((f) => pname.includes(f.trim().toLowerCase()))) {
          targetPositionIds.push(pos.id);
        }
      }
    }

    const personnelProfiles = (personnelRaw || [])
      .filter((p: any) => {
        if (p.requires_shifts === false) return false;
        const mainPos = posById.get(p.main_position) as any;
        if (mainPos && mainPos.requires_shifts === false) return false;
        if (params.personnelIds && params.personnelIds.length > 0 && !params.personnelIds.includes(p.id)) {
          return false;
        }
        return true;
      })
      .map((p: any) => ({
        personnel_id: p.id,
        first_name: p.first_name,
        main_position: p.main_position ?? null,
        secondary_positions: Array.isArray(p.secondary_positions) ? p.secondary_positions : [],
        rotation_pattern: p.rotation_pattern ?? null,
        has_special_contract: Boolean(p.has_special_contract),
        confirmed_weekly_limit_hours: p.confirmed_weekly_limit_hours ?? null,
        confirmed_regime: p.confirmed_regime ?? null,
      }));

    const areaNameById = new Map<string, string>((areas || []).map((a: any) => [a.id, a.name]));
    const positionNameById = new Map<string, string>((positions || []).map((p: any) => [p.id, p.name]));

    const aeroArea = (areas || []).find((a: any) => (a.name || '').toLowerCase().includes('aeropuerto'));
    const ns22Shift = (allShifts || []).find(
      (s: any) => (s.name || '').toUpperCase().includes('NS22') || (s.name || '').toUpperCase().includes('NS 22')
    );
    const ns22Pos = (positions || []).find((p: any) => (p.name || '').toLowerCase().includes('operador'));

    const ns22Config =
      aeroArea && ns22Shift && ns22Pos
        ? {
            titulares: params.ns22Confirmation.titulares.map((t) => ({
              personnel_id: t.personnelId,
              first_name: t.name || t.personnelId,
              anchor_date: t.confirmedAnchorDate || params.startDate,
              cycle_offset: 0,
              confirmed_4x4_regime: params.ns22Confirmation!.regimeConfirmed,
            })),
            shiftDef: {
              shift_id: ns22Shift.id,
              area_id: aeroArea.id,
              position_id: ns22Pos.id,
              shift_start: ns22Shift.start_time,
              shift_end: ns22Shift.end_time,
              duration_hours: resolveShiftDurationHours(ns22Shift).hours,
            },
          }
        : undefined;

    const shiftById = new Map((allShifts || []).map((s: any) => [s.id, s]));
    const activeAreaFilter = params.areaId && params.areaId !== 'all' ? params.areaId : null;
    const activePosSet = targetPositionIds.length > 0 ? new Set(targetPositionIds) : null;
    const activePersSet =
      params.personnelIds && params.personnelIds.length > 0 ? new Set(params.personnelIds) : null;

    // Excluir borradores ordinarios reemplazables dentro del alcance para que v2 genere la dotación completa
    const preservedForV2 = assignPaged.data.filter((a: any) => {
      if (a.is_extra) return true;
      const d = String(a.date).split('T')[0];
      const inRange = d >= params.startDate && d <= params.endDate;
      if (!inRange) return true;
      if (activeAreaFilter && a.area_id !== activeAreaFilter) return true;
      if (activePosSet && !activePosSet.has(a.position_id)) return true;
      if (activePersSet && !activePersSet.has(a.personnel_id)) return true;
      return isProtectedPersistedAssignment(a as PersistedAssignmentRow);
    });

    const v2Result = scheduleCrossArea({
      startDate: params.startDate,
      endDate: params.endDate,
      rawRequirements: reqPaged.data.map((r: any) => ({
        ...r,
        shift: r.shift || shiftById.get(r.shift_id) || undefined,
      })),
      existingAssignments: preservedForV2.map((a: any) => ({
        ...a,
        shift_start: a.shift?.start_time,
        shift_end: a.shift?.end_time,
        duration_hours: a.shift?.duration_hours,
      })),
      personnel: personnelProfiles,
      approvedLeaves: leavePaged.data,
      areaFilter: activeAreaFilter,
      positionFilter: targetPositionIds.length > 0 ? targetPositionIds : null,
      ns22Config,
      areaNameById,
      positionNameById,
    });

    const adapter = createSupabaseRosterPersistenceAdapter(supabase);
    const saveRes = await saveV2Schedule(adapter, {
      startDate: params.startDate,
      endDate: params.endDate,
      areaId: params.areaId ?? null,
      personnelIds: params.personnelIds,
      positionIds: targetPositionIds,
      ns22Config: params.ns22Confirmation,
      v2Result,
      shouldValidate: params.shouldValidate,
      expectedBaselineAt: params.expectedBaselineAt ?? null,
      expectedBaselineHash: params.expectedBaselineHash ?? null,
    });

    if (saveRes.success) {
      safeRevalidateRosterPaths();
    }

    return {
      ...saveRes,
      v2Result,
    };
  } catch (err) {
    return {
      success: false,
      rolledBack: false,
      snapshotId: null,
      error: err instanceof Error ? err.message : 'Error ejecutando guardado v2',
    };
  }
}

/**
 * ROSTER-07: Recupera el roster previo desde un respaldo (`roster_v2_snapshots`) sin sobrescribir cambios posteriores.
 */
export async function recoverV2RosterAction(params: {
  snapshotId: string;
  force?: boolean;
  testHooks?: {
    supabase?: SupabaseLikeClient;
    authOk?: boolean;
  };
}) {
  try {
    const isIsolatedTest = process.env.ROSTER_ISOLATED_TEST === 'true' && Boolean(params.testHooks?.supabase);
    if (!isIsolatedTest) {
      const auth = await requireActionAuth({ permission: 'runScheduler' });
      if (!auth.ok) {
        return { success: false, snapshotId: params.snapshotId, error: auth.error };
      }
    } else if (params.testHooks?.authOk === false) {
      return { success: false, snapshotId: params.snapshotId, error: 'No autorizado.' };
    }

    if (!isV2SaveEnabled()) {
      return {
        success: false,
        snapshotId: params.snapshotId,
        error: 'El modo de recuperación v2 está deshabilitado hasta habilitar ROSTER_V2_SAVE_ENABLED=true.',
      };
    }

    const supabase: any = isIsolatedTest ? params.testHooks!.supabase : createAdminClient();
    const adapter = createSupabaseRosterPersistenceAdapter(supabase);
    const result = await recoverRosterFromSnapshot(adapter, params.snapshotId, {
      force: params.force,
    });

    if (result.success) {
      safeRevalidateRosterPaths();
    }
    return result;
  } catch (err) {
    return {
      success: false,
      snapshotId: params.snapshotId,
      error: err instanceof Error ? err.message : 'Error recuperando respaldo v2',
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
  positionFilter?: string | string[],
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
    if (Array.isArray(positionFilter)) {
      if (positionFilter.length > 0) {
        const { data: posList } = await supabase.from('positions').select('id').in('name', positionFilter);
        if (posList && posList.length > 0) {
          query = query.in('position_id', posList.map(p => p.id));
        }
      }
    } else if (positionFilter !== 'none') {
      const { data: pos } = await supabase.from('positions').select('id').eq('name', positionFilter).maybeSingle();
      if (pos) query = query.eq('position_id', pos.id);
    }
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

export async function getMonthlyAudit(startDate: string, areaId?: string, personnelIds?: string[], positionFilter?: string | string[]) {
  try {
    const sDate = parseISO(startDate);
    const monthStart = startOfMonth(sDate);
    const monthEnd = endOfMonth(sDate);

    const supabase = await createClient();

    let targetIds = personnelIds || [];
    if (targetIds.length === 0) {
      let pQuery = supabase.from('personnel').select('id');
      if (areaId && areaId !== 'all') pQuery = pQuery.eq('area_id', areaId);
      if (positionFilter) {
        if (Array.isArray(positionFilter)) {
          if (positionFilter.length > 0) {
            const filters = positionFilter.map(pf => `main_position_name.ilike.%${pf}%`).join(',');
            pQuery = pQuery.or(filters);
          }
        } else if (positionFilter !== 'none') {
          pQuery = pQuery.ilike('main_position_name', `%${positionFilter}%`);
        }
      }
      const { data: pData } = await pQuery;
      targetIds = (pData || []).map(p => p.id);
    }

    const auditSummary = await buildMonthlyAuditSummary(supabase, targetIds, monthStart, monthEnd);

    return { success: true, auditSummary };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Audit failed' };
  }
}
