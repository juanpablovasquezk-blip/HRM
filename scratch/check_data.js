const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  console.log('Checking Alex Vignes and Juan Colina...');
  
  const { data: personnel, error: pErr } = await supabase
    .from('personnel')
    .select('id, first_name, last_name_father, main_position, secondary_positions')
    .or('first_name.ilike.%Alex%,first_name.ilike.%Juan%');

  if (pErr) {
    console.error('Error fetching personnel:', pErr);
    return;
  }

  console.log('Personnel Found:', JSON.stringify(personnel, null, 2));

  const { data: positions, error: posErr } = await supabase
    .from('positions')
    .select('id, name, area_id');

  if (posErr) {
    console.error('Error fetching positions:', posErr);
    return;
  }

  console.log('Positions found:', JSON.stringify(positions, null, 2));
}

run();
