import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkMonth() {
  const blueExpressId = '1e805b0f-6d6c-471e-bad9-c48669342735';
  const { data: asg } = await supabase
    .from('shift_assignments')
    .select('shift_id, shift:shifts!shift_assignments_shift_id_fkey(name), count()')
    .eq('area_id', blueExpressId)
    .gte('date', '2026-05-07')
    .order('shift_id');
    
  console.log('Assignments count by shift for BlueExpress:', JSON.stringify(asg, null, 2));
}

async function checkMonthRaw() {
   const blueExpressId = '1e805b0f-6d6c-471e-bad9-c48669342735';
   const { data } = await supabase.from('shift_assignments').select('shift_id, date').eq('area_id', blueExpressId).gte('date', '2026-05-07');
   
   const counts: Record<string, number> = {};
   data?.forEach(a => {
     counts[a.shift_id] = (counts[a.shift_id] || 0) + 1;
   });
   console.log('Raw counts:', counts);
}

checkMonthRaw();
