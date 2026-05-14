const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function simulateRouting() {
  console.log('--- SIMULATION START ---');
  
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

  console.log(`Worker: ${pData.first_name} ${pData.last_name_father}`);
  console.log(`Rotation Pattern: ${pData.rotation_pattern}`);

  // Logic simulation
  let areaNameSearch = pData.rotation_pattern || '';
  const areaNameUpper = areaNameSearch.toUpperCase();
  
  let group = 'OTHERS';
  if (areaNameUpper.includes('BLUE')) group = 'BLUE';
  
  console.log(`FINAL DESTINATION GROUP: ${group}`);
  console.log('--- SIMULATION END ---');
}

simulateRouting();
