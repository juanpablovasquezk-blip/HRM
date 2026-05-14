import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  console.log('Checking ANY transport_requests...');
  const { data, error } = await supabase
    .from('transport_requests')
    .select(`
      id,
      date,
      transport_type,
      personnel:personnel(first_name, last_name_father)
    `)
    .limit(10);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Found:', data.length);
  data.forEach(r => {
    console.log(`${r.date} | ${r.personnel?.first_name} ${r.personnel?.last_name_father}: ${r.transport_type}`);
  });
}

check();
