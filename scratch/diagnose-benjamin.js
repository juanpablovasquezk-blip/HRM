const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnoseBenjamin() {
  console.log('--- DIAGNOSING BENJAMIN LASTRA ---');
  
  // 1. Find Benjamin
  const { data: pData } = await supabase
    .from('personnel')
    .select('id, first_name, last_name_father')
    .ilike('first_name', '%BENJAMIN%')
    .ilike('last_name_father', '%LASTRA%')
    .single();

  if (!pData) {
    console.log('Benjamin not found');
    return;
  }

  console.log(`Worker Found: ${pData.first_name} ${pData.last_name_father} (${pData.id})`);

  // 2. Find Assignment
  const { data: asg } = await supabase
    .from('shift_assignments')
    .select('*, area:areas(name, whatsapp_group_id), position:positions(name, whatsapp_group_id)')
    .eq('personnel_id', pData.id)
    .order('date', { ascending: false })
    .limit(1)
    .single();

  if (!asg) {
    console.log('Assignment not found');
    return;
  }

  console.log('--- DATABASE DATA ---');
  console.log(`Assignment Date: ${asg.date}`);
  console.log(`Area: "${asg.area?.name}" | GroupID: "${asg.area?.whatsapp_group_id}"`);
  console.log(`Position: "${asg.position?.name}" | GroupID: "${asg.position?.whatsapp_group_id}"`);

  const positionGroupId = asg.position?.whatsapp_group_id || '';
  const areaGroupId = asg.area?.whatsapp_group_id || '';
  
  const finalGroupId = positionGroupId || areaGroupId || 'FALLBACK_TO_OTHERS';
  
  console.log('--- FINAL DECISION ---');
  console.log(`Target Group ID: ${finalGroupId}`);
  console.log('--- END ---');
}

diagnoseBenjamin();
