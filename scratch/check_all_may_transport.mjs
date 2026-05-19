import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase
    .from('transport_requests')
    .select('date, transport_type, personnel_id, personnel:personnel(first_name, last_name_father)')
    .gte('date', '2026-05-01')
    .lte('date', '2026-05-31')
    .order('date');
    
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('All transport requests in May:', data.length);
    // Print unique dates and count
    const countsByDate = {};
    for (const row of data) {
      countsByDate[row.date] = (countsByDate[row.date] || 0) + 1;
    }
    console.log('Counts by date:', countsByDate);
  }
}
run();
