
import { createClient } from './src/lib/supabase/server';

async function check() {
  const supabase = await createClient();
  const date = '2026-04-21';
  
  const { data: assignments, error } = await supabase
    .from('shift_assignments')
    .select('*, shift:shifts(*), personnel:personnel(*), area:areas(*)')
    .eq('date', date)
    .eq('is_confirmed', true);
    
  console.log(`Assignments for ${date}:`, assignments?.length);
  if (assignments) {
    assignments.forEach(a => {
      console.log(`- ${a.personnel?.first_name} ${a.personnel?.last_name_father}: ${a.shift?.start_time} - ${a.shift?.end_time} (${a.area?.name})`);
    });
  }
  
  const { data: requests } = await supabase
    .from('transport_requests')
    .select('*')
    .eq('date', date);
    
  console.log(`Transport requests for ${date}:`, requests?.length);
}

check();
