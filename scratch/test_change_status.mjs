import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const assignmentId = '546f79e9-55b4-4374-a183-f836a5d6fae4';
  const userName = 'EMILIO ALBERTO BARROS';

  console.log('1. Setting status to present:');
  const { data: res1, error: err1 } = await supabase
    .from('shift_assignments')
    .update({
      attendance_status: 'present',
      attendance_updated_by: userName,
      attendance_updated_at: new Date().toISOString()
    })
    .eq('id', assignmentId)
    .select();
    
  if (err1) {
    console.error('Failed to set present:', err1.message);
  } else {
    console.log('Succeeded setting present:', res1);
  }

  console.log('2. Setting status to absent:');
  const { data: res2, error: err2 } = await supabase
    .from('shift_assignments')
    .update({
      attendance_status: 'absent',
      attendance_updated_by: userName,
      attendance_updated_at: new Date().toISOString()
    })
    .eq('id', assignmentId)
    .select();
    
  if (err2) {
    console.error('Failed to set absent:', err2.message);
  } else {
    console.log('Succeeded setting absent:', res2);
  }
}
run();
