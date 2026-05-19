import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: allReqs, error: allError } = await supabase
    .from('transport_requests')
    .select('id, date, transport_type')
    .order('date', { ascending: false });

  if (allError) {
    console.error(allError);
    return;
  }
  
  console.log('Total rows:', allReqs.length);
  console.log('First 10 rows:', allReqs.slice(0, 10));
}
run();
