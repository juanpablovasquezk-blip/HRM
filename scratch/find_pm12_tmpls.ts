import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function findPM12Tmpls() {
  const pm12 = '2f486675-d704-46cd-87ea-4e7d02722385';
  const { data: tmpls } = await supabase
    .from('requirement_templates')
    .select('*, area:areas(name)')
    .eq('shift_id', pm12);
    
  console.log('Templates with PM 12:', JSON.stringify(tmpls, null, 2));
}

findPM12Tmpls();
