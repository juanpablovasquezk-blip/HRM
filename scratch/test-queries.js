const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

try {
  const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
  const url = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1];
  const key = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1];

  const supabase = createClient(url, key);

  async function test() {
    console.log('Testing listRequirements...');
    const { data: reqs, error: err1 } = await supabase
      .from('shift_requirements')
      .select('*, shift:shifts(name, start_time, end_time), area:areas(name), position:positions(name)')
      .limit(10);
    
    if (err1) console.error('Error in listRequirements:', err1.message);
    else console.log('listRequirements OK, found:', reqs.length);

    console.log('Testing listTemplates...');
    const { data: tmpls, error: err2 } = await supabase
      .from('shift_requirement_templates')
      .select('*, area:areas(name), position:positions(name), shift:shifts(name)')
      .limit(10);

    if (err2) console.error('Error in listTemplates:', err2.message);
    else console.log('listTemplates OK, found:', tmpls.length);
  }
  test();
} catch (e) {
  console.error(e.message);
}
