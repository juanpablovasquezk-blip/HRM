import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

async function checkSettings() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase.from('system_settings').select('*');
  if (error) {
    console.error('Error fetching settings:', error);
    return;
  }

  console.log('--- SYSTEM SETTINGS ---');
  data.forEach(s => {
    console.log(`${s.key}: ${s.value}`);
  });
}

checkSettings();
