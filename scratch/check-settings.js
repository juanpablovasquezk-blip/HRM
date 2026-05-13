const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSettings() {
  const { data, error } = await supabase
    .from('system_settings')
    .select('key, value')
    .like('key', 'ultramsg%');

  if (error) {
    console.error('Error fetching settings:', error);
    return;
  }

  console.log('--- UltraMsg Settings ---');
  data.forEach(s => console.log(`${s.key}: ${s.value}`));
  console.log('--------------------------');
}

checkSettings();
