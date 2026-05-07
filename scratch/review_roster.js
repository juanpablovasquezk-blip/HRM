const { createClient } = require('@supabase/supabase-js');
const { parseISO, format, startOfWeek, endOfWeek } = require('date-fns');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function reviewRoster() {
  console.log('--- REVISIÓN DE GENERO: ABRIL 2026 ---');

  // 1. Get all assignments for April
  const { data: assignments, error } = await supabase
    .from('shift_assignments')
    .select(`
      *,
      personnel:personnel(first_name, last_name_father, main_position:positions(name)),
      shifts:shift_id (name, start_time, end_time, duration_hours)
    `)
    .gte('date', '2026-04-01')
    .lte('date', '2026-04-30');

  if (error) {
    console.error('Error fetching assignments:', error);
    return;
  }

  console.log(`Total asignaciones: ${assignments.length}`);

  // 2. Coverage Summary by Cargo
  const cargoCoverage = {};
  const coverageByDate = {};

  assignments.forEach(a => {
    const cargo = (a.personnel?.main_position?.name || 'Desconocido').toUpperCase();
    if (!cargoCoverage[cargo]) cargoCoverage[cargo] = 0;
    cargoCoverage[cargo]++;

    if (!coverageByDate[a.date]) coverageByDate[a.date] = 0;
    coverageByDate[a.date]++;
  });

  console.log('\n--- COBERTURA POR CARGO ---');
  Object.entries(cargoCoverage).sort().forEach(([cargo, count]) => {
    console.log(`${cargo.padEnd(25)}: ${count} turnos`);
  });

  // 3. Airport Operator Analysis (Detailed)
  const aeroOperators = assignments.filter(a => 
    (a.personnel?.main_position?.name || '').toUpperCase().includes('AEROPUERTO')
  );

  console.log(`\n--- OPERADORES AEROPUERTO (Continuidad y Horas) ---`);
  
  const personStats = {};
  aeroOperators.forEach(a => {
    const id = a.personnel_id;
    if (!personStats[id]) {
      personStats[id] = { 
        name: `${a.personnel.first_name} ${a.personnel.last_name_father || ''}`,
        totalHours: 0,
        days: []
      };
    }
    personStats[id].totalHours += a.shifts?.duration_hours || 8;
    personStats[id].days.push({ 
        date: a.date, 
        start: a.shifts?.start_time,
        name: a.shifts?.name
    });
  });

  for (const id in personStats) {
    const p = personStats[id];
    p.days.sort((a, b) => a.date.localeCompare(b.date));
    
    let quiebres = 0;
    for (let i = 1; i < p.days.length; i++) {
        const prev = p.days[i-1];
        const curr = p.days[i];
        
        // Quiebre PM -> AM
        const wasPM = prev.start && (prev.start.includes('12:') || prev.start.includes('13:'));
        const isAM = curr.start && (curr.start.includes('04:') || curr.start.includes('07:'));
        
        if (wasPM && isAM) quiebres++;
    }

    console.log(`${p.name.padEnd(25)} | Sem: ${Math.round(p.totalHours/4)} sem (aprox) | Total Horas: ${p.totalHours} | Quiebres: ${quiebres}`);
  }

  // 4. Check for massive gaps in 20-26 range (DHL/Fedex Example)
  const filteredCargos = ['OPERADOR DHL', 'OPERADOR FEDEX', 'SUPERVISOR'];
  console.log('\n--- CHEQUEO DE COBERTURA (20-26 ABRIL) ---');
  
  for (const cargoName of filteredCargos) {
      const cargoAsgn = assignments.filter(a => (a.personnel?.main_position?.name || '').toUpperCase() === cargoName);
      const daysFound = new Set(cargoAsgn.filter(a => a.date >= '2026-04-20' && a.date <= '2026-04-26').map(a => a.date));
      console.log(`${cargoName.padEnd(20)}: ${daysFound.size}/7 días con asignaciones`);
  }
}

reviewRoster();
