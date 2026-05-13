const { createClient } = require('@supabase/supabase-js');

async function checkSettings() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.log('Missing ENV vars');
    return;
  }

  const supabase = createClient(url, key);

  const { data, error } = await supabase.from('system_settings').select('*');
  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('--- SETTINGS ---');
  data.forEach(s => console.log(`${s.key}: ${s.value}`));
}

checkSettings();
