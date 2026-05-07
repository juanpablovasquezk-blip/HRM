
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: assignments, error } = await supabase
    .from('shift_assignments')
    .select('*, shift:shifts(*)')
    .eq('date', '2026-04-21')
    .eq('is_confirmed', true);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Confirmed Assignments for 21st:', assignments?.length);
  if (assignments) {
    assignments.forEach(a => {
      console.log(`- Shift: ${a.shift?.start_time} - ${a.shift?.end_time}`);
    });
  }
}

check();
