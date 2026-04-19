const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const updates = [
    { name: 'PRICE', pattern: 'BLUE_NOCHE-1' },
    { name: 'BRANCO', pattern: 'BLUE_NOCHE-2' },
    { name: 'ESTEBAN TEJOS', pattern: 'BLUE_NOCHE-3' }
  ];

  for (const update of updates) {
    console.log(`Searching for: ${update.name}...`);
    const { data: people } = await supabase
      .from('personnel')
      .select('id, first_name, last_name_father')
      .or(`first_name.ilike.%${update.name}%,last_name_father.ilike.%${update.name}%`);

    if (people && people.length > 0) {
      const person = people[0];
      console.log(`Updating ${person.first_name} ${person.last_name_father} to ${update.pattern}...`);
      const { error } = await supabase
        .from('personnel')
        .update({ rotation_pattern: update.pattern })
        .eq('id', person.id);
      
      if (error) console.error('Error:', error);
      else console.log('Success.');
    } else {
      console.log('Not found.');
    }
  }
}

run();
