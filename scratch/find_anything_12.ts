import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function findAnything12() {
  const { data: shifts } = await supabase.from('shifts').select('*');
  console.log('All shift names:', shifts?.map(s => s.name));

  const { data: reqs } = await supabase
    .from('shift_requirements')
    .select('*, area:areas(name), shift:shifts!shift_requirements_shift_id_fkey(name)')
    .gte('date', '2026-05-07');
    
  const matchedReqs = reqs?.filter(r => (r.shift as any)?.name?.includes('12'));
  console.log('Requirements with 12 in name:', JSON.stringify(matchedReqs, null, 2));

  const { data: asg } = await supabase
    .from('shift_assignments')
    .select('*, area:areas(name), shift:shifts!shift_assignments_shift_id_fkey(name)')
    .gte('date', '2026-05-07');
    
  const matchedAsg = asg?.filter(a => (a.shift as any)?.name?.includes('12'));
  console.log('Assignments with 12 in name:', JSON.stringify(matchedAsg, null, 2));
}

findAnything12();
