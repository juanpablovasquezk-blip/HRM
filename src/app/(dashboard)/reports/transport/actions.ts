'use server';

import { createClient } from '@/lib/supabase/server';
import type { TransportRequestWithDetails } from '@/types/database';

function normalizeDateString(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  
  const clean = dateStr.trim();
  if (clean === '') return undefined;

  // 1. If it's already YYYY-MM-DD, return it directly
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }

  // 2. Try parsing DD-MM-YYYY or DD/MM/YYYY
  const separator = clean.includes('/') ? '/' : '-';
  const parts = clean.split(separator);

  if (parts.length === 3) {
    // If the first part is 4 digits, assume YYYY-MM-DD or YYYY/MM/DD
    if (parts[0].length === 4) {
      const year = parts[0];
      const month = parts[1].padStart(2, '0');
      const day = parts[2].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    // If the third part is 4 digits, assume DD-MM-YYYY or MM-DD-YYYY
    if (parts[2].length === 4) {
      const p0 = parseInt(parts[0], 10);
      const p1 = parseInt(parts[1], 10);
      const p2 = parseInt(parts[2], 10);
      if (!isNaN(p0) && !isNaN(p1) && !isNaN(p2)) {
        const day = String(p0).padStart(2, '0');
        const month = String(p1).padStart(2, '0');
        const year = String(p2);
        return `${year}-${month}-${day}`;
      }
    }
  }

  // 3. Last resort fallback to standard JS Date constructor
  try {
    const d = new Date(clean.includes('T') ? clean : clean + 'T00:00:00');
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch (e) {
    // Ignore and fallback
  }

  return undefined;
}

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
  const startFormatted = normalizeDateString(filters.startDate);
  const endFormatted = normalizeDateString(filters.endDate);

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
