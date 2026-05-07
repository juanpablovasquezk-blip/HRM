const { createClient } = require('@supabase/supabase-js');
            require('dotenv').config({ path: '.env.local' });

            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

            const supabase = createClient(supabaseUrl, supabaseKey);

            async function checkPersonnel() {
                const { data: m, error: me } = await supabase
                    .from('personnel')
                    .select('*, fixed_shift:shifts(*)')
                    .ilike('first_name', '%Marcelo%')
                    .ilike('last_name_father', '%Jara%');
                
                const { data: d, error: de } = await supabase
                    .from('personnel')
                    .select('*, fixed_shift:shifts(*)')
                    .ilike('first_name', '%Deimar%');

                console.log('Marcelo Data:');
                console.log(JSON.stringify(m, null, 2));
                console.log('\nDeimar Data:');
                console.log(JSON.stringify(d, null, 2));
            }

            checkPersonnel();
