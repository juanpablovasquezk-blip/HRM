const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const { format, addDays } = require('date-fns');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
  const personnelId = '42bcbb5c-9e2a-49c4-8896-0b0d8680445d'; // Juan Colina
  
  const chileTime = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Santiago"}));
  const todayStr = format(chileTime, 'yyyy-MM-dd');
  const tomorrowStr = format(addDays(chileTime, 1), 'yyyy-MM-dd');
  
  console.log('Today:', todayStr);
  console.log('Tomorrow:', tomorrowStr);

  const { data: assignments } = await supabase
    .from('shift_assignments')
    .select('*, shift:shifts(*)')
    .eq('personnel_id', personnelId)
    .eq('date', tomorrowStr);
    
  console.log('Assignments for tomorrow:', assignments?.length);
  if (assignments?.length > 0) {
    const asgId = assignments[0].id;
    console.log('First Assignment ID:', asgId);
    
    const { data: transportByAsg } = await supabase
      .from('transport_requests')
      .select('*')
      .eq('assignment_id', asgId);
    console.log('Transport by Assignment ID:', transportByAsg);
  }

  const { data: transportByDate } = await supabase
    .from('transport_requests')
    .select('*')
    .eq('personnel_id', personnelId)
    .eq('date', tomorrowStr);
    
  console.log('Transport by Date:', transportByDate);
  
  // Search for ANY transport for this person in the last 7 days
  const { data: allRecent } = await supabase
    .from('transport_requests')
    .select('*')
    .eq('personnel_id', personnelId)
    .order('date', { ascending: false })
    .limit(5);
  console.log('All recent transport:', allRecent);
}

debug();
