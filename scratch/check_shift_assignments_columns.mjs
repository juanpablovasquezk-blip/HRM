import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase
    .from('shift_assignments')
    .select('*')
    .limit(1);
  
  if (data && data.length > 0) {
    console.log('Sample row columns:', Object.keys(data[0]));
    console.log('Sample row:', data[0]);
  } else {
    console.log('No data in shift_assignments', error);
  }
}
run();
