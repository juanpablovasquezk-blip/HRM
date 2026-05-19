import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: policies, error } = await supabase.rpc('get_policies_temp');
  // Since we might not have a get_policies_temp RPC, let's query pg_policies directly via SQL
  // or we can query pg_policies using a query.
  // Wait, let's query pg_policies using postgres syntax if we have a way.
  // In Supabase, if we don't have a direct sql rpc, we can use a query with service_role to check.
  // Let's check what tables are there and if RLS is enabled.
  
  // Let's run a raw query on pg_policies via pg_catalog
  const { data: pols, error: polsErr } = await supabase
    .from('pg_policies') // This will fail if not exposed via PostgREST, let's check
    .select('*');
    
  if (polsErr) {
    console.log('Unable to query pg_policies directly via PostgREST:', polsErr.message);
  } else {
    console.log('Policies:', pols);
  }

  // Let's run a query to check RLS status of tables:
  // We can query pg_tables or pg_class
}
run();
