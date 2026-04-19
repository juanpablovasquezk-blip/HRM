const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const { parseISO, differenceInHours, differenceInCalendarDays, format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } = require('date-fns');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
    const juanId = '42bcbb5c-9e2a-49c4-8896-0b0d8680445d';
    const nicaId = '320f459a-8634-40a8-87c3-bae2f4cdc56c';
    
    // Dates to test
    const tests = [
        { personId: nicaId, date: '2026-04-25', shift: 'AM 08' },
        { personId: juanId, date: '2026-05-01', shift: 'AM 00' }
    ];

    for (const test of tests) {
        console.log(`\n--- TESTING ${test.personId} ON ${test.date} (${test.shift}) ---`);
        
        const { data: person } = await supabase.from('personnel').select('*, positions!personnel_main_position_fkey(name)').eq('id', test.personId).single();
        const { data: shift } = await supabase.from('shifts').select('*').eq('name', test.shift).single();
        const { data: assignments } = await supabase.from('shift_assignments').select('*, shifts(*)').eq('personnel_id', test.personId);

        if (!person || !shift) { console.log('Person or Shift not found'); continue; }

        const personnel = {
            ...person,
            main_position_name: person.positions.name,
            assigned_dates: new Set(assignments.map(a => a.date))
        };

        const shiftSlot = {
            date: test.date,
            shift_id: shift.id,
            shift_name: shift.name,
            shift_start: shift.start_time,
            shift_end: shift.end_time,
            shift_duration_hours: 8.5 // estimate
        };

        // RUN ROTATION CHECK
        const pattern = personnel.rotation_pattern.toUpperCase();
        const dateStrForLogic = test.date + 'T12:00:00Z';
        const date = parseISO(dateStrForLogic);
        const anchorBlue = parseISO('2026-04-13T12:00:00Z');
        const daysSinceAnchorBlue = differenceInCalendarDays(date, anchorBlue);
        const dayOfCycle = ((daysSinceAnchorBlue % 21) + 21) % 21;
        const weekIdx = Math.floor(dayOfCycle / 7);
        const dayOfWeek = dayOfCycle % 7;

        console.log(`Logic: weekIdx=${weekIdx}, dayOfWeek=${dayOfWeek}`);

        // SUNDAY CHECK (The likely culprit)
        const slotDate = parseISO(test.date);
        const mStart = startOfMonth(slotDate);
        const mEnd = endOfMonth(slotDate);
        const monthKey = format(mStart, 'yyyy-MM');
        
        const sundaysInMonth = [];
        let curr = new Date(mStart);
        while (curr <= mEnd) {
            if (curr.getDay() === 0) sundaysInMonth.push(format(curr, 'yyyy-MM-dd'));
            curr.setDate(curr.getDate() + 1);
        }

        let assignedSundays = 0;
        for (const sunDate of sundaysInMonth) {
            if (personnel.assigned_dates.has(sunDate)) assignedSundays++;
        }
        
        const isSundayWork = slotDate.getDay() === 0;
        console.log(`Month: ${monthKey}, Sundays assigned: ${assignedSundays}/${sundaysInMonth.length}`);
        
        if (slotDate.getDay() === 6 && assignedSundays >= (sundaysInMonth.length - 2)) {
             // This is simplified but shows if he worked too many sundays
             // Wait, the rule is about the CURRENT sunday assignment.
        }

        // ROTATION LOGIC RE-CHECK
        let activeBlock = '';
        if (pattern.includes('-1')) {
            if (weekIdx === 0) activeBlock = 'A';
            else if (weekIdx === 1) activeBlock = 'C';
            else activeBlock = 'B';
        } else if (pattern.includes('-3')) {
            if (weekIdx === 0) activeBlock = 'C';
            else if (weekIdx === 1) activeBlock = 'B';
            else activeBlock = 'A';
        }

        console.log(`Active Block: ${activeBlock}`);
        if (activeBlock === 'B') {
            const expected = dayOfWeek === 4 ? 'AM 00' : 'AM 08';
            if (dayOfWeek === 2 || dayOfWeek === 3) console.log('VIOLATION: Rest Wed-Thu');
            if (!shift.name.includes(expected)) console.log(`VIOLATION: Shift mismatch. Expected ${expected}, got ${shift.name}`);
        }
    }
}

run();
