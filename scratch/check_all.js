const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAll() {
  const { count, error } = await supabase
    .from('personnel')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error(error);
    return;
  }

  const { data: posData } = await supabase.from('positions').select('name, id');
  
  console.log(`Total workers: ${count}`);
  console.log('Positions found:');
  posData?.forEach(p => console.log(`- ${p.name} (ID: ${p.id})`));
}

checkAll();
