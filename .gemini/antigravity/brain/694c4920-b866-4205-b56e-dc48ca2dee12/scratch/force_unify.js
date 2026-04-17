const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUPERVISOR_MASTER = '17153543-abd7-43d1-9d0d-93b2353967d0';
const CRANE_MASTER = '02c8f047-8ff2-45be-bd94-eb071ccbdd57';

async function forceUnify() {
  console.log('--- REPARANDO CÓDIGOS DE LA BD ---');

  // Lizardo -> Grúa
  const { count: c1 } = await supabase.from('personnel').update({ main_position: CRANE_MASTER }).ilike('first_name', '%LIZARDO%');
  console.log(`Lizardo actualizado.`);

  // Jaime -> Grúa
  await supabase.from('personnel').update({ main_position: CRANE_MASTER }).ilike('first_name', '%JAIME%');
  console.log(`Jaime actualizado.`);

  // Pablo, Carlos, Emilio -> Supervisor
  await supabase.from('personnel').update({ main_position: SUPERVISOR_MASTER }).ilike('first_name', '%PABLO%');
  await supabase.from('personnel').update({ main_position: SUPERVISOR_MASTER }).ilike('first_name', '%CARLOS%');
  await supabase.from('personnel').update({ main_position: SUPERVISOR_MASTER }).ilike('first_name', '%EMILIO%');
  console.log(`Supervisores actualizados.`);

  console.log('--- REPARACIÓN DE BD COMPLETADA ---');
}

forceUnify();
