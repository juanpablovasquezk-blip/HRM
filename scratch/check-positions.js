const { createClient } = require('@supabase/supabase-js');

async function checkPositions() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  const supabase = createClient(url, key);
  const { data } = await supabase.from('positions').select('name');
  console.log(data.map(p => p.name));
}

checkPositions();
