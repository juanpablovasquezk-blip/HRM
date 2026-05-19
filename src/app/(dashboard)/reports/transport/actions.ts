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

  // Parse and format dates resiliently to handle YYYY-MM-DD, DD-MM-YYYY, etc.
  let startFormatted = filters.startDate;
  let endFormatted = filters.endDate;

  if (filters.startDate) {
    try {
      // First try standard JS parsing (which handles YYYY-MM-DD well)
      let d = new Date(filters.startDate + 'T00:00:00');
      if (isNaN(d.getTime())) {
        // Try parsing DD-MM-YYYY
        const parts = filters.startDate.split('-');
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const year = parseInt(parts[2], 10);
          const tempDate = new Date(year, month, day);
          if (!isNaN(tempDate.getTime())) {
            d = tempDate;
          }
        }
      }
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        startFormatted = `${year}-${month}-${day}`;
      }
    } catch (e) {
      console.error('Error parsing startDate:', e);
    }
  }

  if (filters.endDate) {
    try {
      let d = new Date(filters.endDate + 'T00:00:00');
      if (isNaN(d.getTime())) {
        // Try parsing DD-MM-YYYY
        const parts = filters.endDate.split('-');
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const year = parseInt(parts[2], 10);
          const tempDate = new Date(year, month, day);
          if (!isNaN(tempDate.getTime())) {
            d = tempDate;
          }
        }
      }
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        endFormatted = `${year}-${month}-${day}`;
      }
    } catch (e) {
      console.error('Error parsing endDate:', e);
    }
  }

  if (startFormatted) {
    query = query.gte('date', startFormatted);
  }
  if (endFormatted) {
    query = query.lte('date', endFormatted);
  }
  if (filters.companyId) {
    // Handled in post-processing
  }

  const { data, error } = await query.order('date', { ascending: false });

  if (error) {
    console.error('getTransportReportData DB Error:', error);
    return { error: error.message };
  }

  let results = data as TransportRequestWithDetails[];

  if (filters.companyId) {
    results = results.filter(r => r.personnel?.company_id === filters.companyId);
  }

  return { data: results };
}
