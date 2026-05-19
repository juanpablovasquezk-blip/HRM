import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const pId = 'c40fc257-c2a0-4477-be92-59adfdf82dd6';
  
  const { data: assignments, error: aError } = await supabase
    .from('shift_assignments')
    .select(`
      *,
      shifts:shifts!shift_assignments_shift_id_fkey (
        id,
        name,
        requires_transport
      )
    `)
    .eq('personnel_id', pId)
    .gte('date', '2026-05-14')
    .lte('date', '2026-05-20')
    .order('date');

  if (aError) {
    console.error('Error fetching assignments:', aError);
  } else {
    console.log('Assignments:', JSON.stringify(assignments, null, 2));
  }
}
run();
