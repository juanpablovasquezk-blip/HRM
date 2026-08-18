'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { TransportRequestWithDetails } from '@/types/database';

// =============================================================================
// Helpers
// =============================================================================

function normalizeDateString(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;

  const clean = dateStr.trim();
  if (clean === '') return undefined;

  // 1. Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

  // 2. DD-MM-YYYY or DD/MM/YYYY
  const sep = clean.includes('/') ? '/' : '-';
  const parts = clean.split(sep);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    if (parts[2].length === 4) {
      const p0 = parseInt(parts[0], 10);
      const p1 = parseInt(parts[1], 10);
      const p2 = parseInt(parts[2], 10);
      if (!isNaN(p0) && !isNaN(p1) && !isNaN(p2)) {
        return `${p2}-${String(p1).padStart(2, '0')}-${String(p0).padStart(2, '0')}`;
      }
    }
  }

  // 3. Last resort
  try {
    const d = new Date(clean.includes('T') ? clean : clean + 'T00:00:00');
    if (!isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  } catch (_) { /* ignore */ }

  return undefined;
}

// =============================================================================
// GET TRANSPORT REPORT DATA
// =============================================================================

export async function getTransportReportData(filters: {
  month?: string;
  startDate?: string;
  endDate?: string;
  companyId?: string;
}) {
  const supabase = await createClient();

  let query = supabase
    .from('transport_requests')
    .select(`
      *,
      personnel:personnel!transport_requests_personnel_id_fkey(
        *,
        company:companies!personnel_company_id_fkey(name)
      ),
      assignment:shift_assignments!transport_requests_assignment_id_fkey(
        *,
        shift:shifts!shift_assignments_shift_id_fkey(*),
        area:areas(*),
        position:positions(*)
      )
    `);

  const startFormatted = normalizeDateString(filters.startDate);
  const endFormatted = normalizeDateString(filters.endDate);

  if (startFormatted) query = query.gte('date', startFormatted);
  if (endFormatted)   query = query.lte('date', endFormatted);

  const { data, error } = await query.order('date', { ascending: false });

  if (error) {
    console.error('getTransportReportData DB Error:', error);
    return { error: error.message };
  }

  let results = data as TransportRequestWithDetails[];

  // Exclude transport requests with type PROPIO if the assignment is marked absent
  results = results.filter(r => {
    if (r.transport_type === 'PROPIO' && r.assignment?.attendance_status === 'absent') {
      return false;
    }
    return true;
  });

  if (filters.companyId) {
    results = results.filter(r => r.personnel?.company_id === filters.companyId);
  }

  return { data: results };
}

// =============================================================================
// IMPORT TRANSPORT COSTS FROM PROVIDER EXCEL (Transvip)
// Receives a map { reservationNumber -> cost } built from column AH of the
// provider's monthly Excel report, then bulk-updates transport_requests.cost.
// =============================================================================

export async function importTransportCosts(
  costMap: Record<string, number>
): Promise<{ updated: number; notFound: string[]; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { updated: 0, notFound: [], error: 'No autorizado' };

    const adminSupabase = createAdminClient();
    const reservationNumbers = Object.keys(costMap).filter(Boolean);

    if (reservationNumbers.length === 0) return { updated: 0, notFound: [] };

    // Fetch matching rows
    const { data: existing, error: fetchErr } = await adminSupabase
      .from('transport_requests')
      .select('id, reservation_number')
      .in('reservation_number', reservationNumbers);

    if (fetchErr) {
      console.error('[importTransportCosts] fetch error:', fetchErr);
      return { updated: 0, notFound: [], error: fetchErr.message };
    }

    if (!existing || existing.length === 0) {
      return { updated: 0, notFound: reservationNumbers };
    }

    const foundSet = new Set(existing.map(r => String(r.reservation_number)));
    const notFound = reservationNumbers.filter(rn => !foundSet.has(rn));

    let updated = 0;
    await Promise.all(
      existing.map(async (row) => {
        const cost = costMap[String(row.reservation_number)];
        if (cost === undefined) return;
        const { error: updErr } = await adminSupabase
          .from('transport_requests')
          .update({ cost })
          .eq('id', row.id);
        if (!updErr) updated++;
        else console.error(`[importTransportCosts] update error for ${row.reservation_number}:`, updErr);
      })
    );

    return { updated, notFound };
  } catch (err: any) {
    console.error('[importTransportCosts] unexpected error:', err);
    return { updated: 0, notFound: [], error: err.message };
  }
}
