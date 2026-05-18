import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  // Let's find Esteban Jacob Berrios's assignment on 2026-05-19
  // (which we saw is '37006bff-255f-432c-92d6-60c4fbd27d89')
  const assignmentId = '37006bff-255f-432c-92d6-60c4fbd27d89';

  console.log('Testing update on Esteban\'s assignment with userName "EMILIO ALBERTO BARROS":');
  const { data, error } = await supabase
    .from('shift_assignments')
    .update({
      attendance_status: 'absent',
      attendance_updated_by: 'EMILIO ALBERTO BARROS',
      attendance_updated_at: new Date().toISOString()
    })
    .eq('id', assignmentId)
    .select();

  if (error) {
    console.error('Error during update:', error);
  } else {
    console.log('Update succeeded:', data);
  }
}
run();
