import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function findByTime() {
  const { data: shifts } = await supabase.from('shifts').select('*').eq('start_time', '12:00:00');
  console.log('Shifts starting at 12:00:', JSON.stringify(shifts, null, 2));
}

findByTime();
