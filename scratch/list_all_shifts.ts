import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function listAllShifts() {
  const { data: shifts } = await supabase.from('shifts').select('*');
  console.log(JSON.stringify(shifts, null, 2));
}

listAllShifts();
