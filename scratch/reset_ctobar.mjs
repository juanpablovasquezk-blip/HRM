import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase.auth.admin.updateUserById(
    '8d83e4ed-3ed9-4d20-ac14-700d0607897d',
    { password: 'password123' }
  );
  if (error) {
    console.error(error);
  } else {
    console.log('Password reset successfully for ctobar@minerquim.cl');
  }
}
run();
