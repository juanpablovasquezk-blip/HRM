const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const { data: people } = await supabase
    .from('personnel')
    .select('id, first_name, last_name_father')
    .ilike('last_name_father', '%TEJOS%');

  console.log(JSON.stringify(people, null, 2));
}

run();
