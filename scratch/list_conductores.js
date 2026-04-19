const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const { data: personnel } = await supabase
    .from('personnel')
    .select('id, first_name, last_name_father, main_position_name, rotation_pattern');

  console.log('--- ALL CONDUCTORS ---');
  const conductors = personnel.filter(p => (p.main_position_name || '').toUpperCase().includes('CONDUCTOR'));
  console.log(JSON.stringify(conductors, null, 2));
}

run();
