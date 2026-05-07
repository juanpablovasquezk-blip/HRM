import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkPerson() {
  const id = 'e46359a1-2ebc-4448-9897-cfd0e42ce4fd';
  const { data, error } = await supabase
    .from('personnel')
    .select('*, positions(name)')
    .eq('id', id);
    
  console.log('Data:', JSON.stringify(data, null, 2));
  console.log('Error:', error);
}

checkPerson();
