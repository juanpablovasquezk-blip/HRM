import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  console.log('Querying count of transport_requests with ANON key...');
  const { data, error, count } = await supabase
    .from('transport_requests')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('ANON key count error:', error);
  } else {
    console.log('ANON key count success! Count:', count);
  }

  console.log('Trying detailed query with ANON key...');
  const { data: detailed, error: detailedError } = await supabase
    .from('transport_requests')
    .select(`
      *, 
      personnel:personnel!transport_requests_personnel_id_fkey(*), 
      assignment:shift_assignments!transport_requests_assignment_id_fkey(
        *, 
        shift:shifts!shift_assignments_shift_id_fkey(*), 
        area:areas(*), 
        position:positions(*)
      )
    `)
    .limit(3);

  if (detailedError) {
    console.error('ANON key detailed query error:', detailedError);
  } else {
    console.log('ANON key detailed query success! Results:', detailed.length);
  }
}
run();
