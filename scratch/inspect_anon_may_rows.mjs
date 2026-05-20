import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const { data, error, count } = await supabase
    .from('transport_requests')
    .select('id, date, transport_type', { count: 'exact' })
    .gte('date', '2026-05-01')
    .lte('date', '2026-05-31');

  if (error) {
    console.error('Error querying May rows with ANON:', error);
  } else {
    console.log('May rows accessible with ANON:', count || data.length);
    if (data.length > 0) {
      console.log('Sample May row:', data[0]);
    }
  }
}
run();
