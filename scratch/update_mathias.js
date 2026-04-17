
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Faltan variables de entorno en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateMathias() {
  console.log('Buscando a Mathias...');
  const { data: mathias, error: findError } = await supabase
    .from('personnel')
    .select('id, first_name, rotation_pattern')
    .ilike('first_name', '%Mathias%')
    .single();

  if (findError || !mathias) {
    console.error('No se encontró a Mathias:', findError ? findError.message : 'No hay datos');
    return;
  }

  console.log(`Encontrado: ${mathias.first_name} (ID: ${mathias.id}), Patrón actual: ${mathias.rotation_pattern}`);

  const { error: updateError } = await supabase
    .from('personnel')
    .update({ rotation_pattern: '7X7-B' })
    .eq('id', mathias.id);

  if (updateError) {
    console.error('Error al actualizar:', updateError.message);
  } else {
    console.log('✅ Mathias actualizado con éxito a 7X7-B');
  }
}

updateMathias();
