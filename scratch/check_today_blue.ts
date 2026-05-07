import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkToday() {
  const blueExpressId = '1e805b0f-6d6c-471e-bad9-c48669342735';
  const today = '2026-05-07';
  const { data: asg } = await supabase
    .from('shift_assignments')
    .select('*, shift:shifts(name)')
    .eq('area_id', blueExpressId)
    .eq('date', today);
    
  console.log('BlueExpress Today Assignments:', JSON.stringify(asg, null, 2));
}

checkToday();
