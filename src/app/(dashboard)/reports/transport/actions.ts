'use server';

import { createClient } from '@/lib/supabase/server';
import type { TransportRequestWithDetails } from '@/types/database';

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
      personnel:personnel!transport_requests_personnel_id_fkey(*), 
      assignment:shift_assignments!transport_requests_assignment_id_fkey(
        *, 
        shift:shifts!shift_assignments_shift_id_fkey(*), 
        area:areas(*), 
        position:positions(*)
      )
    `);

  if (filters.startDate) {
    query = query.gte('date', filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte('date', filters.endDate);
  }
  if (filters.companyId) {
    // This assumes personnel is linked to company
    // We might need to filter by personnel.company_id
    // But Supabase JS client doesn't support filtering on joined tables easily without .filter() or complex syntax
    // Better to fetch all and filter in JS if the dataset is small, or use a better query.
    // For now, let's fetch and filter if companyId is provided.
  }

  const { data, error } = await query.order('date', { ascending: false });

  if (error) return { error: error.message };

  let results = data as TransportRequestWithDetails[];

  if (filters.companyId) {
    results = results.filter(r => r.personnel?.company_id === filters.companyId);
  }

  return { data: results };
}
