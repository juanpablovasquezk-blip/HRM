const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function resetApril() {
  console.log('--- RESET TOTAL DE ABRIL 2026 ---');
  
  const { count, error } = await supabase
    .from('shift_assignments')
    .delete({ count: 'exact' })
    .gte('date', '2026-04-01')
    .lte('date', '2026-04-30');

  if (error) {
    console.error('Error al borrar:', error);
  } else {
    console.log(`Éxito: Se borraron ${count} asignaciones de abril.`);
  }
}

resetApril();
