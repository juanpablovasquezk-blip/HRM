import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  // Let's query ALL transport requests first
  const { data: allReqs, error: allError } = await supabase
    .from('transport_requests')
    .select('count', { count: 'exact', head: true });

  if (allError) {
    console.error('Error fetching total count of transport_requests:', allError);
  } else {
    console.log('Total transport_requests count in DB:', allReqs);
  }

  // Let's query some rows for May 2026
  const { data: rows, error: rowsError } = await supabase
    .from('transport_requests')
    .select('*')
    .gte('date', '2026-05-01')
    .lte('date', '2026-05-31')
    .limit(5);

  if (rowsError) {
    console.error('Error fetching rows for May 2026:', rowsError);
  } else {
    console.log('Sample rows for May 2026:', rows);
  }

  // Let's do the exact query that actions.ts does
  const { data: detailedRows, error: detailedError } = await supabase
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
    `)
    .gte('date', '2026-05-01')
    .lte('date', '2026-05-31')
    .limit(3);

  if (detailedError) {
    console.error('Error fetching detailed rows:', detailedError);
  } else {
    console.log('Detailed rows sample:', detailedRows);
  }
}
run();
