import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// We simulate updateTransportMobilization logic
async function run() {
  const personnelId = 'c40fc257-c2a0-4477-be92-59adfdf82dd6';
  const assignmentId = '1d61bd90-8fdc-4ef9-98f4-c08ce0da4b07';
  const date = '2026-05-19';
  const mobilization = 'PROPIO';
  const sessionUser = 'SUPERVISOR PRUEBA';

  // 1. Fetch assignment and related
  const { data: asg } = await supabase.from('shift_assignments').select('*').eq('id', assignmentId).single();
  const { data: personnel } = await supabase.from('personnel').select('*').eq('id', personnelId).single();
  const { data: shiftData } = await supabase.from('shifts').select('*').eq('id', asg.shift_id).single();
  const { data: posData } = await supabase.from('positions').select('*').eq('id', asg.position_id).single();
  const { data: areaData } = await supabase.from('areas').select('*').eq('id', asg.area_id).single();

  let homeAddress = 'DIRECCIÓN NO INFORMADA EN FICHA';
  if (personnel?.address) {
    const addr = personnel.address;
    if (typeof addr === 'string') {
      homeAddress = addr;
    } else if (typeof addr === 'object') {
      const parts = [addr.street, addr.city, addr.commune, addr.region].filter(Boolean);
      homeAddress = parts.length > 0 ? parts.join(', ') : (addr.full_address || JSON.stringify(addr));
    }
  }

  let destinationAddress = 'PLANTA / BODEGA';
  const areaNameUpper = areaData?.name?.toUpperCase() || '';
  const positionNameUpper = posData?.name?.toUpperCase() || '';

  if (areaNameUpper.includes('BLUE') || positionNameUpper.includes('BLUE')) {
    destinationAddress = 'Los Maitenes Sur 9800, Pudahuel';
  } else if (areaNameUpper.includes('BODEGA') || positionNameUpper.includes('BODEGA') || positionNameUpper.includes('DHL') || positionNameUpper.includes('FEDEX')) {
    destinationAddress = 'Osvaldo Croquevielle 2207, Pudahuel';
  } else if (areaNameUpper.includes('AEROPUERTO') || positionNameUpper.includes('AEROPUERTO')) {
    destinationAddress = 'Armando Cortinez Oriente 1704';
  }

  const { data: existing } = await supabase
    .from('transport_requests')
    .select('id')
    .eq('assignment_id', assignmentId)
    .eq('type', 'ENTRADA')
    .maybeSingle();

  const payload = {
    personnel_id: personnelId,
    date: date,
    assignment_id: assignmentId,
    type: 'ENTRADA',
    transport_type: mobilization,
    status: 'ABIERTO',
    pickup_address: homeAddress,
    destination_address: destinationAddress,
    updated_by_name: sessionUser
  };

  console.log('Existing:', existing);
  console.log('Payload to insert/update:', payload);

  let res;
  if (existing) {
    res = await supabase
      .from('transport_requests')
      .update(payload)
      .eq('id', existing.id)
      .select();
  } else {
    res = await supabase
      .from('transport_requests')
      .insert(payload)
      .select();
  }

  console.log('Insert/Update result:', res);
}
run();
