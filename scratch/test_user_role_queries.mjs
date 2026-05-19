import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  // 1. Create a test user with role USER if not exists
  const email = 'testuser@minerquim.cl';
  const password = 'password123';
  
  console.log('Finding or creating test user in auth...');
  const { data: authUsers, error: authErr } = await supabase.auth.admin.listUsers();
  let testUser = authUsers?.users.find(u => u.email === email);
  
  if (!testUser) {
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'USER' }
    });
    if (createErr) {
      console.error('Error creating user:', createErr);
      return;
    }
    testUser = newUser.user;
    console.log('Created auth user:', testUser.id);
  } else {
    console.log('Found auth user:', testUser.id);
  }

  // Ensure public.users entry has role USER
  const { data: dbUser, error: dbErr } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', testUser.id)
    .single();

  if (dbErr || !dbUser) {
    const { error: insErr } = await supabase.from('users').upsert({
      id: testUser.id,
      email,
      full_name: 'TEST USER',
      role: 'USER'
    });
    if (insErr) {
      console.error('Error creating public.users record:', insErr);
      return;
    }
    console.log('Upserted public.users record');
  } else {
    console.log('Existing public.users record:', dbUser);
  }

  // Now, log in as this user and run the query!
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { error: signInError } = await userClient.auth.signInWithPassword({
    email,
    password
  });

  if (signInError) {
    console.error('Sign in failed:', signInError);
    return;
  }
  console.log('Signed in successfully as testuser@minerquim.cl');

  // Let's run the exact query from reports/actions.ts
  const { data: res, error: queryError } = await userClient
    .from('transport_requests')
    .select(`
      *, 
      personnel:personnel!transport_requests_personnel_id_fkey(*), 
      assignment:shift_assignments!transport_requests_assignment_id_fkey(
        *, 
        shift:shifts!shift_assignments_shift_id_fkey(*), 
        area:areas(*), 
        position:positions(*)
      )
    `)
    .gte('date', '2026-05-01')
    .lte('date', '2026-05-31');

  if (queryError) {
    console.error('Query failed:', queryError);
  } else {
    console.log('Query completed successfully. Rows returned:', res.length);
    if (res.length > 0) {
      console.log('Sample row personnel:', res[0].personnel);
      console.log('Sample row assignment:', res[0].assignment);
    }
  }

  // Clean up
  await supabase.auth.admin.deleteUser(testUser.id);
  console.log('Cleaned up test user');
}
run();
