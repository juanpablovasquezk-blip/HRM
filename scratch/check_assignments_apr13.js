const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const { data: assignments } = await supabase
    .from('shift_assignments')
    .select('*, personnel(first_name), shifts(name), positions(name)')
    .eq('date', '2026-04-13');

  const helpers = assignments.filter(a => (a.positions.name || '').toUpperCase().includes('AYUDANTE'));
  console.log('--- AYUDANTE ASSIGNMENTS FOR APR 13 ---');
  console.log(JSON.stringify(helpers, null, 2));
}

run();
