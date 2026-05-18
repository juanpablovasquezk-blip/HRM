import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const personnelId = 'c24f1a21-2ae7-4b64-9df0-e9a0814f2056'; // Esteban Jacob Berrios
  const date = '2026-05-19';

  console.log('Testing delete on transport_requests for Esteban:');
  const { data, error } = await supabase
    .from('transport_requests')
    .delete()
    .eq('personnel_id', personnelId)
    .eq('date', date)
    .eq('transport_type', 'PROPIO')
    .select();

  if (error) {
    console.error('Error during delete:', error);
  } else {
    console.log('Delete succeeded:', data);
  }
}
run();
