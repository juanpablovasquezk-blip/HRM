const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function discoverTables() {
  console.log('Discovering tables...');
  
  // Try to query common tables to see if they work
  const common = ['personnel', 'areas', 'positions', 'shift_assignments'];
  for (const t of common) {
    const { error } = await supabase.from(t).select('count', { count: 'exact', head: true });
    if (error) {
      console.log(`Table ${t}: Error (${error.message})`);
    } else {
      console.log(`Table ${t}: OK`);
    }
  }
  
  // Check system_settings specifically again
  const { error: ssError } = await supabase.from('system_settings').select('*').limit(1);
  console.log(`system_settings result: ${ssError ? ssError.message : 'OK'}`);
}

discoverTables();
