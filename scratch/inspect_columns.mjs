import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('Querying table structure via an RPC or query...');
  // Let's check if we can inspect via a simple select from a non-existent table to see schema cache, or try a system table
  const { data, error } = await supabase
    .from('shift_assignments')
    .select('*')
    .limit(1);
    
  if (error) {
    console.error('Error fetching shift assignments:', error);
  } else {
    console.log('Sample assignment fields:', Object.keys(data[0] || {}));
  }
}
run();
