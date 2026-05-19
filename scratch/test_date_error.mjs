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
    .select('id')
    .gte('date', '01-05-2026')
    .lte('date', '31-05-2026');

  if (error) {
    console.error('Error for DD-MM-YYYY query:', error);
  } else {
    console.log('Success, rows returned:', data.length);
  }
}
run();
