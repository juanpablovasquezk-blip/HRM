import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const pId = 'c40fc257-c2a0-4477-be92-59adfdf82dd6';
  
  const { data: personnel, error } = await supabase
    .from('personnel')
    .select('*')
    .eq('id', pId)
    .single();

  if (error) {
    console.error('Error fetching personnel:', error);
  } else {
    console.log('Personnel details:', JSON.stringify(personnel, null, 2));
  }
}
run();
