import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  // Find Pablo Sepulveda in personnel
  const { data: personnel, error: pError } = await supabase
    .from('personnel')
    .select('*')
    .or('first_name.ilike.%pablo%,last_name_father.ilike.%pablo%');

  if (pError) {
    console.error('Error finding personnel:', pError);
    return;
  }
  console.log('Personnel found:', personnel);

  if (personnel && personnel.length > 0) {
    const pId = personnel[0].id;
    // Query his transport requests for May 2026
    const { data: transport, error: tError } = await supabase
      .from('transport_requests')
      .select('*')
      .eq('personnel_id', pId)
      .gte('date', '2026-05-01')
      .lte('date', '2026-05-31');

    if (tError) {
      console.error('Error fetching transport:', tError);
    } else {
      console.log('Transport requests:', transport);
    }
  }
}
run();
