const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'http://hrm-supabase-e8b016-187-127-24-58.traefik.me';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzYxMjE0MDMsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.jqUPui-C58gACQVYTrZSr_30Rt2_7X79TJXfh_BJJT0';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const date = '2026-05-15';
  console.log('Generating for:', date);

  // 1. Get assignments
  const { data: assignments, error: assErr } = await supabase
    .from('shift_assignments')
    .select(`
      *,
      personnel:personnel(*),
      area:areas(*),
      shift:shifts!shift_assignments_shift_id_fkey(*)
    `)
    .eq('date', date)
    .eq('is_confirmed', true)
    .neq('status', 'cancelled');

  if (assErr) {
    console.error('AssErr:', assErr);
    return;
  }

  console.log('Assignments found:', assignments.length);

  const isWithinWindow = (timeStr) => {
    if (!timeStr) return false;
    const [h, m] = timeStr.split(':').map(Number);
    const val = h * 100 + m;
    return (val >= 2300 || val <= 630);
  };

  const newRequests = [];
  for (const ass of assignments) {
    if (!ass.personnel || !ass.shift) continue;
    if (ass.shift.requires_transport === false) continue;

    const shift = ass.shift;
    const areaName = (ass.area?.name || '').toUpperCase();

    let homeAddress = "DIRECCIÓN NO INFORMADA";
    if (ass.personnel.address) {
        const a = ass.personnel.address;
        if (typeof a === 'string') homeAddress = a;
        else if (typeof a === 'object') {
            homeAddress = [a.street, a.city, a.region].filter(Boolean).join(', ');
        }
    }

    let plantAddress = "MINERQUIM PLANTA"; 
    if (areaName.includes('BLUE')) plantAddress = "Los Maitenes Sur 9800, Pudahuel";
    else if (areaName.includes('BODEGA') || areaName.includes('DHL') || areaName.includes('FEDEX')) plantAddress = "Osvaldo Croquevielle 2207, Pudahuel";
    else if (areaName.includes('AEROPUERTO')) plantAddress = "Armando Cortinez Oriente 1704";

    if (isWithinWindow(shift.start_time)) {
      newRequests.push({
        personnel_id: ass.personnel_id,
        assignment_id: ass.id,
        date: ass.date,
        type: 'ENTRADA',
        status: 'ABIERTO',
        transport_type: 'PENDIENTE',
        pickup_address: homeAddress,
        destination_address: plantAddress
      });
    }

    if (isWithinWindow(shift.end_time)) {
      newRequests.push({
        personnel_id: ass.personnel_id,
        assignment_id: ass.id,
        date: ass.date,
        type: 'SALIDA',
        status: 'ABIERTO',
        transport_type: 'PENDIENTE',
        pickup_address: plantAddress,
        destination_address: homeAddress
      });
    }
  }

  console.log('Requests to insert:', newRequests.length);
  if (newRequests.length > 0) {
      const { data, error } = await supabase.from('transport_requests').insert(newRequests).select();
      if (error) console.error('Insert Error:', error);
      else console.log('Successfully inserted:', data.length);
  }
}

run();
