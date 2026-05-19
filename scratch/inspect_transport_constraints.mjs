import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  // We can insert a row with assignment_id = null and see if it succeeds!
  const { data, error } = await supabase
    .from('transport_requests')
    .insert({
      personnel_id: 'c0c6d82d-470f-46c5-9d51-46ab97252ebf', // Jailson
      date: '2026-04-01',
      transport_type: 'PROPIO',
      assignment_id: null
    })
    .select();

  if (error) {
    console.error('Insert error (assignment_id = null):', error);
  } else {
    console.log('Insert succeeded! Created row:', data);
    // Clean it up
    await supabase.from('transport_requests').delete().eq('id', data[0].id);
    console.log('Cleaned up temp transport request');
  }
}
run();
