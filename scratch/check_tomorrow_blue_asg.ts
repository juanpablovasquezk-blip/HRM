import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkTomorrowBlue() {
  const blueExpressId = '1e805b0f-6d6c-471e-bad9-c48669342735';
  const tomorrow = '2026-05-08';
  const { data: asg, error } = await supabase
    .from('shift_assignments')
    .select('*, shift:shifts!shift_assignments_shift_id_fkey(name)')
    .eq('area_id', blueExpressId)
    .eq('date', tomorrow);
    
  if (error) {
    console.error(error);
    return;
  }
  
  console.log('BlueExpress Assignments for tomorrow:', JSON.stringify(asg, null, 2));
}

checkTomorrowBlue();
