import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkManual() {
  const { count } = await supabase
    .from('shift_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('is_manual', true);

  console.log(`Manual assignments count: ${count}`);
}

checkManual();
