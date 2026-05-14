
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function check() {
  const { count } = await supabase.from('positions').select('*', { count: 'exact', head: true });
  console.log('Positions count:', count);
  const { data } = await supabase.from('positions').select('*');
  console.log('Positions names:', data.map(p => p.name));
}

check();
