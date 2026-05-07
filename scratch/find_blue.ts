import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function findBlueExpress() {
  const { data: areas } = await supabase.from('areas').select('*').ilike('name', '%Blue%');
  console.log('Areas:', JSON.stringify(areas, null, 2));
  
  const { data: companies } = await supabase.from('companies').select('*').ilike('name', '%Blue%');
  console.log('Companies:', JSON.stringify(companies, null, 2));
}

findBlueExpress();
