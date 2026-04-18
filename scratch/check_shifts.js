const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkShifts() {
  const { data: shifts, error } = await supabase.from('shifts').select('*');
  if (error) {
    console.error(error);
    return;
  }
  console.log('Available Shifts:');
  shifts?.forEach(s => console.log(`- ${s.name}: ${s.start_time} (ID: ${s.id})`));
}

checkShifts();
