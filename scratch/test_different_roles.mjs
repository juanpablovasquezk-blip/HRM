import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const roles = ['USER', 'SUPERVISOR', 'HR', 'ADMIN'];

async function testRole(role) {
  const email = `test_${role.toLowerCase()}@minerquim.cl`;
  const password = 'password123';

  console.log(`\n--- Testing role: ${role} ---`);

  // Find or create user
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  let testUser = authUsers?.users.find(u => u.email === email);

  if (!testUser) {
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role }
    });
    if (createErr) {
      console.error(`Error creating user for ${role}:`, createErr);
      return;
    }
    testUser = newUser.user;
    console.log(`Created auth user ${role}:`, testUser.id);
  } else {
    console.log(`Found auth user ${role}:`, testUser.id);
  }

  // Ensure public.users entry exists and has the correct role
  const { error: upsertErr } = await supabase.from('users').upsert({
    id: testUser.id,
    email,
    full_name: `TEST ${role}`,
    role: role
  });

  if (upsertErr) {
    console.error(`Error upserting public.users for ${role}:`, upsertErr);
    return;
  }

  // Sign in
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { error: signInError } = await userClient.auth.signInWithPassword({
    email,
    password
  });

  if (signInError) {
    console.error(`Sign in failed for ${role}:`, signInError);
    return;
  }

  // Query
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
    console.error(`Query failed for ${role}:`, queryError);
  } else {
    console.log(`Query succeeded for ${role}. Rows returned:`, res.length);
    if (res.length > 0) {
      const firstRow = res[0];
      console.log(`- Sample row ID: ${firstRow.id}`);
      console.log(`- Has personnel: ${firstRow.personnel ? 'Yes' : 'No'}`);
      console.log(`- Has assignment: ${firstRow.assignment ? 'Yes' : 'No'}`);
      if (firstRow.assignment) {
        console.log(`- Has assignment area: ${firstRow.assignment.area ? 'Yes' : 'No'}`);
        console.log(`- Has assignment shift: ${firstRow.assignment.shift ? 'Yes' : 'No'}`);
      }
    }
  }

  // Clean up
  await supabase.auth.admin.deleteUser(testUser.id);
  console.log(`Cleaned up user for ${role}`);
}

async function run() {
  for (const role of roles) {
    await testRole(role);
  }
}
run();
