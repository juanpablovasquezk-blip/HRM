import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkPersonnel() {
  const pm12 = '2f486675-d704-46cd-87ea-4e7d02722385';
  const { data: personnel } = await supabase
    .from('personnel')
    .select('id, first_name, area:areas(name)')
    .eq('fixed_shift_id', pm12);
    
  console.log('Personnel with PM 12 fixed shift:', JSON.stringify(personnel, null, 2));
}

checkPersonnel();
