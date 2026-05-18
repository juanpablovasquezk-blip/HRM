import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const assignmentId = '37006bff-255f-432c-92d6-60c4fbd27d89';

  console.log('Testing present update on Esteban\'s assignment:');
  const { data, error } = await supabase
    .from('shift_assignments')
    .update({
      attendance_status: 'present',
      attendance_updated_by: 'EMILIO ALBERTO BARROS',
      attendance_updated_at: new Date().toISOString()
    })
    .eq('id', assignmentId)
    .select();

  if (error) {
    console.error('Error during present update:', error);
  } else {
    console.log('Present update succeeded:', data);
  }
}
run();
