import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase
    .from('personnel')
    .select('*')
    .ilike('first_name', '%Emilio%')
    .ilike('last_name_father', '%Barros%');
    
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Emilio Barros:', data);
  }
}
run();
