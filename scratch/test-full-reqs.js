const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

try {
  const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
  const url = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1];
  const key = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1];

  const supabase = createClient(url, key);

  async function test() {
    console.log('Testing full listRequirements...');
    const start = Date.now();
    const { data, error } = await supabase
      .from('shift_requirements')
      .select('*, shift:shifts(name, start_time, end_time), area:areas(name), position:positions(name)')
      .order('date', { ascending: true });
    
    const end = Date.now();
    if (error) {
      console.error('Error:', error.message);
    } else {
      console.log('Found:', data.length, 'records');
      console.log('Time taken:', end - start, 'ms');
    }
  }
  test();
} catch (e) {
  console.error(e.message);
}
