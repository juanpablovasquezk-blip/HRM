const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAnyReqs() {
  const { data, error } = await supabase
    .from('shift_requirements')
    .select('date, required_count')
    .limit(10);

  if (error) {
    console.error(error);
    return;
  }

  console.log('Sample Requirements:', data);
}

checkAnyReqs();
