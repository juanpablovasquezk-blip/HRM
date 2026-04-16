import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkReqs() {
  const today = '2026-04-16';
  const end = '2026-04-30';
  
  const { data: requirements, count } = await supabase
    .from('shift_requirements')
    .select('*', { count: 'exact' })
    .gte('date', today)
    .lte('date', end);

  console.log(`Requirements between ${today} and ${end}: ${count}`);
  if (requirements && requirements.length > 0) {
    console.log('Sample requirement:', JSON.stringify(requirements[0], null, 2));
  }
}

checkReqs();
