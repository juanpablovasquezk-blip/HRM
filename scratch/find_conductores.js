const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  console.log('--- FINDING CONDUCTORES ---');
  const { data: personnel } = await supabase
    .from('personnel')
    .select('id, first_name, last_name_father, main_position_name')
    .or('last_name_father.ilike.%Colina%,last_name_father.ilike.%Gutierrez%,last_name_father.ilike.%Perez%');

  console.log(JSON.stringify(personnel, null, 2));

  console.log('--- FINDING SHIFTS ---');
  const { data: shifts } = await supabase
    .from('shifts')
    .select('id, name, start_time');

  console.log(JSON.stringify(shifts, null, 2));
}

run();
