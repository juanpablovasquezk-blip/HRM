
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function checkReqs() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data, error } = await supabase.from('shift_requirements').select('*').limit(10);
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}

checkReqs();
