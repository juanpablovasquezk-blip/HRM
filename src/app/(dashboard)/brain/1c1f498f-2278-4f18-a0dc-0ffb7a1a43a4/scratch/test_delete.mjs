import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'http://hrm-supabase-e8b016-187-127-24-58.traefik.me';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzYxMjE0MDMsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.jqUPui-C58gACQVYTrZSr_30Rt2_7X79TJXfh_BJJT0';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testDelete() {
  // Find a request for 2026-05-14
  const { data, error: findErr } = await supabase.from('transport_requests').select('id').eq('date', '2026-05-14').limit(1);
  if (findErr) {
    console.error("Error finding:", findErr);
    return;
  }
  if (!data || data.length === 0) {
    console.log("No requests found for 2026-05-14");
    return;
  }

  const id = data[0].id;
  console.log("Attempting to delete request:", id);
  const { error: delErr } = await supabase.from('transport_requests').delete().eq('id', id);
  if (delErr) {
    console.error("DELETE ERROR:", delErr);
  } else {
    console.log("Delete successful!");
  }
}

testDelete();
