import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const blueExpressId = '1e805b0f-6d6c-471e-bad9-c48669342735';
  const pm12 = '2f486675-d704-46cd-87ea-4e7d02722385';
  
  const { data: asg } = await supabase
    .from('shift_assignments')
    .select('id, date')
    .eq('area_id', blueExpressId)
    .eq('shift_id', pm12)
    .gte('date', '2026-05-07');
    
  console.log('Assignments found:', asg?.length);
  if (asg && asg.length > 0) {
    console.log('Sample:', asg[0]);
  }
}

check();
