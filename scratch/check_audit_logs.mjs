import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase
    .from('roster_audit_logs')
    .select('*')
    .limit(10)
    .order('created_at', { ascending: false });
    
  if (error) {
    console.error('Error fetching audit logs:', error);
  } else {
    console.log('Recent audit logs:', data);
  }
}
run();
