import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const assignmentId = '546f79e9-55b4-4374-a183-f836a5d6fae4'; // Esteban's assignment for 2026-05-18
  const userName = 'EMILIO ALBERTO BARROS';
  
  console.log(`Attempting to update attendance for assignment ${assignmentId} with user ${userName}:`);
  const { data, error } = await supabase
    .from('shift_assignments')
    .update({
      attendance_status: 'absent',
      attendance_updated_by: userName,
      attendance_updated_at: new Date().toISOString()
    })
    .eq('id', assignmentId)
    .select();
    
  if (error) {
    console.error('Update failed!');
    console.error('Error Code:', error.code);
    console.error('Error Message:', error.message);
    console.error('Error Details:', error.details);
    console.error('Error Hint:', error.hint);
  } else {
    console.log('Update succeeded! Returned data:', data);
  }
}

run();
