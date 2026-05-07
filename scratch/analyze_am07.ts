import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { generateSchedule } from '../src/lib/scheduler/index';
import { parseISO, format, startOfWeek, endOfWeek } from 'date-fns';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const from = '2026-04-27T00:00:00Z';
  const to = '2026-05-03T23:59:59Z';

  const { assignments } = await generateSchedule(from, to);
  
  // Get all people
  const { data } = await supabase.from('personnel').select('*').eq('status', 'ACTIVO');
  const personnel = data || [];
  
  const peopleWithLess = [];
  
  for (const p of personnel) {
     const pAssignments = assignments.filter(a => a.personnel_id === p.personnel_id);
     const count = pAssignments.length;
     if (count < 5 && !p.rotation_pattern?.includes('BLUE') && !p.rotation_pattern?.includes('7X7') && !p.rotation_pattern?.includes('4X4')) {
        peopleWithLess.push({ name: p.first_name, count });
     }
  }
  
  console.log('\nPeople with < 5 assignments:');
  console.log(peopleWithLess);
  
  // Check Blue sequences
  console.log('\nBlue Express Assignments:');
  const blueA = assignments.filter(a => a.position_id === 18); // Check ID for Conductor?
  for (const p of personnel.filter(x => x.main_position_id === 18)) {
     const assigned = assignments.filter(a => a.personnel_id === p.personnel_id).map(a => a.date + ' ' + (a.shift_name||''));
     console.log(`${p.first_name}: ${assigned.length} asig => ${assigned.join(', ')}`);
  }
  
}

check().catch(console.error);
