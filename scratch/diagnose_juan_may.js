const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const { parseISO, differenceInCalendarDays, format } = require('date-fns');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const juanId = '42bcbb5c-9e2a-49c4-8896-0b0d8680445d';
  const dateStr = '2026-05-01';

  const { data: requirements } = await supabase
    .from('shift_requirements')
    .select('*, shifts(*), positions(*)')
    .eq('date', dateStr);

  const am00Slot = requirements.find(r => r.shifts.name === 'AM 00' && r.positions.name.toUpperCase().includes('CONDUCTOR'));

  if (!am00Slot) {
    console.log('ERROR: No AM 00 requirement found for CONDUCTOR on May 01');
    return;
  }

  const { data: juan } = await supabase
    .from('personnel')
    .select('*, main_position_ref:positions!personnel_main_position_fkey(name)')
    .eq('id', juanId)
    .single();

  console.log('--- DIAGNOSING JUAN ON MAY 01 (AM 00) ---');
  console.log('Requirement:', am00Slot.positions.name, am00Slot.shifts.name);
  console.log('Juan:', juan.first_name, juan.last_name_father, 'Pattern:', juan.rotation_pattern);

  // Simulate rotation logic
  const date = parseISO(dateStr + 'T12:00:00Z');
  const anchorBlue = parseISO('2026-04-13T12:00:00Z');
  const daysSince = differenceInCalendarDays(date, anchorBlue);
  const dayOfCycle = ((daysSince % 21) + 21) % 21;
  const weekIdx = Math.floor(dayOfCycle / 7);
  const dayOfWeek = dayOfCycle % 7;

  console.log('DaysSince:', daysSince, 'WeekIdx:', weekIdx, 'DayOfWeek:', dayOfWeek);
  
  // Logic check
  let activeBlock = '';
  if (juan.rotation_pattern.includes('-1')) {
    if (weekIdx === 0) activeBlock = 'A';
    else if (weekIdx === 1) activeBlock = 'C';
    else activeBlock = 'B';
  }
  console.log('Active Block:', activeBlock);

  if (activeBlock === 'B') {
      const expectedShift = dayOfWeek === 4 ? 'AM 00' : 'AM 08';
      console.log('Expected Shift:', expectedShift);
      console.log('Slot Shift:', am00Slot.shifts.name);
      const match = am00Slot.shifts.name.includes(expectedShift);
      console.log('Constraint Match:', match);
  }
}

run();
