import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const email = 'tempadmin@minerquim.cl';
  const password = 'password123';

  console.log('Checking if temp admin already exists...');
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  let tempAdmin = authUsers?.users.find(u => u.email === email);

  if (!tempAdmin) {
    console.log('Creating temp admin in auth...');
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'ADMIN' }
    });
    if (createErr) {
      console.error('Error creating user:', createErr);
      return;
    }
    tempAdmin = newUser.user;
    console.log('Created auth user:', tempAdmin.id);
  } else {
    console.log('Found existing auth user:', tempAdmin.id);
  }

  // Ensure public.users entry has role ADMIN
  const { data: dbUser } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', tempAdmin.id)
    .maybeSingle();

  if (!dbUser) {
    const { error: insErr } = await supabase.from('users').upsert({
      id: tempAdmin.id,
      email,
      full_name: 'TEMP ADMIN',
      role: 'ADMIN'
    });
    if (insErr) {
      console.error('Error creating public.users record:', insErr);
      return;
    }
    console.log('Upserted public.users record');
  } else if (dbUser.role !== 'ADMIN') {
    const { error: updErr } = await supabase
      .from('users')
      .update({ role: 'ADMIN' })
      .eq('id', tempAdmin.id);
    if (updErr) {
      console.error('Error updating public.users role:', updErr);
      return;
    }
    console.log('Updated role to ADMIN in public.users');
  } else {
    console.log('Role is already ADMIN in public.users');
  }
  
  console.log('Temporary admin user is ready!');
}
run();
