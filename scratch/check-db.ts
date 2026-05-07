import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkColumn() {
  const { data, error } = await supabase
    .from('shift_assignments')
    .select('id, is_validated, is_published')
    .limit(1);

  if (error) {
    console.error('Error checking columns:', error.message);
  } else {
    console.log('Columns found:', Object.keys(data[0] || {}));
  }
}

checkColumn();
