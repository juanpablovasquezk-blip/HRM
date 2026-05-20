import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const { data, error } = await supabase
    .from('transport_requests')
    .select('id, date, transport_type, status, personnel_id')
    .limit(10);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Sample anon rows:', data);
    const dates = data.map(d => d.date);
    console.log('Unique dates in sample:', [...new Set(dates)]);
  }
}
run();
