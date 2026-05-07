const { createClient } = require('@supabase/supabase-js');
            require('dotenv').config({ path: '.env.local' });

            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

            const supabase = createClient(supabaseUrl, supabaseKey);

            async function checkAssignment() {
                const date = '2026-04-21';
                const { data, error } = await supabase
                    .from('shift_assignments')
                    .select('*, personnel:personnel(first_name, last_name_father), shift:shifts(name, start_time), position:positions(name)')
                    .eq('date', date);

                if (error) {
                    console.error('Error fetching assignments:', error);
                    return;
                }

                console.log(`Assignments for ${date}:`);
                data.forEach(a => {
                    const shiftName = a.shift?.name || 'Unknown';
                    const posName = a.position?.name || 'Unknown';
                    const personName = `${a.personnel?.first_name} ${a.personnel?.last_name_father}`;
                    
                    if (shiftName.includes('12') || shiftName.includes('PM')) {
                         console.log(`- ${personName} | Shift: ${shiftName} | Position: ${posName}`);
                    }
                });
            }

            checkAssignment();
