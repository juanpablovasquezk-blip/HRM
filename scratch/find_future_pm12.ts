import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function findFuturePM12() {
  const pm12 = '2f486675-d704-46cd-87ea-4e7d02722385';
  const { data: reqs } = await supabase
    .from('shift_requirements')
    .select('*, area:areas(name)')
    .eq('shift_id', pm12)
    .gte('date', '2026-05-08');
    
  console.log('Future PM 12 Requirements:', JSON.stringify(reqs, null, 2));
}

findFuturePM12();
