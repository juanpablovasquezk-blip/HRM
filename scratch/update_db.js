const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'http://hrm-supabase-e8b016-187-127-24-58.traefik.me';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzYxMjE0MDMsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.jqUPui-C58gACQVYTrZSr_30Rt2_7X79TJXfh_BJJT0';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Adding columns to shift_assignments...');
  const { error: err1 } = await supabase.rpc('exec_sql', {
    sql_query: `
      ALTER TABLE shift_assignments ADD COLUMN IF NOT EXISTS is_extra BOOLEAN DEFAULT false;
      ALTER TABLE shift_assignments ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN DEFAULT false;
      ALTER TABLE shift_requirements ADD COLUMN IF NOT EXISTS is_extra BOOLEAN DEFAULT false;
    `
  });

  if (err1) {
    console.error('Error adding columns. Checking if RPC exists...');
    // If RPC fails, maybe it doesn't exist. I'll try a different approach if needed.
    console.log('You might need to run this manually in Supabase SQL Editor:');
    console.log(`
      ALTER TABLE shift_assignments ADD COLUMN IF NOT EXISTS is_extra BOOLEAN DEFAULT false;
      ALTER TABLE shift_assignments ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN DEFAULT false;
      ALTER TABLE shift_requirements ADD COLUMN IF NOT EXISTS is_extra BOOLEAN DEFAULT false;
    `);
  } else {
    console.log('Columns added successfully!');
  }
}

run();
