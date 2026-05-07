import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkBodegas() {
  const { data: areas } = await supabase.from('areas').select('*').ilike('name', '%BODEGA%');
  console.log('Areas:', areas);
  
  if (areas && areas.length > 0) {
    const { data: positions } = await supabase.from('positions').select('*').eq('area_id', areas[0].id);
    console.log('Positions in Bodegas:', positions);
  }
}

checkBodegas();
