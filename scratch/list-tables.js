const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function listTables() {
  // Querying the internal schema to see what's there
  const { data, error } = await supabase.rpc('get_tables'); // If a custom RPC exists
  
  if (error) {
    // Fallback: try to just select from common names
    console.log('RPC failed, trying direct select...');
    const tables = ['system_settings', 'settings', 'config'];
    for (const t of tables) {
       const { error: err } = await supabase.from(t).select('count', { count: 'exact', head: true });
       if (!err) {
         console.log(`Table found: ${t}`);
       } else {
         console.log(`Table NOT found: ${t} (${err.message})`);
       }
    }
  } else {
    console.log('Tables:', data);
  }
}

listTables();
