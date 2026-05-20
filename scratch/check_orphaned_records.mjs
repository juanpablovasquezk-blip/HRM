import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase
    .from('transport_requests')
    .select(`
      id,
      date,
      transport_type,
      personnel_id,
      assignment_id,
      personnel:personnel!transport_requests_personnel_id_fkey(id),
      assignment:shift_assignments!transport_requests_assignment_id_fkey(id)
    `)
    .gte('date', '2026-05-01')
    .lte('date', '2026-05-31');

  if (error) {
    console.error(error);
    return;
  }

  const orphanedPersonnel = data.filter(r => !r.personnel);
  const orphanedAssignment = data.filter(r => !r.assignment);

  console.log('May 2026 stats:');
  console.log(`Total transport requests: ${data.length}`);
  console.log(`Requests with missing personnel: ${orphanedPersonnel.length}`);
  console.log(`Requests with missing assignment: ${orphanedAssignment.length}`);

  if (orphanedPersonnel.length > 0) {
    console.log('Sample request with missing personnel:', orphanedPersonnel[0]);
  }
  if (orphanedAssignment.length > 0) {
    console.log('Sample request with missing assignment:', orphanedAssignment[0]);
  }
}
run();
