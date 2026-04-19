const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const dates = ['2026-04-25', '2026-05-01'];
  
  console.log('--- SHIFT REQUIREMENTS ---');
  const { data: requirements } = await supabase
    .from('shift_requirements')
    .select('*, shifts(name), positions(name)')
    .in('date', dates);

  const filtered = requirements
    .filter(r => r.positions.name.toUpperCase().includes('CONDUCTOR'))
    .map(r => ({
      date: r.date,
      shift: r.shifts.name,
      count: r.count
    }));

  console.log(JSON.stringify(filtered, null, 2));

  console.log('\n--- PERSONNEL ROTATION PATTERNS ---');
  const { data: personnel } = await supabase
    .from('personnel')
    .select('id, first_name, last_name_father, rotation_pattern')
    .or('last_name_father.ilike.%Colina%,last_name_father.ilike.%Gutierrez%,last_name_father.ilike.%Perez%');
  
  console.log(JSON.stringify(personnel, null, 2));
}

run();
