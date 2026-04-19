const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const { data: reqs } = await supabase
    .from('shift_requirements')
    .select('*, shifts(name), positions(name)')
    .eq('date', '2026-04-13');

  const helpers = reqs.filter(r => (r.positions.name || '').toUpperCase().includes('AYUDANTE'));
  console.log('--- AYUDANTE REQUIREMENTS FOR APR 13 ---');
  console.log(JSON.stringify(helpers, null, 2));

  const { data: personnel } = await supabase
    .from('personnel')
    .select('full_name, first_name, last_name_father, rotation_pattern, main_position_name')
    .ilike('main_position_name', '%AYUDANTE%');

  console.log('--- AYUDANTE PERSONNEL ---');
  console.log(JSON.stringify(personnel, null, 2));
}

run();
