import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSupervisorSession } from '../../actions';

/**
 * Obtener bonos del equipo asignado al supervisor
 */
export async function getSupervisorBonuses(filters: {
  startDate?: string;
  endDate?: string;
  personnelId?: string;
  otNumber?: string;
} = {}) {
  try {
    const session = await getSupervisorSession();
    if (!session) {
      return { success: false, error: 'Sesión no válida', data: [] };
    }

    const admin = createAdminClient();

    let query = admin
      .from('bonus_records')
      .select(`
        id,
        date,
        amount,
        ot_number,
        observations,
        paid_month,
        status,
        bonus_type:bonus_types (
          id, code, name
        ),
        personnel:personnel_id (
          id, first_name, last_name_father, last_name_mother, rut
        )
      `)
      .eq('status', 'active')
      .order('date', { ascending: false });

    if (filters.startDate) {
      query = query.gte('date', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('date', filters.endDate);
    }
    if (filters.personnelId && filters.personnelId !== 'ALL') {
      query = query.eq('personnel_id', filters.personnelId);
    }
    if (filters.otNumber && filters.otNumber.trim()) {
      query = query.ilike('ot_number', `%${filters.otNumber.trim()}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[getSupervisorBonuses] Error:', error);
      return { success: false, error: error.message, data: [] };
    }

    return { success: true, data: (data as any[]) || [] };
  } catch (err: any) {
    console.error('[getSupervisorBonuses] Unexpected:', err);
    return { success: false, error: err.message, data: [] };
  }
}
