const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function findRodrigo() {
  const { data } = await supabase.from('personnel').select('*').ilike('first_name', '%RODRIGO%');
  console.log('Results:', data.map(p => `${p.first_name} ${p.last_name_father}`));
}

findRodrigo();
