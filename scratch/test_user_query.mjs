import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Create a client with ANON key (just like the client browser/server does for regular users)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  // Let's sign in as ctobar@minerquim.cl
  console.log('Signing in as ctobar@minerquim.cl...');
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: 'ctobar@minerquim.cl',
    password: 'password123' // Wait, we reset juanpablo.vasquezk@gmail.com's password, let's see if ctobar works or if we should use juanpablo
  });

  if (signInError) {
    console.error('Sign in failed:', signInError.message);
    // Let's try juanpablo.vasquezk@gmail.com which we know has password123
    console.log('Signing in as juanpablo.vasquezk@gmail.com...');
    const { data: signInData2, error: signInError2 } = await supabase.auth.signInWithPassword({
      email: 'juanpablo.vasquezk@gmail.com',
      password: 'password123'
    });
    if (signInError2) {
      console.error('Sign in 2 failed:', signInError2.message);
      return;
    }
    console.log('Signed in successfully as juanpablo');
  } else {
    console.log('Signed in successfully as ctobar');
  }

  // Now, query transport_requests
  console.log('Querying transport_requests as authenticated user...');
  const { data: reqs, error: reqsError } = await supabase
    .from('transport_requests')
    .select(`
      id,
      date,
      transport_type,
      personnel:personnel!transport_requests_personnel_id_fkey(id, first_name),
      assignment:shift_assignments!transport_requests_assignment_id_fkey(id)
    `)
    .gte('date', '2026-05-01')
    .lte('date', '2026-05-31');

  if (reqsError) {
    console.error('Query failed:', reqsError);
  } else {
    console.log('Query succeeded. Rows returned:', reqs.length);
    console.log('Sample rows:', reqs.slice(0, 5));
  }
}
run();
