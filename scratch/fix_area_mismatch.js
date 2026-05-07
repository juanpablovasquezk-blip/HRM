const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function repair() {
  console.log('--- REPARACIÓN DE DATOS: ÁREA/CARGO MISMATCH (ABRIL 2026) ---');
  
  // 1. Obtener todos los requerimientos que tienen un área distinta a la de su cargo
  const { data: reqs, error: fetchErr } = await supabase
    .from('shift_requirements')
    .select('id, area_id, position_id, positions(area_id)')
    .gte('date', '2026-04-01')
    .lte('date', '2026-04-30');

  if (fetchErr) {
    console.error('Error al cargar datos:', fetchErr);
    return;
  }

  const toUpdate = reqs.filter(r => r.area_id !== r.positions?.area_id);
  console.log(`Encontrados ${toUpdate.length} requerimientos con el área incorrecta.`);

  if (toUpdate.length === 0) {
    console.log('No hay nada que reparar.');
    return;
  }

  // 2. Ejecutar actualizaciones en bloques
  let successCount = 0;
  for (const r of toUpdate) {
    const { error: updErr } = await supabase
      .from('shift_requirements')
      .update({ area_id: r.positions.area_id })
      .eq('id', r.id);

    if (updErr) {
      console.error(`Error al actualizar req ${r.id}:`, updErr);
    } else {
      successCount++;
    }
  }

  console.log(`Reparación terminada: ${successCount} filas actualizadas.`);
}

repair();
