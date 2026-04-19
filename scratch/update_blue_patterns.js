const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const people = [
    { first: 'Juan', last: 'Colina', pattern: 'BLUE_DIA-1' },
    { first: 'Cristopher', last: 'Gutierrez', pattern: 'BLUE_DIA-2' },
    { first: 'Nicanor', last: 'Perez', pattern: 'BLUE_DIA-3' }
  ];

  for (const person of people) {
    console.log(`Updating ${person.first} ${person.last} to ${person.pattern}...`);
    const { error } = await supabase
      .from('personnel')
      .update({ rotation_pattern: person.pattern })
      .ilike('first_name', `%${person.first}%`)
      .ilike('last_name_father', `%${person.last}%`);

    if (error) console.error(`Error updating ${person.first}:`, error.message);
    else console.log(`Success.`);
  }
}

run();
