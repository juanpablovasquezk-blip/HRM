const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const { parseISO, differenceInCalendarDays } = require('date-fns');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const juanId = '42bcbb5c-9e2a-49c4-8896-0b0d8680445d';
  const nicaId = '320f459a-8634-40a8-87c3-bae2f4cdc56c';
  
  const dates = {
    juan: '2026-05-01', // Should be AM 00
    nica: '2026-04-25' // Should be AM 08
  };

  const { data: juan } = await supabase.from('personnel').select('*').eq('id', juanId).single();
  const { data: nica } = await supabase.from('personnel').select('*').eq('id', nicaId).single();

  const anchorBlue = parseISO('2026-04-13T12:00:00Z');

  function diagnose(person, dateStr) {
    if (!person) { console.log('Person not found'); return; }
    const date = parseISO(dateStr + 'T12:00:00Z');
    const daysSince = differenceInCalendarDays(date, anchorBlue);
    const dayOfCycle = ((daysSince % 21) + 21) % 21;
    const weekIdx = Math.floor(dayOfCycle / 7);
    const dayOfWeek = dayOfCycle % 7;
    const pattern = person.rotation_pattern;

    let activeBlock = '';
    if (pattern.includes('-1')) {
      if (weekIdx === 0) activeBlock = 'A';
      else if (weekIdx === 1) activeBlock = 'C';
      else activeBlock = 'B';
    } else if (pattern.includes('-2')) {
      if (weekIdx === 0) activeBlock = 'B';
      else if (weekIdx === 1) activeBlock = 'A';
      else activeBlock = 'C';
    } else if (pattern.includes('-3')) {
      if (weekIdx === 0) activeBlock = 'C';
      else if (weekIdx === 1) activeBlock = 'B';
      else activeBlock = 'A';
    }

    console.log(`--- ${person.first_name} ${person.last_name_father} ---`);
    console.log(`Date: ${dateStr}, Pattern: ${pattern}`);
    console.log(`DaysSince: ${daysSince}, WeekIdx: ${weekIdx}, DayOfWeek: ${dayOfWeek}`);
    console.log(`Active Block: ${activeBlock}`);
  }

  diagnose(juan, dates.juan);
  diagnose(nica, dates.nica);
}

run();
