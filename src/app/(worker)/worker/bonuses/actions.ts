import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getWorkerSession } from '../../actions';
import { BonusRecord } from '@/types/database';

/**
 * Obtener bonos del colaborador autenticado (filtrado por rango de fechas opcional, sin anulados ni turnos extras)
 */
export async function getWorkerBonuses(filters: {
  startDate?: string;
  endDate?: string;
  otNumber?: string;
} = {}) {
  try {
    const session = await getWorkerSession();
    if (!session?.id) {
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
        )
      `)
      .eq('personnel_id', session.id)
      .eq('status', 'active') // Trabajador NO ve bonos anulados
      .order('date', { ascending: false });

    if (filters.startDate) {
      query = query.gte('date', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('date', filters.endDate);
    }
    if (filters.otNumber && filters.otNumber.trim()) {
      query = query.ilike('ot_number', `%${filters.otNumber.trim()}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[getWorkerBonuses] Error:', error);
      return { success: false, error: error.message, data: [] };
    }

    return { success: true, data: (data as any[]) || [] };
  } catch (err: any) {
    console.error('[getWorkerBonuses] Unexpected:', err);
    return { success: false, error: err.message, data: [] };
  }
}
