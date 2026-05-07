const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

try {
  const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
  const url = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1];
  const key = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1];

  const supabase = createClient(url, key);

  async function run() {
    const personId = "54fafc46-d113-4e8b-934e-7094395deff4";
    const { data, error } = await supabase
      .from('shift_assignments')
      .delete()
      .eq('personnel_id', personId)
      .gte('date', '2026-05-01')
      .lte('date', '2026-05-31');
    
    if (error) console.error('Error deleting:', error.message);
    else console.log(`Deleted assignments for Vicente in May.`);
  }
  run();
} catch (e) {
  console.error(e.message);
}
