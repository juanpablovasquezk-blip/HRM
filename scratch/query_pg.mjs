import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('Trying to query pg_trigger via postgrest:');
  const { data: d1, error: e1 } = await supabase.from('pg_trigger').select('*').limit(5);
  console.log('pg_trigger:', { data: d1, error: e1 });

  console.log('Trying to query pg_proc (stored procedures):');
  const { data: d2, error: e2 } = await supabase.from('pg_proc').select('*').limit(5);
  console.log('pg_proc:', { data: d2, error: e2 });
}
run();
