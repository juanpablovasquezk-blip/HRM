const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateGroups() {
  const settings = [
    { key: 'ultramsg_group_blue', value: '120363040079533362@g.us' },
    { key: 'ultramsg_group_fedex', value: '120363230294334341@g.us' },
    { key: 'ultramsg_group_dhl', value: '120363409791287644@g.us' },
    { key: 'ultramsg_group_others', value: '56978543774-1535638424@g.us' }
  ];
  
  for (const s of settings) {
    const { error } = await supabase
      .from('system_settings')
      .upsert({ ...s, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      
    if (error) {
      console.error(`Error updating ${s.key}:`, error);
    } else {
      console.log(`Successfully updated ${s.key}`);
    }
  }
}

updateGroups();
