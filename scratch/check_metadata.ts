import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMetadata() {
  const { data: positions } = await supabase.from('positions').select('id, name');
  const { data: areas } = await supabase.from('areas').select('id, name');
  const { data: shifts } = await supabase.from('shifts').select('id, name, start_time');

  console.log('Positions:', positions);
  console.log('Areas:', areas);
  console.log('Shifts:', shifts);
}

checkMetadata();
