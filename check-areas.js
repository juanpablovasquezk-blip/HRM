const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: areas } = await supabase.from('areas').select('id, name');
  console.log('AREAS:', areas);
  
  const { data: reqs } = await supabase
    .from('transport_requests')
    .select('id, personnel_id, transport_type, assignment:shift_assignments(area:areas(name))')
    .eq('date', '2026-05-16');
    
  console.log('REQS for 2026-05-16:', JSON.stringify(reqs, null, 2));
}

check();
