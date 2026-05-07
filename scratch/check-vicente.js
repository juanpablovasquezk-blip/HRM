const { createClient } = require('@supabase/supabase-js');

// Extract from process.env if available, but I don't have it easily.
// I'll try to read it from .env.local if it exists.
const fs = require('fs');
const path = require('path');

try {
  const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
  const url = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1];
  const key = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1];

  const supabase = createClient(url, key);

  async function run() {
    const { data, error } = await supabase
      .from('personnel')
      .select('*')
      .ilike('first_name', '%Vicente%');
    
    console.log(JSON.stringify(data, null, 2));
  }
  run();
} catch (e) {
  console.error(e.message);
}
