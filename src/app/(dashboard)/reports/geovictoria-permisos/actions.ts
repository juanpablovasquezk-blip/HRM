'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseISO, eachDayOfInterval, differenceInCalendarDays, format } from 'date-fns';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeoVictoriaPermisoRecord {
  RUT: string;
  'ID Tipo Permiso': number;
  Dia: number;
  Mes: number;
  'Año': number;
  Extension: number;
  Comentario: string;
  'Hora Inicio': string;
  'Hora Fin': string;
  Asignacion: string;
}

export interface PersonnelFilterItem {
  id: string;
  first_name: string;
  last_name_father: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanRut(rut: string | null | undefined): string {
  return (rut || '').replace(/[.\-]/g, '');
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getPersonnelForFilter(): Promise<{ data: PersonnelFilterItem[] }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('personnel')
    .select('id, first_name, last_name_father')
    .eq('is_active', true)
    .order('first_name');
  return { data: (data as PersonnelFilterItem[]) || [] };
}

export async function getGeoVictoriaPermisosData(filters: {
  startDate: string;
  endDate: string;
  onlyNew: boolean;          // true = SOLO CAMBIOS (not yet downloaded)
  personnelIds?: string[];
}): Promise<{ data: GeoVictoriaPermisoRecord[]; leaveIds: string[]; assignmentIds: string[] }> {
  const supabase = await createClient();

  try {
    // -------------------------------------------------------------------
    // 1. Fetch personnel (active, optionally filtered)
    // -------------------------------------------------------------------
    let personnelQuery = supabase
      .from('personnel')
      .select('id, rut')
      .eq('is_active', true);

    if (filters.personnelIds && filters.personnelIds.length > 0) {
      personnelQuery = personnelQuery.in('id', filters.personnelIds);
    }

    const { data: personnelList } = await personnelQuery;
    if (!personnelList || personnelList.length === 0) {
      return { data: [], leaveIds: [], assignmentIds: [] };
    }

    const personnelMap = new Map<string, string>(); // id → rut
    personnelList.forEach(p => personnelMap.set(p.id, p.rut));
    const allPersonnelIds = personnelList.map(p => p.id);

    // Use admin client for all reads to bypass RLS and avoid schema cache issues
    const adminClient = createAdminClient();

    // -------------------------------------------------------------------
    // 2. Source A: approved vacation (-1) and sick (-2) leaves
    // -------------------------------------------------------------------
    let leavesQuery = adminClient
      .from('leaves')
      .select('id, personnel_id, type, start_date, end_date, reason')
      .eq('status', 'approved')
      .in('type', ['vacation', 'sick'])
      .lte('start_date', filters.endDate)
      .gte('end_date', filters.startDate)
      .in('personnel_id', allPersonnelIds);

    if (filters.onlyNew) {
      // Use raw filter for the new column to avoid PostgREST schema-cache issues
      leavesQuery = (leavesQuery as any).is('geov_permisos_downloaded_at', null);
    }

    const { data: leavesRaw, error: leavesError } = await leavesQuery;
    if (leavesError) {
      console.error('[GeoVictoriaPermisos] leaves query error:', leavesError);
    }

    // -------------------------------------------------------------------
    // 3. Source B: manually cancelled assignments (paid leave = -12)
    //    Cancelled assignments that do NOT have a vacation/sick leave
    //    for that person on that same day.
    // -------------------------------------------------------------------

    // First, collect all (personnel_id, date) pairs covered by approved
    // vacation/sick leaves so we can exclude them from the -12 set.
    const { data: allVacSickLeaves } = await adminClient
      .from('leaves')
      .select('personnel_id, start_date, end_date')
      .eq('status', 'approved')
      .in('type', ['vacation', 'sick'])
      .in('personnel_id', allPersonnelIds);

    const leavesDatesSet = new Set<string>(); // "personnelId_yyyy-MM-dd"
    (allVacSickLeaves || []).forEach(l => {
      const start = parseISO(l.start_date);
      const end = parseISO(l.end_date);
      eachDayOfInterval({ start, end }).forEach(day => {
        leavesDatesSet.add(`${l.personnel_id}_${format(day, 'yyyy-MM-dd')}`);
      });
    });

    let assignmentsQuery = adminClient
      .from('shift_assignments')
      .select('id, personnel_id, date')
      .eq('status', 'cancelled')
      .eq('is_extra', false)
      .gte('date', filters.startDate)
      .lte('date', filters.endDate)
      .in('personnel_id', allPersonnelIds);

    if (filters.onlyNew) {
      assignmentsQuery = (assignmentsQuery as any).is('geov_permisos_downloaded_at', null);
    }

    const { data: cancelledAssignments } = await assignmentsQuery;

    // Filter out assignments that are covered by a vacation/sick leave
    const manualCancellations = (cancelledAssignments || []).filter(a => {
      const key = `${a.personnel_id}_${a.date}`;
      return !leavesDatesSet.has(key);
    });

    // -------------------------------------------------------------------
    // 4. Build result rows
    // -------------------------------------------------------------------
    const results: GeoVictoriaPermisoRecord[] = [];
    const leaveIds: string[] = [];
    const assignmentIds: string[] = [];

    // Source A rows (one row per leave)
    (leavesRaw || []).forEach(leave => {
      const rut = cleanRut(personnelMap.get(leave.personnel_id));
      if (!rut) return;

      const startDate = parseISO(leave.start_date);
      const endDate = parseISO(leave.end_date);
      const extension = differenceInCalendarDays(endDate, startDate) + 1;
      const tipoPermiso = leave.type === 'vacation' ? -1 : -2;

      results.push({
        RUT: rut,
        'ID Tipo Permiso': tipoPermiso,
        Dia: startDate.getDate(),
        Mes: startDate.getMonth() + 1,
        'Año': startDate.getFullYear(),
        Extension: extension,
        Comentario: leave.reason || '',
        'Hora Inicio': '',
        'Hora Fin': '',
        Asignacion: '',
      });

      leaveIds.push(leave.id);
    });

    // Source B rows (one row per cancelled assignment day)
    manualCancellations.forEach(assignment => {
      const rut = cleanRut(personnelMap.get(assignment.personnel_id));
      if (!rut) return;

      const day = parseISO(assignment.date);

      results.push({
        RUT: rut,
        'ID Tipo Permiso': -12,
        Dia: day.getDate(),
        Mes: day.getMonth() + 1,
        'Año': day.getFullYear(),
        Extension: 1,
        Comentario: 'Cancelacion de turno',
        'Hora Inicio': '',
        'Hora Fin': '',
        Asignacion: '',
      });

      assignmentIds.push(assignment.id);
    });

    return { data: results, leaveIds, assignmentIds };
  } catch (error) {
    console.error('[GeoVictoriaPermisos] Error generating data:', error);
    return { data: [], leaveIds: [], assignmentIds: [] };
  }
}

/**
 * Mark the given leaves and shift_assignments as downloaded.
 * Called after the Excel file is generated and saved by the user.
 */
export async function markPermisosAsDownloaded(
  leaveIds: string[],
  assignmentIds: string[],
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  try {
    if (leaveIds.length > 0) {
      const { error } = await supabase
        .from('leaves')
        .update({ geov_permisos_downloaded_at: now })
        .in('id', leaveIds);
      if (error) throw new Error(`leaves: ${error.message}`);
    }

    if (assignmentIds.length > 0) {
      const { error } = await supabase
        .from('shift_assignments')
        .update({ geov_permisos_downloaded_at: now })
        .in('id', assignmentIds);
      if (error) throw new Error(`shift_assignments: ${error.message}`);
    }

    return { success: true };
  } catch (err: any) {
    console.error('[GeoVictoriaPermisos] Error marking as downloaded:', err);
    return { success: false, error: err.message };
  }
}
