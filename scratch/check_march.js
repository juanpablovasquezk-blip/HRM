const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMarchReqs() {
  const { data, error } = await supabase
    .from('shift_requirements')
    .select('count')
    .gte('date', '2026-03-01')
    .lte('date', '2026-03-31');

  if (error) {
    console.error(error);
    return;
  }

  console.log('Requirements in March 2026:', data.length > 0 ? data[0].count : 0);
  
  const { data: all } = await supabase
    .from('shift_requirements')
    .select('date, required_count')
    .gte('date', '2026-03-25')
    .lte('date', '2026-03-31');
    
  console.log('Specific last days of March:', all);
}

checkMarchReqs();
