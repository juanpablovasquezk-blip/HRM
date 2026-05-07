const { createClient } = require('@supabase/supabase-js');
            require('dotenv').config({ path: '.env.local' });

            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

            const supabase = createClient(supabaseUrl, supabaseKey);

            async function checkPersonnel() {
                const { data, error } = await supabase
                    .from('personnel')
                    .select('*')
                    .ilike('first_name', '%Vicente%')
                    .ilike('last_name_father', '%Nuñez%');

                if (error) {
                    console.error('Error fetching personnel:', error);
                    return;
                }

                console.log('Personnel data:');
                console.log(JSON.stringify(data, null, 2));
            }

            checkPersonnel();
