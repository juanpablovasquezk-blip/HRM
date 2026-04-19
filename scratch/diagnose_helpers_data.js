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
  console.log('--- DIAGNOSTIC: HELPERS DATA ---');
  console.log(JSON.stringify(helpers.map(h => ({
    name: h.first_name + ' ' + h.last_name_father,
    pattern: h.rotation_pattern,
    hire: h.hire_date,
    term: h.termination_date,
    is_active: h.is_active
  })), null, 2));

  // Get shifts to check names
  const { data: shifts } = await supabase.from('shifts').select('*');
  console.log('--- DIAGNOSTIC: SHIFTS ---');
  console.log(JSON.stringify(shifts.map(s => ({id: s.id, name: s.name})), null, 2));
}

run();
