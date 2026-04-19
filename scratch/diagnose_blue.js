const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const { parseISO, differenceInCalendarDays, format } = require('date-fns');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const dates = ['2026-04-25', '2026-05-01'];
  const anchorBlue = parseISO('2026-04-13T12:00:00Z');

  console.log('--- BLUE_DIA LOGIC TEST ---');
  for (const dateStr of dates) {
    const date = parseISO(dateStr + 'T12:00:00Z');
    const daysSince = differenceInCalendarDays(date, anchorBlue);
    const dayOfCycle = ((daysSince % 21) + 21) % 21;
    const weekIdx = Math.floor(dayOfCycle / 7);
    const dayOfWeek = dayOfCycle % 7;
    console.log(`${dateStr}: daysSince=${daysSince}, weekIdx=${weekIdx}, dayOfWeek=${dayOfWeek}`);
  }

  console.log('\n--- CHECKING DATABASE ASSIGNMENTS ---');
  const { data: assignments } = await supabase
    .from('shift_assignments')
    .select('*, personnel(*), shifts(*)')
    .in('date', dates);

  console.log(JSON.stringify(assignments.map(a => ({
    date: a.date,
    person: a.personnel.full_name || (a.personnel.first_name + ' ' + a.personnel.last_name_father),
    shift: a.shifts.name
  })), null, 2));
}

run();
