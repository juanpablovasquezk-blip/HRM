const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBodega() {
  const { data: personnel, error } = await supabase
    .from('personnel')
    .select('*, main_position_obj:positions(name)')
    .or('main_position.eq.6e0bf4a2-dca2-4564-a277-03457ac51783,main_position.eq.59d72c16-a45f-4b6a-a2b0-c5214562adc4');

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Analyzing ${personnel?.length} warehouse operators:`);
  personnel?.forEach(p => {
    console.log(`- ${p.first_name} ${p.last_name_father} (${p.main_position_obj.name}): ${p.rotation_pattern || 'No pattern'}`);
  });
}

checkBodega();
