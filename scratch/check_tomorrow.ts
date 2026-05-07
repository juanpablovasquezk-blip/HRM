import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkTomorrow() {
  const tomorrow = '2026-05-08';
  const { data: reqs } = await supabase
    .from('shift_requirements')
    .select('*, area:areas(name), shift:shifts(name)')
    .eq('date', tomorrow);
    
  console.log('Requirements for tomorrow:', JSON.stringify(reqs, null, 2));
}

checkTomorrow();
