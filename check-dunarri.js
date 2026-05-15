const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: personnel } = await supabase.from('personnel').select('*').ilike('last_name_father', '%DUNARRI%');
  console.log('DUNARRI PERSONNEL:', personnel);
  
  if (personnel && personnel.length > 0) {
    const { data: assignments } = await supabase
      .from('shift_assignments')
      .select('*, area:areas(name)')
      .eq('personnel_id', personnel[0].id)
      .eq('date', '2026-05-16');
    console.log('DUNARRI ASSIGNMENTS:', JSON.stringify(assignments, null, 2));
  }
}

check();
