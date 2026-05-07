import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const extendedStart = '2026-05-04';
  const extendedEnd = '2026-05-31';
  
  const { data, error } = await supabase
    .from('shift_assignments')
    .select('*, shift:shifts(name)')
    .gte('date', extendedStart)
    .lte('date', extendedEnd);
    
  if (error) {
    console.error(error);
    return;
  }
  
  const javierId = 'c0db3b97-1f48-4e1b-b2eb-ff3f2dc5a0aa'; // Check if I know the ID
  
  const dates = data.map(a => a.date);
  console.log("Total assignments in DB between", extendedStart, "and", extendedEnd, ":", data.length);
  console.log("Dates for someone (maybe Javier):", data.filter(d => d.date === '2026-05-10').length);
}

run();
