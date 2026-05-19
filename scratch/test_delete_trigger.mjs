import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const personnelId = 'c24f1a21-2ae7-4b64-9df0-e9a0814f2056'; // Esteban
  const date = '2026-05-18';
  const assignmentId = '546f79e9-55b4-4374-a183-f836a5d6fae4';
  
  console.log('1. Inserting a dummy transport request...');
  const { data: insertData, error: insErr } = await supabase
    .from('transport_requests')
    .insert({
      personnel_id: personnelId,
      date: date,
      assignment_id: assignmentId,
      type: 'ENTRADA',
      transport_type: 'PROPIO',
      status: 'ABIERTO',
      pickup_address: 'TEST PICKUP ADDRESS',
      destination_address: 'TEST DESTINATION ADDRESS',
      updated_by_name: 'EMILIO ALBERTO BARROS'
    })
    .select();
    
  if (insErr) {
    console.error('Insert failed:', insErr);
    return;
  }
  
  console.log('Inserted dummy transport request:', insertData);
  
  console.log('2. Deleting the dummy transport request...');
  const { data: delData, error: delErr } = await supabase
    .from('transport_requests')
    .delete()
    .eq('personnel_id', personnelId)
    .eq('date', date)
    .eq('transport_type', 'PROPIO')
    .select();
    
  if (delErr) {
    console.error('Delete failed!');
    console.error('Error Code:', delErr.code);
    console.error('Error Message:', delErr.message);
    console.error('Error Details:', delErr.details);
    console.error('Error Hint:', delErr.hint);
  } else {
    console.log('Delete succeeded! Returned data:', delData);
  }
}
run();
