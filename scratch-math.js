const { parseISO, differenceInCalendarDays, format } = require('date-fns');

const anchorDate = parseISO('2026-04-01T12:00:00Z');

// Javier worked: May 9, 10
// We want to see what happens on May 11, 12, 13
const testDates = ['2026-05-09', '2026-05-10', '2026-05-11', '2026-05-12', '2026-05-13'];

testDates.forEach(dStr => {
    const date = parseISO(dStr + 'T12:00:00Z');
    const diff = differenceInCalendarDays(date, anchorDate);
    const rawPos = diff % 8;
    
    // Check family
    const worksWith2 = [6, 7, 0, 1].includes((rawPos + 8) % 8);
    const worksWith6 = [2, 3, 4, 5].includes((rawPos + 8) % 8);
    
    console.log(`Date: ${dStr}, diff: ${diff}, rawPos: ${rawPos}, w2: ${worksWith2}, w6: ${worksWith6}`);
    
    const cyclePos2 = (diff + 2) % 8;
    const cyclePos6 = (diff + 6) % 8;
    console.log(`  CyclePos (offset 2): ${cyclePos2}, CyclePos (offset 6): ${cyclePos6}`);
});
