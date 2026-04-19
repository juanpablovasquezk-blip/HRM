const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  // Get all positions to know the ID for Ayudante
  const { data: pos } = await supabase.from('positions').select('*');
  const helperPosId = pos.find(p => p.name.includes('Ayudante'))?.id;
  console.log('Helper Position ID:', helperPosId);

  const { data: personnel } = await supabase
    .from('personnel')
    .select('*')
    .eq('main_position', helperPosId);

  if (!personnel) {
    console.log('No personnel found');
    return;
  }

  console.log('--- ALL HELPERS ---');
  console.log(JSON.stringify(personnel.map(p => ({
    id: p.id,
    name: p.first_name + ' ' + p.last_name_father,
    pattern: p.rotation_pattern,
    term: p.termination_date
  })), null, 2));
}

run();
