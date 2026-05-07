const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

try {
  const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
  const url = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1];
  const key = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1];

  const supabase = createClient(url, key);

  async function test() {
    console.log('Testing requirement_templates with joins...');
    const { data, error } = await supabase
      .from('requirement_templates')
      .select('*, area:areas(name), position:positions(name), shift:shifts(name)')
      .limit(10);
    
    if (error) {
      console.error('Error:', error.message);
    } else {
      console.log('Found:', data.length);
      console.log('First record sample:', JSON.stringify(data[0], null, 2));
    }
  }
  test();
} catch (e) {
  console.error(e.message);
}
