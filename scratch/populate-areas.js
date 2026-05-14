const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function populateAreaGroupIds() {
  console.log('--- POPULATING AREA GROUP IDS ---');
  
  const mappings = [
    { name: 'BlueExpress', id: '120363040079533362@g.us' },
    { name: 'DHL', id: '120363409791287644@g.us' },
    { name: 'Fedex', id: '120363230294334341@g.us' },
    { name: 'Bodegas', id: '56978543774-1535638424@g.us' },
    { name: 'Aeropuerto', id: '56978543774-1535638424@g.us' },
    { name: 'Atrex', id: '56978543774-1535638424@g.us' },
    { name: 'Base Minerquim', id: '56978543774-1535638424@g.us' }
  ];

  for (const mapping of mappings) {
    const { data, error } = await supabase
      .from('areas')
      .update({ whatsapp_group_id: mapping.id })
      .ilike('name', `%${mapping.name}%`);
      
    if (error) {
      console.error(`Error updating ${mapping.name}:`, error.message);
    } else {
      console.log(`Updated ${mapping.name} with group ID.`);
    }
  }
  
  console.log('--- DONE ---');
}

populateAreaGroupIds();
