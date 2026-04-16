
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function checkMathias() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data: personnel, error } = await supabase.from('personnel').select('*').ilike('first_name', '%MATHIAS%');
  if (error) {
    console.error(error);
    return;
  }
  
  const { data: positions } = await supabase.from('positions').select('id, name');
  const posMap = Object.fromEntries(positions.map(p => [p.id, p.name]));
  
  personnel.forEach(p => {
    console.log(`Person: ${p.first_name} ${p.last_name_father}`);
    console.log(`Main Position: ${posMap[p.main_position]} (${p.main_position})`);
    console.log(`Secondary Positions: ${(p.secondary_positions || []).map(id => posMap[id] || id).join(', ')}`);
    console.log(`Rotation: ${p.rotation_pattern}`);
    console.log('---');
  });
}

checkMathias();
