const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMatiasArea() {
  const { data, error } = await supabase
    .from('personnel')
    .select('name, areas(name)')
    .ilike('name', '%MATIAS%NAVARRO%')
    .single();
    
  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('Matias Area:', JSON.stringify(data, null, 2));
  }
}

checkMatiasArea();
