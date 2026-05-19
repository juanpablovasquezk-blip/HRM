import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('Querying transport requests for Esteban Jacob Berrios on 2026-05-18:');
  const personnelId = 'c24f1a21-2ae7-4b64-9df0-e9a0814f2056';
  
  const { data, error } = await supabase
    .from('transport_requests')
    .select('*')
    .eq('personnel_id', personnelId)
    .eq('date', '2026-05-18');
    
  if (error) {
    console.error('Error fetching transport requests:', error);
  } else {
    console.log('Transport requests found:', data);
  }
}
run();
