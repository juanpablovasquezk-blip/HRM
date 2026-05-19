import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const dates = ['2026-05-16', '2026-05-17', '2026-05-18', '2026-05-19'];
  for (const d of dates) {
    const { data: assignments, error } = await supabase
      .from('shift_assignments')
      .select(`
        id,
        is_confirmed,
        status,
        shift:shifts!shift_assignments_shift_id_fkey(name, requires_transport)
      `)
      .eq('date', d)
      .neq('status', 'cancelled');
      
    if (error) {
      console.error(`Error on date ${d}:`, error);
      continue;
    }
    
    const total = assignments.length;
    const confirmed = assignments.filter(a => a.is_confirmed).length;
    const reqTransport = assignments.filter(a => a.is_confirmed && a.shift && a.shift.requires_transport).length;
    
    console.log(`Date: ${d}, Total assignments: ${total}, Confirmed: ${confirmed}, Confirmed requiring transport: ${reqTransport}`);
  }
}
run();
