import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('Querying column types from information_schema:');
  const { data, error } = await supabase
    .from('_columns' /* Wait, there is no direct table for information_schema, but we can execute a SQL query via postgres or RPC. Let's see if we can do it via a quick RPC or pg_type if they have postgrest schema */)
    .select('*')
    .limit(1); // Usually direct table access to information_schema is not exposed in postgrest by default.
    
  // Instead of querying information_schema directly via postgrest, we can use a postgres function if it exists.
  // Or, since we have service_role, let's execute a quick SQL query using an anonymous postgres block or RPC, or we can check the error we get if we try to update `attendance_updated_by` to something that isn't a UUID or is a UUID.
  // Wait! Let's write a script that updates `attendance_updated_by` using a UUID vs a string to see which one fails/succeeds!
  
  const assignmentId = '546f79e9-55b4-4374-a183-f836a5d6fae4';
  
  console.log('1. Trying to update with a valid UUID:');
  const validUUID = 'e46359a1-2ebc-4448-9897-cfd0e42ce4fd'; // Emilio's personnel id
  const { data: res1, error: err1 } = await supabase
    .from('shift_assignments')
    .update({ attendance_updated_by: validUUID })
    .eq('id', assignmentId)
    .select();
    
  if (err1) {
    console.log('Failed with UUID:', err1.message);
  } else {
    console.log('Succeeded with UUID:', res1);
  }
  
  console.log('2. Trying to update with a string name:');
  const { data: res2, error: err2 } = await supabase
    .from('shift_assignments')
    .update({ attendance_updated_by: 'EMILIO ALBERTO BARROS' })
    .eq('id', assignmentId)
    .select();
    
  if (err2) {
    console.log('Failed with string name:', err2.message);
  } else {
    console.log('Succeeded with string name:', res2);
  }
}
run();
