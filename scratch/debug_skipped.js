const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const { validateAllConstraints } = require('./src/lib/scheduler/constraints');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugSkipped() {
  console.log('--- DEBUG: POR QUÉ SE SALTAN TURNOS EL 21 DE ABRIL ---');

  // 1. Get a DHL Operator and a DHL requirement for April 21
  const { data: personnel } = await supabase.from('personnel').select('*').ilike('first_name', '%ESTEBAN%').single();
  const { data: req } = await supabase.from('shift_requirements').select('*, shift:shifts(*)').eq('date', '2026-04-21').limit(1).single();

  if (!personnel || !req) {
      console.log('No se encontró personal o requerimiento para el test.');
      return;
  }

  const pAvail = {
      ...personnel,
      personnel_id: personnel.id,
      assigned_dates: new Set(),
      leave_dates: new Set(),
      weekly_hours: 0,
      main_position_name: 'OPERADOR DHL'
  };

  const slot = {
      date: req.date,
      shift_id: req.shift_id,
      position_id: req.position_id,
      shift_name: req.shift.name,
      shift_start: req.shift.start_time,
      shift_end: req.shift.end_time,
      shift_duration_hours: req.shift.duration_hours || 8
  };

  const violations = validateAllConstraints(pAvail, slot, []);
  
  console.log(`Candidato: ${personnel.first_name} | Cargo: ${pAvail.main_position_name}`);
  console.log(`Slot: ${slot.date} ${slot.shift_name}`);
  
  if (violations.length === 0) {
      console.log('√ SIN VIOLACIONES. El error debe estar en el filtro de pases de greedy-assign.ts');
  } else {
      violations.forEach(v => {
          console.log(`× VIOLACIÓN: [${v.severity}] ${v.message}`);
      });
  }
}

debugSkipped();
