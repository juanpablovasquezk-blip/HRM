import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function find12Shifts() {
  const { data: shifts } = await supabase.from('shifts').select('*').ilike('name', '%12%');
  const ids = shifts?.map(s => s.id) || [];
  
  console.log('Shifts found:', JSON.stringify(shifts, null, 2));

  const { data: asg } = await supabase
    .from('shift_assignments')
    .select('*, area:areas(name), shift:shifts(name)')
    .in('shift_id', ids)
    .gte('date', '2026-05-07');
    
  console.log('Assignments with 12:00 shifts:', JSON.stringify(asg, null, 2));
}

find12Shifts();
