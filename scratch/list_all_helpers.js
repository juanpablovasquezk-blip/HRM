const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const { data: personnel } = await supabase
    .from('personnel')
    .select('id, first_name, last_name_father, rotation_pattern, main_position_name')
    .ilike('main_position_name', '%AYUDANTE%');

  console.log('--- ALL AYUDANTES ---');
  console.log(JSON.stringify(personnel, null, 2));
}

run();
