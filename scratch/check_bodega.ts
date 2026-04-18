import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBodega() {
  const { data: personnel, error } = await supabase
    .from('personnel')
    .select('*, main_position_obj:positions(name)')
    .ilike('main_position_obj.name', '%BODEGA%');

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Found ${personnel?.length} warehouse operators:`);
  personnel?.forEach(p => {
    console.log(`- ${p.first_name} ${p.last_name_father}: ${p.rotation_pattern || 'No pattern'}`);
  });
}

checkBodega();
