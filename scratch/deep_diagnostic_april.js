const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const { parseISO, startOfWeek, endOfWeek, differenceInHours, differenceInCalendarDays, format, eachDayOfInterval, startOfMonth, endOfMonth } = require('date-fns');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// REPLICATED LOGIC FROM constraints.ts (Simplified for debugging)
function checkMaxHours(p, slot, current) {
    if (p.rotation_pattern?.includes('7X7') || p.rotation_pattern?.includes('BLUE_')) return null;
    const slotD = parseISO(slot.date);
    const start = startOfWeek(slotD, { weekStartsOn: 1 });
    const end = endOfWeek(slotD, { weekStartsOn: 1 });
    const hrs = current.filter(a => {
        const d = parseISO(a.date);
        return d >= start && d <= end;
    }).reduce((s, a) => s + (a.duration || 8), 0);
    if (hrs + 8 > 40) return `Hours: ${hrs + 8} > 40`;
    return null;
}

function checkDaysOff(p, slot, current) {
    if (p.rotation_pattern?.includes('7X7')) return null;
    const slotD = parseISO(slot.date);
    const start = startOfWeek(slotD, { weekStartsOn: 1 });
    const end = endOfWeek(slotD, { weekStartsOn: 1 });
    const assigned = new Set(current.filter(a => {
        const d = parseISO(a.date);
        return d >= start && d <= end;
    }).map(a => a.date));
    assigned.add(slot.date);
    const daysOff = 7 - assigned.size;
    if (daysOff < 2) return `Days Off: ${daysOff} < 2`;
    return null;
}

function checkSundays(p, slot, current) {
    if (p.rotation_pattern?.includes('7X7') || p.rotation_pattern?.includes('BLUE_')) return null;
    const slotD = parseISO(slot.date);
    if (slotD.getDay() !== 0) return null;
    const mStart = startOfMonth(slotD);
    const mEnd = endOfMonth(slotD);
    const suns = [];
    let cur = new Date(mStart);
    while(cur <= mEnd) { if(cur.getDay() === 0) suns.push(format(cur, 'yyyy-MM-dd')); cur.setDate(cur.getDate()+1); }
    const assignedSuns = suns.filter(s => current.some(a => a.date === s) || s === slot.date).length;
    const off = suns.length - assignedSuns;
    if (off < 2) return `Sundays Off: ${off} < 2`;
    return null;
}

async function debug() {
  const targetDate = '2026-04-21';
  console.log(`--- DIAGNÓSTICO PROFUNDO: ${targetDate} ---`);

  const { data: personnel } = await supabase.from('personnel').select('*');
  const { data: assignments } = await supabase.from('shift_assignments').select('*, shift:shifts(*)').gte('date', '2026-04-01').lte('date', '2026-04-30');
  
  // Find DHL/Fedex personnel
  const operators = personnel.filter(p => p.first_name.includes('ESTEBAN') || p.first_name.includes('WILSON'));

  for (const p of operators) {
      console.log(`\nCandidato: ${p.first_name} ${p.last_name_father}`);
      const pAsgn = assignments.filter(a => a.personnel_id === p.id).map(a => ({ date: a.date, duration: a.shift?.duration_hours || 8 }));
      
      const resHours = checkMaxHours(p, { date: targetDate }, pAsgn);
      const resDays = checkDaysOff(p, { date: targetDate }, pAsgn);
      const resSuns = checkSundays(p, { date: targetDate }, pAsgn);
      
      if (resHours) console.log(`  [X] ${resHours}`);
      if (resDays) console.log(`  [X] ${resDays}`);
      if (resSuns) console.log(`  [X] ${resSuns}`);
      
      if (!resHours && !resDays && !resSuns) console.log(`  [OK] Debería ser asignable.`);

      // Check current week (20-26)
      const weekAsgn = pAsgn.filter(a => a.date >= '2026-04-20' && a.date <= '2026-04-26');
      console.log(`  Asignaciones esta semana: ${weekAsgn.length}`);
      weekAsgn.forEach(a => console.log(`    - ${a.date}`));
  }

  // Check Juan Natividad (Blue Conductor) for 25-26
  const juan = personnel.find(p => p.first_name.includes('JUAN NATIVIDAD'));
  if (juan) {
      console.log(`\n--- CHEQUEO JUAN NATIVIDAD (25-26 ABRIL) ---`);
      const juanAsgn = assignments.filter(a => a.personnel_id === juan.id).map(a => ({ date: a.date, duration: 8 }));
      ['2026-04-25', '2026-04-26'].forEach(d => {
          const res = checkDaysOff(juan, { date: d }, juanAsgn);
          if (res) console.log(`  ${d}: [X] ${res}`);
          else console.log(`  ${d}: [OK]`);
      });
  }
}

debug();
