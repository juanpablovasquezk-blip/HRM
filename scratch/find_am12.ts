import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function findAM12() {
  const { data: shifts } = await supabase.from('shifts').select('*').eq('name', 'AM 12');
  console.log('Shifts named exactly AM 12:', JSON.stringify(shifts, null, 2));
}

findAM12();
