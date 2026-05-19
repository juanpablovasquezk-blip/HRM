import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const email = 'tempadmin@minerquim.cl';
  
  console.log('Finding temp admin user to delete...');
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  const tempAdmin = authUsers?.users.find(u => u.email === email);

  if (tempAdmin) {
    console.log('Deleting from auth.users:', tempAdmin.id);
    const { error: delAuthErr } = await supabase.auth.admin.deleteUser(tempAdmin.id);
    if (delAuthErr) {
      console.error('Error deleting auth user:', delAuthErr);
    } else {
      console.log('Auth user deleted successfully');
    }

    console.log('Deleting from public.users...');
    const { error: delDbErr } = await supabase.from('users').delete().eq('id', tempAdmin.id);
    if (delDbErr) {
      console.error('Error deleting public.users record:', delDbErr);
    } else {
      console.log('Public user record deleted successfully');
    }
  } else {
    console.log('Temp admin user not found');
  }
}
run();
