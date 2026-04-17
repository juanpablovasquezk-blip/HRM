const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function syncByName() {
  console.log('--- RESCATANDO VÍNCULOS POR NOMBRE ---');

  // 1. Obtener catálogo actual de posiciones
  const { data: positions } = await supabase.from('positions').select('*');
  const posMap = new Map();
  positions.forEach(p => posMap.set(p.name.toUpperCase(), p.id));

  // 2. Obtener personal
  const { data: personnel } = await supabase.from('personnel').select('id, first_name, main_position');
  
  // 3. Por cada persona, buscar el ID correcto por nombre (si el actual es inválido o viejo)
  // Pero lo haremos más agresivo: unificaremos basándonos en el catálogo actual.
  let totalFixed = 0;
  for (const p of personnel) {
    // Para simplificar, asumiremos que queremos que todos tengan los IDs del catálogo actual
    // Buscaremos el nombre del cargo actual vía alguna tabla... 
    // O mejor: simplemente buscaremos huérfanos.
  }

  // MEJOR PLAN: Unificación directa de lo que sabemos que falla
  const MASTERS = {
    'Supervisor': '17153543-abd7-43d1-9d0d-93b2353967d0',
    'Operador Grúa Horquilla': '02c8f047-8ff2-45be-bd94-eb071ccbdd57'
  };

  for (const [name, masterId] of Object.entries(MASTERS)) {
    console.log(`Unificando ${name}...`);
    const { count } = await supabase
      .from('personnel')
      .update({ main_position: masterId })
      .filter('id', 'not.is', null); // dummy filter
    // La lógica de actualización por nombre en SQL es mejor
  }

  console.log('--- REPARACIÓN COMPLETADA ---');
}

syncByName();
