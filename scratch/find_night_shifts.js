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
    
  console.log('--- ALL SHIFTS ---');
  console.log(JSON.stringify(shifts, null, 2));

  const { data: requirements } = await supabase
    .from('shift_requirements')
    .select('*, shifts(name), positions(name)')
    .eq('date', '2026-04-20');

  const conductors = requirements.filter(r => (r.positions.name || '').toUpperCase().includes('CONDUCTOR'));
  console.log('--- CONDUCTOR REQUIREMENTS FOR APR 20 ---');
  console.log(JSON.stringify(conductors, null, 2));
}

run();
