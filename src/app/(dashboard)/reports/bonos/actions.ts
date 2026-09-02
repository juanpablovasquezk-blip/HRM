'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface BonosReportFilters {
  from: string;
  to: string;
  companyId?: string;
}

export async function getBonosReportData(filters: BonosReportFilters) {
  const supabase = await createClient();

  const { from, to, companyId } = filters;

  // 1. Fetch extra shifts (is_extra = true)
  let queryShifts = supabase
    .from('shift_assignments')
    .select(`
      id,
      date,
      status,
      is_extra,
      paid_month,
      personnel_id,
      personnel:personnel_id (
        id,
        first_name, 
        last_name_father, 
        last_name_mother,
        rut,
        company_id,
        company:companies!personnel_company_id_fkey(name)
      ),
      area:area_id (name),
      position:position_id (name),
      shift:shift_id (name, start_time, end_time)
    `)
    .eq('is_extra', true)
    .neq('status', 'cancelled')
    .or('attendance_status.is.null,attendance_status.neq.absent')
    .gte('date', from)
    .lte('date', to);

  if (companyId) {
    queryShifts = queryShifts.eq('personnel.company_id', companyId);
  }

  const { data: shifts, error: shiftsError } = await queryShifts.order('date', { ascending: true });

  if (shiftsError) {
    console.error('Error fetching shifts for bonos report:', shiftsError);
    return { error: shiftsError.message };
  }

  // 2. Fetch personal transports (transport_type = 'PROPIO')
  let queryTransports = supabase
    .from('transport_requests')
    .select(`
      id,
      date,
      type,
      transport_type,
      paid_month,
      observations,
      personnel_id,
      personnel:personnel_id (
        id,
        first_name, 
        last_name_father, 
        last_name_mother,
        rut,
        company_id,
        company:companies!personnel_company_id_fkey(name)
      ),
      assignment:shift_assignments!transport_requests_assignment_id_fkey (
        id,
        shift:shifts!shift_assignments_shift_id_fkey (name, start_time, end_time),
        area:areas (name),
        position:positions (name)
      )
    `)
    .eq('transport_type', 'PROPIO')
    .gte('date', from)
    .lte('date', to);

  if (companyId) {
    queryTransports = queryTransports.eq('personnel.company_id', companyId);
  }

  const { data: transports, error: transportsError } = await queryTransports.order('date', { ascending: true });

  if (transportsError) {
    console.error('Error fetching transports for bonos report:', transportsError);
    return { error: transportsError.message };
  }

  return {
    shifts: shifts || [],
    transports: transports || []
  };
}

export async function updateShiftPaidMonth(id: string, paidMonth: string | null) {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('shift_assignments')
      .update({ paid_month: paidMonth || null })
      .eq('id', id);

    if (error) {
      console.error('Error updating shift paid month:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateTransportPaidMonth(id: string, paidMonth: string | null) {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('transport_requests')
      .update({ paid_month: paidMonth || null })
      .eq('id', id);

    if (error) {
      console.error('Error updating transport paid month:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function bulkUpdatePaidMonth(
  shiftIds: string[],
  transportIds: string[],
  paidMonth: string | null
) {
  try {
    const adminSupabase = createAdminClient();
    
    const value = paidMonth || null;
    
    let shiftSuccess = true;
    let transportSuccess = true;
    let errorMsg = '';

    if (shiftIds.length > 0) {
      const { error } = await adminSupabase
        .from('shift_assignments')
        .update({ paid_month: value })
        .in('id', shiftIds);
      
      if (error) {
        shiftSuccess = false;
        errorMsg += `Shifts error: ${error.message}. `;
      }
    }

    if (transportIds.length > 0) {
      const { error } = await adminSupabase
        .from('transport_requests')
        .update({ paid_month: value })
        .in('id', transportIds);

      if (error) {
        transportSuccess = false;
        errorMsg += `Transports error: ${error.message}.`;
      }
    }

    if (!shiftSuccess || !transportSuccess) {
      return { success: false, error: errorMsg };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
