import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'http://hrm-supabase-e8b016-187-127-24-58.traefik.me';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzYxMjE0MDMsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.jqUPui-C58gACQVYTrZSr_30Rt2_7X79TJXfh_BJJT0';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.rpc('get_table_names'); // If this RPC exists
  if (error) {
     // fallback to a generic query to see schema if possible
     console.log("No RPC, trying select from information_schema");
     const { data: tables, error: err2 } = await supabase.from('transport_requests').select('*').limit(1);
     console.log("Transport requests sample:", tables);
  } else {
     console.log(data);
  }
}

check();
