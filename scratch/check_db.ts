import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Checking database status...');
  
  const { count: companies } = await supabase.from('companies').select('*', { count: 'exact', head: true });
  const { count: personnel } = await supabase.from('personnel').select('*', { count: 'exact', head: true });
  const { count: shifts } = await supabase.from('shifts').select('*', { count: 'exact', head: true });
  const { count: areas } = await supabase.from('areas').select('*', { count: 'exact', head: true });
  const { count: positions } = await supabase.from('positions').select('*', { count: 'exact', head: true });
  const { count: requirements } = await supabase.from('shift_requirements').select('*', { count: 'exact', head: true });
  const { count: assignments } = await supabase.from('shift_assignments').select('*', { count: 'exact', head: true });

  console.log({
    companies,
    personnel,
    shifts,
    areas,
    positions,
    requirements,
    assignments
  });
}

check();
