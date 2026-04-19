const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const { data: personnel } = await supabase
    .from('personnel')
    .select('*, positions!personnel_main_position_fkey(name)');

  const helpers = (personnel || []).filter(p => (p.positions?.name || '').toUpperCase().includes('AYUDANTE'));
  console.log('--- ALL AYUDANTES (8) ---');
  console.log(JSON.stringify(helpers.map(h => ({
    name: h.first_name + ' ' + h.last_name_father,
    pattern: h.rotation_pattern,
    termination: h.termination_date
  })), null, 2));
}

run();
