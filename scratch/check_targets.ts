import { createClient } from '@supabase/supabase-js';
import { generateSchedule } from '../src/lib/scheduler/index';
import * as dotenv from 'dotenv';
import { parseISO } from 'date-fns';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const from = '2026-04-27T00:00:00Z';
  const to = '2026-05-03T23:59:59Z';

  console.log(`Running generateSchedule from ${from} to ${to}...`);
  const { assignments } = await generateSchedule(from, to);
  const { data: personnel } = await supabase.from('personnel').select('*');
  
  const targetNames = ['JUAN NATIVIDAD', 'BRANCO', 'CRISTOPHER ALEXIS', 'NICANOR', 'MARCO ANTONIO', 'PABLO ANDRES'];
  
  console.log('\n--- TARGET CHECK 27 APR - 03 MAY ---');
  targetNames.forEach(name => {
     const p = personnel?.find(per => per.first_name.includes(name));
     if (!p) {
       console.log(`\n Personnel with name ${name} NOT FOUND in DB`);
       return;
     }
     
     const pA = assignments.filter(a => a.personnel_id === p.id);
     console.log(`\n${p.first_name} (${p.rotation_pattern}): ${pA.length} assignments`);
     pA.sort((a,b) => a.date.localeCompare(b.date)).forEach(a => {
        console.log(`   ${a.date} | Area: ${a.area_id} | Pos: ${a.position_id}`);
     });
  });
}

check().catch(err => console.error(err));
