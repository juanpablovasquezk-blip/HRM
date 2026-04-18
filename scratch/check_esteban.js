const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkEsteban() {
  const { data: p, error } = await supabase
    .from('personnel')
    .select('*')
    .ilike('first_name', '%ESTEBAN%')
    .single();

  if (error) {
    console.error(error);
    return;
  }

  console.log('Worker:', p.first_name, p.last_name_father);
  console.log('Special Contract:', p.has_special_contract);
  console.log('Rotation Pattern:', p.rotation_pattern);
}

checkEsteban();
