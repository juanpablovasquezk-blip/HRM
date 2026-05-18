import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('Querying triggers for shift_assignments:');
  const { data, error } = await supabase.rpc('get_table_triggers', { table_name: 'shift_assignments' });
  
  if (error) {
    console.log('RPC failed, trying to query pg_trigger directly:');
    // Since we have service_role, let's see if we can do a query to pg_trigger if pg_catalog is exposed, or via an RPC
    // Usually pg_catalog is not directly exposed in Postgrest unless there is a function or custom view.
    // Let's write an RPC test or query to check what triggers exist!
  } else {
    console.log('Triggers info:', data);
  }
}
run();
