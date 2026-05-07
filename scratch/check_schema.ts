import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkFKs() {
  const { data, error } = await supabase.rpc('get_table_fks', { table_name: 'personnel' });
  // Since we don't know if that RPC exists, let's just try to list personnel with nothing joined
  const { data: p } = await supabase.from('personnel').select('*').limit(1);
  console.log('Sample personnel:', p);
}

async function checkPositions() {
  const { data: pos } = await supabase.from('positions').select('*').limit(1);
  console.log('Sample position:', pos);
}

checkPositions();
checkFKs();
