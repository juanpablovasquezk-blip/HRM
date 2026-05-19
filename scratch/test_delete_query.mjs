import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const assignmentId = '546f79e9-55b4-4374-a183-f836a5d6fae4';
  
  console.log('Fetching assignment details:');
  const { data: assignment, error: aErr } = await supabase
    .from('shift_assignments')
    .select('personnel_id, date')
    .eq('id', assignmentId)
    .single();
    
  if (aErr) {
    console.error('Error fetching assignment:', aErr);
    return;
  }
  
  console.log('Assignment details:', assignment);
  
  console.log('Running delete on transport_requests:');
  const { error: dErr } = await supabase
    .from('transport_requests')
    .delete()
    .eq('personnel_id', assignment.personnel_id)
    .eq('date', assignment.date)
    .eq('transport_type', 'PROPIO');
    
  if (dErr) {
    console.error('Delete failed!');
    console.error('Error Message:', dErr.message);
  } else {
    console.log('Delete query ran successfully (no error).');
  }
}
run();
