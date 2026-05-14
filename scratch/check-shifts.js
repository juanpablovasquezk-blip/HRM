const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkShifts() {
  console.log('--- CHECKING SHIFT TIMES FOR TODAY (2026-05-14) ---');
  
  const { data, error } = await supabase
    .from('shift_assignments')
    .select('id, is_confirmed, date, shift:shifts!shift_assignments_shift_id_fkey(name, start_time, end_time)')
    .eq('date', '2026-05-14');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${data.length} assignments.`);
  data.forEach(asg => {
    console.log(`ID: ${asg.id.substring(0,8)} | Confirmed: ${asg.is_confirmed} | Shift: ${asg.shift?.name} | Start: ${asg.shift?.start_time}`);
  });
  
  console.log('--- END ---');
}

checkShifts();
