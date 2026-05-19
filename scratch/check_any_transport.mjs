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
    const { count, error } = await supabase
      .from('transport_requests')
      .select('*', { count: 'exact', head: true })
      .eq('date', d);
      
    console.log(`Date: ${d}, Total transport requests: ${count}, Error:`, error);
  }
}
run();
