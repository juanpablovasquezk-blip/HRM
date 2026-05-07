import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkTomorrowAll() {
  const tomorrow = '2026-05-08';
  const { data: asg, error } = await supabase
    .from('shift_assignments')
    .select('*, area:areas(name), shift:shifts!shift_assignments_shift_id_fkey(name)')
    .eq('date', tomorrow);
    
  if (error) {
    console.error(error);
    return;
  }
  
  console.log('Assignments for tomorrow:', asg?.length);
  const matched = asg?.filter(a => a.shift?.name?.includes('12') || a.shift?.name?.includes('00'));
  console.log('12:00 or 00:00 assignments for tomorrow:', JSON.stringify(matched, null, 2));
}

checkTomorrowAll();
