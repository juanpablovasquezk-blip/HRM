const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function findMatias() {
  const { data, error } = await supabase.from('personnel').select('*').limit(5);
  console.log('Columns:', Object.keys(data[0]));
  
  const { data: matias } = await supabase.from('personnel').select('*').ilike('first_name', '%MATIAS%').ilike('last_name_father', '%NAVARRO%');
  console.log('Matias found:', matias);
}

findMatias();
