import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function listTmpls() {
  const { data: tmpls } = await supabase
    .from('requirement_templates')
    .select('*, area:areas(name), shift:shifts(name)');
    
  console.log('All Templates:', JSON.stringify(tmpls, null, 2));
}

listTmpls();
