const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMatiasAssignment() {
  console.log('--- ASSIGNMENT CHECK START ---');
  
  const { data: pData } = await supabase
    .from('personnel')
    .select('*')
    .ilike('first_name', '%MATIAS%')
    .ilike('last_name_father', '%NAVARRO%')
    .single();

  if (!pData) {
    console.log('Worker not found');
    return;
  }

  const { data: asg } = await supabase
    .from('shift_assignments')
    .select('*, areas(name), positions(name)')
    .eq('personnel_id', pData.id)
    .order('date', { ascending: false })
    .limit(1)
    .single();

  if (asg) {
    console.log(`Assignment Date: ${asg.date}`);
    console.log(`Area ID: ${asg.area_id}`);
    console.log(`Area Name (via join): ${asg.areas?.name || 'NULL'}`);
    console.log(`Position ID: ${asg.position_id}`);
    console.log(`Position Name (via join): ${asg.positions?.name || 'NULL'}`);
  }
  
  console.log('--- ASSIGNMENT CHECK END ---');
}

checkMatiasAssignment();
