
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'http://hrm-supabase-e8b016-187-127-24-58.traefik.me';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzYxMjE0MDMsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.jqUPui-C58gACQVYTrZSr_30Rt2_7X79TJXfh_BJJT0';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const RENAMING_MAP = {
  'Blue 00': 'AM 00',
  'Bodegas 03': 'AM 03',
  'Bodegas 05': 'AM 05',
  'Aeropuerto 07': 'AM 07',
  'Canes - 7x7': 'AM 07 (7x7)',
  'Atrex 08:30': 'AM 08:30',
  'Blue 12': 'PM 12',
  'Aeropuerto 13:30': 'PM 13:30',
  'Aeropuerto 22': 'NS 22'
};

async function renameShifts() {
  console.log('Starting shift renaming...');

  for (const [oldName, newName] of Object.entries(RENAMING_MAP)) {
    console.log(`Renaming "${oldName}" to "${newName}"...`);
    
    const { data, error } = await supabase
      .from('shifts')
      .update({ name: newName })
      .eq('name', oldName);

    if (error) {
      console.error(`Error renaming ${oldName}:`, error);
    } else {
      console.log(`Successfully renamed ${oldName}.`);
    }
  }

  console.log('Renaming process completed.');
}

renameShifts().catch(console.error);
