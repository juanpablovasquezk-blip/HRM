require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { parseISO, format, addDays } = require('date-fns');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnostic() {
  console.log("--- INICIANDO DIAGNÓSTICO DE ESPEJO 4x4 ---");
  
  // 1. Buscamos los turnos de Marcelo entre el 1 y el 10 de Mayo
  const { data: assignments } = await supabase
    .from('shift_assignments')
    .select('date, personnel:personnel_id(first_name)')
    .gte('date', '2026-05-01')
    .lte('date', '2026-05-15');

  const marceloShifts = assignments
    .filter(a => a.personnel.first_name.includes('MARCELO'))
    .map(a => a.date.split('T')[0]);

  console.log("Turnos encontrados para Marcelo en Mayo:", marceloShifts);

  const dia11 = '2026-05-11';
  const diaEspejo = format(addDays(parseISO(dia11), -4), 'yyyy-MM-dd');
  
  console.log(`\nSimulando lógica para el día ${dia11}:`);
  console.log(`Fecha Espejo (Día - 4): ${diaEspejo}`);
  
  const tieneTurnoEnEspejo = marceloShifts.includes(diaEspejo);
  console.log(`¿Marcelo trabajó el día ${diaEspejo}?: ${tieneTurnoEnEspejo ? 'SÍ' : 'NO'}`);
  
  if (tieneTurnoEnEspejo) {
    console.log(">>> RESULTADO: El día 11 DEBE SER DESCANSO.");
  } else {
    console.log(">>> RESULTADO: El día 11 DEBE TENER TURNO.");
  }
}

diagnostic();
