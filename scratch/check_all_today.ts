import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkAllToday() {
  const today = '2026-05-07';
  const { data: asg, error } = await supabase
    .from('shift_assignments')
    .select('*, area:areas(name), shift:shifts!shift_assignments_shift_id_fkey(name)')
    .eq('date', today);
    
  if (error) {
    console.error('Error fetching assignments:', error);
    return;
  }
  
  console.log('Total assignments today:', asg?.length);
  const blue = asg?.filter(a => (a.area as any)?.name?.includes('Blue'));
  console.log('Blue related assignments:', JSON.stringify(blue, null, 2));
}

checkAllToday();
