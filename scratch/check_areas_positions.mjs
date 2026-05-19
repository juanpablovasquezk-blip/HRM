import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: areas } = await supabase.from('areas').select('*');
  for (const area of areas) {
    console.log(`Area ID: ${area.id}, Name: ${area.name}`);
  }
}
run();
