import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkBlueTmpls() {
  const blueExpressId = '1e805b0f-6d6c-471e-bad9-c48669342735';
  const { data: tmpls } = await supabase
    .from('requirement_templates')
    .select('*, shift:shifts(name)')
    .eq('area_id', blueExpressId);
    
  console.log('BlueExpress Templates:', JSON.stringify(tmpls, null, 2));
}

checkBlueTmpls();
