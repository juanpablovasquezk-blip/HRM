import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkNextWeek() {
  const blueExpressId = '1e805b0f-6d6c-471e-bad9-c48669342735';
  const { data: reqs } = await supabase
    .from('shift_requirements')
    .select('*, shift:shifts!shift_requirements_shift_id_fkey(name)')
    .eq('area_id', blueExpressId)
    .gte('date', '2026-05-08')
    .lte('date', '2026-05-15');
    
  console.log('Requirements for next week:', JSON.stringify(reqs, null, 2));
}

checkNextWeek();
