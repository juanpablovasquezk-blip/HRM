const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const dates = ['2026-04-18', '2026-04-19'];
  for (const date of dates) {
    const { data: reqs } = await supabase
      .from('shift_requirements')
      .select('*, shifts(name), positions(name)')
      .eq('date', date);

    const helpers = reqs.filter(r => (r.positions.name || '').toUpperCase().includes('AYUDANTE'));
    console.log(`--- AYUDANTE REQUIREMENTS FOR ${date} ---`);
    console.log(JSON.stringify(helpers, null, 2));
  }
}

run();
