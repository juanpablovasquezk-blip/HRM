const { createClient } = require('@supabase/supabase-js');
const { parseISO, format, startOfWeek, endOfWeek } = require('date-fns');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function reviewRoster() {
  console.log('--- REVISIÓN DE GENERO: ABRIL 2026 ---');

  // 1. Get raw assignments
  const { data: assignments, error: asgnErr } = await supabase
    .from('shift_assignments')
    .select('*')
    .gte('date', '2026-04-01')
    .lte('date', '2026-04-30');

  if (asgnErr) {
    console.error('Error fetching assignments:', asgnErr);
    return;
  }

  // 2. Get personnel
  const { data: personnel, error: persErr } = await supabase
    .from('personnel')
    .select('id, first_name, last_name_father, main_position');
  
  if (persErr) {
    console.error('Error fetching personnel:', persErr);
    return;
  }

  // 3. Get positions
  const { data: positions, error: posErr } = await supabase
    .from('positions')
    .select('id, name');

  if (posErr) {
    console.error('Error fetching positions:', posErr);
    return;
  }

  // 4. Get shifts
  const { data: shifts, error: shiftErr } = await supabase
    .from('shifts')
    .select('id, name, start_time, end_time, duration_hours');

  if (shiftErr) {
    console.error('Error fetching shifts:', shiftErr);
    return;
  }

  const persMap = new Map(personnel.map(p => [p.id, p]));
  const posMap = new Map(positions.map(p => [p.id, p]));
  const shiftMap = new Map(shifts.map(s => [s.id, s]));

  console.log(`Total asignaciones: ${assignments.length}`);

  // 5. Build enriched assignments
  const enriched = assignments.map(a => {
      const p = persMap.get(a.personnel_id);
      const s = shiftMap.get(a.shift_id);
      const pos = posMap.get(a.position_id);
      const mainPos = posMap.get(p?.main_position);
      return {
          ...a,
          personName: p ? `${p.first_name} ${p.last_name_father}` : '?',
          shiftName: s?.name || '?',
          startTime: s?.start_time,
          duration: s?.duration_hours || 8,
          cargo: mainPos?.name || '?'
      };
  });

  // 6. Coverage Analysis
  const coverageByDate = enriched.reduce((acc, a) => {
    acc[a.date] = (acc[a.date] || 0) + 1;
    return acc;
  }, {});

  console.log('\n--- RESUMEN DE COBERTURA DIARIA ---');
  Object.entries(coverageByDate).sort().slice(0, 10).forEach(([date, count]) => {
      console.log(`${date}: ${count} turnos`);
  });

  // 7. Airport Operator Check
  const aero = enriched.filter(a => a.cargo.toUpperCase().includes('AEROPUERTO'));
  console.log(`\n--- OPERADORES AEROPUERTO (${aero.length} turnos) ---`);
  
  const stats = {};
  aero.forEach(a => {
      if (!stats[a.personnel_id]) stats[a.personnel_id] = { name: a.personName, hours: 0, days: [] };
      stats[a.personnel_id].hours += a.duration;
      stats[a.personnel_id].days.push(a);
  });

  Object.values(stats).forEach(s => {
      s.days.sort((a,b) => a.date.localeCompare(b.date));
      let quiebres = 0;
      for (let i = 1; i < s.days.length; i++) {
          const prev = s.days[i-1];
          const curr = s.days[i];
          if (prev.startTime?.includes('12:') && curr.startTime?.includes('04:')) quiebres++;
          if (prev.startTime?.includes('12:') && curr.startTime?.includes('07:')) quiebres++;
          if (prev.startTime?.includes('13:') && curr.startTime?.includes('04:')) quiebres++;
          if (prev.startTime?.includes('13:') && curr.startTime?.includes('07:')) quiebres++;
      }
      console.log(`${s.name.padEnd(25)} | Horas: ${s.hours} | Quiebres: ${quiebres}`);
  });

  // 8. DHL/Fedex Gap Check
  console.log('\n--- HUECO 20-26 ABRIL (DHL/FEDEX) ---');
  ['OPERADOR DHL', 'OPERADOR FEDEX'].forEach(cargo => {
      const cAsgn = enriched.filter(a => a.cargo.toUpperCase() === cargo && a.date >= '2026-04-20' && a.date <= '2026-04-26');
      const uniqueDays = new Set(cAsgn.map(a => a.date)).size;
      console.log(`${cargo.padEnd(20)}: ${uniqueDays}/7 días cubiertos`);
  });

  // 9. Blue Express (Juan)
  console.log('\n--- BLUE EXPRESS (JUAN) ---');
  const juan = enriched.filter(a => a.personName.toUpperCase().includes('JUAN NATIVIDAD') && a.date >= '2026-04-24');
  juan.forEach(j => console.log(`${j.date}: ${j.shiftName}`));
}

reviewRoster();
