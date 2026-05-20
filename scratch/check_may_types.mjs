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
    .select('transport_type')
    .gte('date', '2026-05-01')
    .lte('date', '2026-05-31');

  if (error) {
    console.error(error);
    return;
  }

  const counts = {};
  for (const r of data) {
    counts[r.transport_type] = (counts[r.transport_type] || 0) + 1;
  }

  console.log('May transport_type counts:', counts);
}
run();
