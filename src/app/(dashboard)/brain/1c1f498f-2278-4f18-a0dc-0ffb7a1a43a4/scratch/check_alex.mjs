import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'http://hrm-supabase-e8b016-187-127-24-58.traefik.me';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzYxMjE0MDMsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.jqUPui-C58gACQVYTrZSr_30Rt2_7X79TJXfh_BJJT0';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('personnel').select('id, first_name, last_name_father, address').ilike('first_name', '%Alex%').ilike('last_name_father', '%Vignes%');
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}

check();
