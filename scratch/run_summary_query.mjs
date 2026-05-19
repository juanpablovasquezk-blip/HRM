import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: detailedRows, error: detailedError } = await supabase
    .from('transport_requests')
    .select(`
      id,
      date,
      transport_type,
      personnel_id,
      assignment_id,
      personnel:personnel!transport_requests_personnel_id_fkey(id, first_name, last_name_father, company_id), 
      assignment:shift_assignments!transport_requests_assignment_id_fkey(
        id,
        date,
        shift:shifts!shift_assignments_shift_id_fkey(id, start_time)
      )
    `)
    .gte('date', '2026-05-01')
    .lte('date', '2026-05-31');

  if (detailedError) {
    console.error('Detailed query error:', detailedError);
    return;
  }

  console.log('--- SUMMARY ---');
  console.log('Total rows in range:', detailedRows.length);
  const counts = {};
  for (const r of detailedRows) {
    counts[r.transport_type] = (counts[r.transport_type] || 0) + 1;
  }
  console.log('Counts by transport_type:', counts);
  console.log('Rows with personnel:', detailedRows.filter(r => r.personnel).length);
  console.log('Rows with assignment:', detailedRows.filter(r => r.assignment).length);
}
run();
