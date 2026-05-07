const { differenceInCalendarDays, parseISO, addDays, format } = require('date-fns');

function getBlueBlock(pattern, dateStr) {
  const date = parseISO(dateStr);
  const anchorBlue = parseISO('2026-04-13T12:00:00Z');
  const daysSinceAnchorBlue = differenceInCalendarDays(date, anchorBlue);
  const dayOfCycle = ((daysSinceAnchorBlue % 21) + 21) % 21;
  const weekIdx = Math.floor(dayOfCycle / 7);
  const dayOfWeek = dayOfCycle % 7;

  let activeBlock = '';
  if (pattern.includes('-1')) {
    if (weekIdx === 0) activeBlock = 'A';
    else if (weekIdx === 1) activeBlock = 'C';
    else activeBlock = 'B';
  } else if (pattern.includes('-2')) {
    if (weekIdx === 0) activeBlock = 'C';
    else if (weekIdx === 1) activeBlock = 'B';
    else activeBlock = 'A';
  } else if (pattern.includes('-3')) {
    if (weekIdx === 0) activeBlock = 'B';
    else if (weekIdx === 1) activeBlock = 'A';
    else activeBlock = 'C';
  }

  const isNoche = pattern.includes('NOCHE');
  
  if (activeBlock === 'A') {
    if (dayOfWeek >= 5) return null; // Sat, Sun off
    return isNoche ? '00:00' : '12:00';
  } else if (activeBlock === 'B') {
    if (isNoche) {
        if (dayOfWeek >= 2 && dayOfWeek <= 4) return null; // Wed-Fri off
    } else {
        if (dayOfWeek === 2 || dayOfWeek === 3) return null; // Wed-Thu off
    }
    if (isNoche) return '00:00';
    return dayOfWeek === 4 ? '00:00' : '08:00';
  } else if (activeBlock === 'C') {
    if (dayOfWeek === 0 || dayOfWeek === 1) return null; // Mon, Tue off
    return isNoche ? '00:00' : '08:00';
  }
}

// Test Manuel (BLUE_DIA-3)
let d = parseISO('2026-04-13T12:00:00Z');
console.log('MANUEL (BLUE_DIA-3) Sequence Injection:');
for (let i=0; i<21; i++) {
   const dStr = format(d, 'yyyy-MM-dd');
   console.log(dStr, getBlueBlock('BLUE_DIA-3', dStr) || 'OFF');
   d = addDays(d, 1);
}
