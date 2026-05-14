const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
  const { data: pData } = await supabase.from('personnel').select('*').ilike('first_name', 'RODRIGO MARCEL').ilike('last_name_father', 'LOBOS').single();
  
  const { data: asg } = await supabase
    .from('shift_assignments')
    .select('*, area:areas(name, whatsapp_group_id), position:positions(name, whatsapp_group_id)')
    .eq('personnel_id', pData.id)
    .order('date', { ascending: false })
    .limit(1)
    .single();

  console.log(`Worker: ${pData.first_name} ${pData.last_name_father}`);
  console.log(`Area: "${asg.area?.name}" | GroupID: "${asg.area?.whatsapp_group_id}"`);
  console.log(`Position: "${asg.position?.name}" | GroupID: "${asg.position?.whatsapp_group_id}"`);
}

diagnose();
