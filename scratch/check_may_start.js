const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMayStart() {
  const { data, error } = await supabase
    .from('shift_requirements')
    .select('date, required_count')
    .gte('date', '2026-05-01')
    .lte('date', '2026-05-03');

  if (error) {
    console.error(error);
    return;
  }

  console.log('Requirements May 1-3:', data);
  
  const { data: assignments } = await supabase
    .from('shift_assignments')
    .select('date')
    .gte('date', '2026-05-01')
    .lte('date', '2026-05-03');
    
  console.log('Assignments May 1-3:', assignments.length);
}

checkMayStart();
