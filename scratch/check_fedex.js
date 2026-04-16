
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function checkFedex() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  
  // 1. Buscamos el ID de la posición "FEDEX"
  const { data: positions } = await supabase.from('positions').select('*').ilike('name', '%FEDEX%');
  console.log('Posiciones FEDEX encontradas:', JSON.stringify(positions, null, 2));
  
  if (positions.length > 0) {
    const posId = positions[0].id;
    // 2. Buscamos requerimientos para esa posición en Abril
    const { data: reqs } = await supabase.from('shift_requirements')
      .select('*, shift:shifts(name)')
      .eq('position_id', posId)
      .gte('date', '2026-04-01')
      .lte('date', '2026-04-30');
    
    console.log(`Requerimientos para ${positions[0].name}:`, reqs.length);
    if (reqs.length > 0) {
      console.log('Ejemplo de requerimiento:', JSON.stringify(reqs[0], null, 2));
    } else {
      console.log('¡ERROR! No hay requerimientos definidos en la tabla shift_requirements para FedEx en estas fechas.');
    }
  }
}

checkFedex();
