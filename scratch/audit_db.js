const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const { data: reqs } = await supabase.from('shift_requirements').select('*').gte('date', '2026-04-01').lte('date', '2026-04-30');
  console.log(`Found ${reqs?.length || 0} requirements in April.`);
  if (reqs && reqs.length > 0) {
    console.log('Sample:', JSON.stringify(reqs[0], null, 2));
  }

  const { data: tmpls } = await supabase.from('requirement_templates').select('*');
  console.log(`Found ${tmpls?.length || 0} templates.`);
  if (tmpls && tmpls.length > 0) {
    console.log('Template Sample:', JSON.stringify(tmpls[0], null, 2));
  }
}

run();
