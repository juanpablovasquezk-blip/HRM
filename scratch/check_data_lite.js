const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const { data: shifts } = await supabase
    .from('shifts')
    .select('id, name, start_time, end_time');
    
  console.log('SHIFTS_DATA:');
  console.log(JSON.stringify(shifts, null, 2));

  const { data: personnel } = await supabase
    .from('personnel')
    .select('id, full_name, rotation_pattern')
    .or('full_name.ilike.%Juan Colina%,full_name.ilike.%Cristopher Gutierrez%,full_name.ilike.%Nicanor Perez%');

  console.log('PERSONNEL_DATA:');
  console.log(JSON.stringify(personnel, null, 2));
}

run();
