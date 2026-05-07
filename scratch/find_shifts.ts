import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function findShifts() {
  const { data: shifts } = await supabase.from('shifts').select('*');
  const am12 = shifts?.filter(s => s.name.includes('AM 12'));
  const am11 = shifts?.filter(s => s.name.includes('AM 11'));
  
  console.log('AM 12 shifts:', JSON.stringify(am12, null, 2));
  console.log('AM 11 shifts:', JSON.stringify(am11, null, 2));
}

findShifts();
