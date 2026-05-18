import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase.rpc('exec_sql', {
    query: `
      SELECT trigger_name, event_manipulation, event_object_table, action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'shift_assignments';
    `
  });

  if (error) {
    console.error('Error fetching triggers via RPC (exec_sql might not exist):', error);
    // Let's try executing standard query via pg or another method if possible
  } else {
    console.log('Triggers on shift_assignments:', data);
  }
}
run();
