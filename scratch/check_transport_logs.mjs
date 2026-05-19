import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const pId = 'c40fc257-c2a0-4477-be92-59adfdf82dd6';
  const { data, error } = await supabase
    .from('transport_logs')
    .select('*')
    .eq('personnel_id', pId)
    .order('created_at', { ascending: false });
    
  if (error) {
    console.error('Error fetching logs:', error);
  } else {
    console.log('Logs for Pablo:', data);
  }
}
run();
