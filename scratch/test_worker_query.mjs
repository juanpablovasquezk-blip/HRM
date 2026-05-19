import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const pId = 'c40fc257-c2a0-4477-be92-59adfdf82dd6';
  
  // Exact query from getWorkerTransportHistory
  let query = supabase
    .from('transport_requests')
    .select('*, shift_assignment:shift_assignments(*, shift:shifts!shift_assignments_shift_id_fkey(*))')
    .eq('personnel_id', pId)
    .eq('transport_type', 'PROPIO')
    .order('date', { ascending: false });

  const { data, error } = await query;
  console.log('Error:', error);
  console.log('Data returned:', data);
}
run();
