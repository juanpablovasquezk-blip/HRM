
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const date = '2026-04-21';
  const { data: assignments, error } = await supabase
    .from('shift_assignments')
    .select('id, is_confirmed, personnel(first_name, last_name_father)')
    .eq('date', date);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  const confirmed = assignments.filter(a => a.is_confirmed).length;
  const unconfirmed = assignments.filter(a => !a.is_confirmed).length;
  
  console.log(`Assignments for ${date}:`);
  console.log(`- Confirmed: ${confirmed}`);
  console.log(`- Unconfirmed: ${unconfirmed}`);
  
  if (unconfirmed > 0) {
    console.log('Sample unconfirmed:', assignments.filter(a => !a.is_confirmed).slice(0, 5).map(a => `${a.personnel?.first_name} ${a.personnel?.last_name_father}`));
  }
}

check();
