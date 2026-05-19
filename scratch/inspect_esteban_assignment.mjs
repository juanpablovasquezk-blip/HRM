import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('Querying Esteban Berríos personnel record:');
  const { data: personnel, error: pErr } = await supabase
    .from('personnel')
    .select('*')
    .ilike('first_name', '%Esteban%')
    .ilike('last_name_father', '%Berrios%');
    
  if (pErr) {
    console.error('Error finding personnel:', pErr);
    return;
  }
  
  console.log('Personnel found:', personnel);
  
  if (personnel.length > 0) {
    const pId = personnel[0].id;
    console.log(`\nQuerying shift assignments for personnel_id ${pId} on 2026-05-18:`);
    const { data: assignments, error: aErr } = await supabase
      .from('shift_assignments')
      .select('*')
      .eq('personnel_id', pId)
      .eq('date', '2026-05-18');
      
    if (aErr) {
      console.error('Error finding assignments:', aErr);
    } else {
      console.log('Assignments found:', assignments);
    }
  }
}
run();
