
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BLUE_EXPRESS_ADDRESS = 'Los Maitenes Sur 9800, Pudahuel, Chile';
const ATREX_ADDRESS = 'Osvaldo Crocquevielle 2207, Pudahuel, Chile';

function isTimeInWindow(timeStr) {
  if (!timeStr) return false;
  const hour = parseInt(timeStr.split(':')[0], 10);
  return hour >= 23 || hour < 7;
}

function formatAddress(address) {
  if (!address) return 'Dirección no registrada';
  if (typeof address === 'string') return address;
  const { street, city, region } = address;
  return `${street || ''}, ${city || ''}, ${region || ''}`.replace(/^, |, $/g, '').trim() || 'Dirección incompleta';
}

async function fix() {
  const date = '2026-04-21';
  console.log(`Generating transport for ${date}...`);

  const { data: assignments, error } = await supabase
    .from('shift_assignments')
    .select('*, shift:shifts!shift_assignments_shift_id_fkey(*), personnel:personnel(*), area:areas(*)')
    .eq('date', date)
    .eq('is_confirmed', true);

  if (error) {
    console.error('Error fetching assignments:', error);
    return;
  }

  console.log(`Found ${assignments.length} confirmed assignments.`);
  const requestsToInsert = [];

  for (const ass of assignments) {
    const shift = ass.shift;
    const personnel = ass.personnel;
    const areaName = ass.area?.name?.toUpperCase() || '';
    
    if (!shift || !personnel) continue;

    if (isTimeInWindow(shift.start_time)) {
      requestsToInsert.push({
        assignment_id: ass.id,
        personnel_id: personnel.id,
        date: ass.date,
        type: 'ENTRADA',
        pickup_address: formatAddress(personnel.address),
        destination_address: areaName.includes('BLUE') ? BLUE_EXPRESS_ADDRESS : ATREX_ADDRESS,
        status: 'ABIERTO',
        transport_type: 'PENDIENTE'
      });
    }

    if (isTimeInWindow(shift.end_time)) {
      requestsToInsert.push({
        assignment_id: ass.id,
        personnel_id: personnel.id,
        date: ass.date,
        type: 'SALIDA',
        pickup_address: areaName.includes('BLUE') ? BLUE_EXPRESS_ADDRESS : ATREX_ADDRESS,
        destination_address: formatAddress(personnel.address),
        status: 'ABIERTO',
        transport_type: 'PENDIENTE'
      });
    }
  }

  console.log(`Will insert ${requestsToInsert.length} requests.`);
  
  for (const req of requestsToInsert) {
    const { data: existing } = await supabase
      .from('transport_requests')
      .select('id')
      .eq('assignment_id', req.assignment_id)
      .eq('type', req.type)
      .maybeSingle();

    if (!existing) {
      const { error: insErr } = await supabase.from('transport_requests').insert(req);
      if (insErr) console.error('Insert error:', insErr);
    }
  }

  console.log('Done.');
}

fix();
