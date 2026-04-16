
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'http://hrm-supabase-e8b016-187-127-24-58.traefik.me';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzYxMjE0MDMsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.jqUPui-C58gACQVYTrZSr_30Rt2_7X79TJXfh_BJJT0';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkShifts() {
  const { data: shifts, error } = await supabase
    .from('shifts')
    .select('*')
    .order('start_time');

  if (error) {
    console.error('Error fetching shifts:', error);
    return;
  }

  console.log('--- Current Shifts Status ---');
  for (const s of shifts) {
    const { count: assCount } = await supabase
      .from('shift_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('shift_id', s.id);

    const { count: reqCount } = await supabase
      .from('shift_requirements')
      .select('*', { count: 'exact', head: true })
      .eq('shift_id', s.id);

    console.log(`ID: ${s.id.slice(0,8)} | Name: ${s.name.padEnd(20)} | Assignments: ${assCount || 0} | Requirements: ${reqCount || 0}`);
  }
  console.log('-----------------------------');
}

checkShifts();

