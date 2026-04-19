const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const { error } = await supabase
    .from('personnel')
    .update({ rotation_pattern: 'BLUE_NOCHE-3' })
    .eq('id', '91c15499-1d2f-47d9-a1d1-ad73cc9a2c33');
  
  if (error) console.error(error);
  else console.log('Success');
}

run();
