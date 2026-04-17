const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function research() {
  const { data: positions } = await supabase.from('positions').select('*');
  if (!positions) return;

  const namesMap = new Map();
  positions.forEach(p => {
    const name = p.name.toUpperCase();
    if (!namesMap.has(name)) namesMap.set(name, []);
    namesMap.get(name).push(p);
  });

  console.log('--- DUPLICATE ANALYSIS ---');
  for (const [name, list] of namesMap) {
    if (list.length > 1) {
      console.log(`Cargo: ${name}`);
      list.forEach(p => console.log(`  - ID: ${p.id} (Area: ${p.area_id || 'Global'})`));
    }
  }

  const { data: personnel } = await supabase.from('personnel').select('id, first_name, main_position');
  const { data: reqs } = await supabase.from('shift_requirements').select('id, date, position_id').limit(100);

  console.log('\n--- USAGE IN PERSONNEL ---');
  personnel.forEach(p => {
    const pos = positions.find(pos => pos.id === p.main_position);
    console.log(`${p.first_name}: ${pos?.name} [${p.main_position.substring(0, 8)}]`);
  });
}

research();
