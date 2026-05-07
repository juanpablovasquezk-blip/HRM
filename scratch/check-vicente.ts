import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkPerson() {
  const { data, error } = await supabase
    .from('personnel')
    .select('*')
    .ilike('first_name', '%Vicente%')
    .ilike('last_name_father', '%Nuñez%');

  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('Personnel data:', data);
  }
}

checkPerson();
