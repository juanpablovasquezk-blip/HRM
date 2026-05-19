import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const pId = 'c40fc257-c2a0-4477-be92-59adfdf82dd6';
  const { data: assignments, error } = await supabase
    .from('shift_assignments')
    .select('*, shift:shifts!shift_assignments_shift_id_fkey(*)')
    .eq('personnel_id', pId)
    .gte('date', '2026-05-01')
    .lte('date', '2026-05-31')
    .order('date');

  if (error) {
    console.error('Error:', error);
  } else {
    for (const a of assignments) {
      console.log(`Date: ${a.date}, Shift: ${a.shift?.name}, requires_transport: ${a.shift?.requires_transport}, is_confirmed: ${a.is_confirmed}`);
    }
  }
}
run();
