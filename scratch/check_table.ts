import { createClient } from '../src/lib/supabase/server';

async function checkTable() {
  const supabase = await createClient();
  const { error } = await supabase.from('transport_requests').select('id').limit(1);
  if (error) {
    console.error('Table does not exist or error:', error.message);
  } else {
    console.log('Table exists!');
  }
}

checkTable();
