import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  // Let's query information_schema.columns to get actual column types of transport_requests
  const { data, error } = await supabase.rpc('get_table_columns_temp');
  // Since we don't have this RPC, let's query via Postgres.
  // Wait, let's see if we can query it or find out if there's any file that has the schema.
  // Let's write an RPC or query if possible, or wait!
  // We can just fetch a row and check the type of date using typeof or instanceof Date!
  const { data: rows } = await supabase.from('transport_requests').select('date').limit(1);
  if (rows && rows.length > 0) {
    console.log('Value of date:', rows[0].date);
    console.log('Type of date:', typeof rows[0].date);
  }
}
run();
