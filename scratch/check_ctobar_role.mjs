import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', '8d83e4ed-3ed9-4d20-ac14-700d0607897d')
    .single();

  if (error) {
    console.error(error);
  } else {
    console.log('User ctobar details:', data);
  }
}
run();
