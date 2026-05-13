const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUser(email) {
  const { data, error } = await supabase
    .from('users')
    .select('email, role')
    .eq('email', email)
    .single();

  if (error) {
    console.error('Error fetching user:', error);
    return;
  }

  console.log(`User: ${data.email}, Role: ${data.role}`);
}

// I'll check the user who was just trying to log in if I can find them.
// Actually I'll just check for any Admin.
async function listAdmins() {
  const { data, error } = await supabase
    .from('users')
    .select('email, role')
    .eq('role', 'ADMIN');

  if (error) {
    console.error('Error fetching admins:', error);
    return;
  }

  console.log('--- Admins ---');
  data.forEach(u => console.log(`${u.email}: ${u.role}`));
  console.log('--------------');
}

listAdmins();
