const { parseISO, differenceInCalendarDays } = require('date-fns');

function checkRotation(pattern, dateStr) {
    const anchorBlue = parseISO('2026-04-13T12:00:00Z');
    const date = parseISO(dateStr + 'T12:00:00Z');
    const daysSince = differenceInCalendarDays(date, anchorBlue);
    const dayOfCycle = ((daysSince % 21) + 21) % 21;
    const weekIdx = Math.floor(dayOfCycle / 7);
    const dayOfWeek = dayOfCycle % 7;

    let activeBlock = '';
    if (pattern === 'BLUE_DIA-1') {
      if (weekIdx === 0) activeBlock = 'A';
      else if (weekIdx === 1) activeBlock = 'C';
      else activeBlock = 'B';
    } else if (pattern === 'BLUE_DIA-2') {
      if (weekIdx === 0) activeBlock = 'B';
      else if (weekIdx === 1) activeBlock = 'A';
      else activeBlock = 'C';
    } else if (pattern === 'BLUE_DIA-3') {
      if (weekIdx === 0) activeBlock = 'C';
      else if (weekIdx === 1) activeBlock = 'B';
      else activeBlock = 'A';
    }

    console.log(`${dateStr} | ${pattern} | WeekIdx: ${weekIdx} | DayOfWeek: ${dayOfWeek} | Block: ${activeBlock}`);
}

console.log('--- TEST ---');
checkRotation('BLUE_DIA-3', '2026-04-25'); // Nicanor Sat 25
checkRotation('BLUE_DIA-1', '2026-05-01'); // Juan Fri 01
