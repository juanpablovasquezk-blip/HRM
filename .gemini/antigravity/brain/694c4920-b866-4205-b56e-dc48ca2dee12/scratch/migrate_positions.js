const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MAPPING = {
  // Supervisor Duplicates -> Master
  '9fffe0c7-e219-48ce-85fa-955ac23019e7': '17153543-abd7-43d1-9d0d-93b2353967d0',
  '62dd4d19-bbe6-4fe1-a233-7c2260de0797': '17153543-abd7-43d1-9d0d-93b2353967d0',
  
  // Grúa Duplicates -> Master
  '6e1d9671-ac2f-413c-acfd-95bdfffe6a21': '02c8f047-8ff2-45be-bd94-eb071ccbdd57'
};

async function migrate() {
  console.log('--- INICIANDO MIGRACIÓN DE UNIFICACIÓN ---');

  for (const [oldId, newId] of Object.entries(MAPPING)) {
    console.log(`Migrando ${oldId.substring(0,8)} -> ${newId.substring(0,8)}...`);

    // 1. Requerimientos
    const { count: reqCount, error: err1 } = await supabase
      .from('shift_requirements')
      .update({ position_id: newId })
      .eq('position_id', oldId);
    if (err1) console.error('Error reqs:', err1);
    else console.log(`  - Requerimientos actualizados: ${reqCount || 0}`);

    // 2. Asignaciones
    const { count: assignCount, error: err2 } = await supabase
      .from('shift_assignments')
      .update({ position_id: newId })
      .eq('position_id', oldId);
    if (err2) console.error('Error assignments:', err2);
    else console.log(`  - Asignaciones actualizadas: ${assignCount || 0}`);

    // 3. Personal (Main)
    const { count: pMain, error: err3 } = await supabase
      .from('personnel')
      .update({ main_position: newId })
      .eq('main_position', oldId);
    if (err3) console.error('Error pMain:', err3);
    else console.log(`  - Personal (Main) actualizado: ${pMain || 0}`);

    // 4. Eliminar el cargo duplicado
    const { error: errDel } = await supabase
      .from('positions')
      .delete()
      .eq('id', oldId);
    if (errDel) console.error('Error delete pos:', errDel);
    else console.log(`  - Registro duplicado eliminado de 'positions'.`);
  }

  console.log('--- MIGRACIÓN COMPLETADA CON ÉXITO ---');
}

migrate();
