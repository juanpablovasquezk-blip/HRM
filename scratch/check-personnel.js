const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPersonnel() {
  const { data, error } = await supabase
    .from('personnel')
    .select('first_name, last_name_father, phone')
    .or('first_name.ilike.%BRANCO%,first_name.ilike.%BENJAMIN%');

  if (error) {
    console.error('Error fetching personnel:', error);
    return;
  }

  console.log('--- Personnel Info ---');
  data.forEach(p => console.log(`${p.first_name} ${p.last_name_father}: ${p.phone}`));
  console.log('--------------------------');
}

checkPersonnel();
