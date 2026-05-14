const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkValidation() {
  console.log('--- CHECKING VALIDATION FOR 2026-05-14 ---');
  
  const { data, count } = await supabase
    .from('shift_assignments')
    .select('id, is_confirmed', { count: 'exact' })
    .eq('date', '2026-05-14');

  if (!data || data.length === 0) {
    console.log('No assignments found for today.');
  } else {
    const confirmedCount = data.filter(a => a.is_confirmed).length;
    console.log(`Total Assignments: ${data.length}`);
    console.log(`Confirmed Assignments: ${confirmedCount}`);
  }
  
  console.log('--- END ---');
}

checkValidation();
