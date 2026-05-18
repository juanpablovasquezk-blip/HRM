import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'shift_assignments' });
  
  if (error) {
    // If RPC doesn't exist, we can query a single row and print its keys!
    console.log('RPC failed, querying a single row:');
    const { data: row, error: rowErr } = await supabase
      .from('shift_assignments')
      .select('*')
      .limit(1)
      .single();
      
    if (rowErr) {
      console.error('Error fetching row:', rowErr);
    } else {
      console.log('Row keys:', Object.keys(row));
      console.log('Row data:', row);
    }
  } else {
    console.log('Columns info:', data);
  }
}
run();
