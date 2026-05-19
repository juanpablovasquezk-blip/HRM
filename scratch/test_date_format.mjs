import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('Querying with YYYY-MM-DD...');
  const { data: correctRows } = await supabase
    .from('transport_requests')
    .select('id')
    .gte('date', '2026-05-01')
    .lte('date', '2026-05-31');
  
  console.log('YYYY-MM-DD count:', correctRows?.length);

  console.log('Querying with DD-MM-YYYY...');
  const { data: incorrectRows } = await supabase
    .from('transport_requests')
    .select('id')
    .gte('date', '01-05-2026')
    .lte('date', '31-05-2026');

  console.log('DD-MM-YYYY count:', incorrectRows?.length);
}
run();
