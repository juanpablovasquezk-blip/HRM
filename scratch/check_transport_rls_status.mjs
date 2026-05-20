import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  // We can query pg_tables through a custom RPC if we had one, but we don't.
  // Wait! We can check RLS status by running a SELECT query on pg_class and pg_namespace
  // Postgres catalog tables like pg_class and pg_namespace are not exposed in the 'public' schema of PostgREST by default.
  // Wait, let's see if we can query them or if we get an error.
  const { data, error } = await supabase
    .from('pg_class')
    .select('relrowsecurity')
    .eq('relname', 'transport_requests');

  console.log('Result from pg_class:', { data, error });
}
run();
