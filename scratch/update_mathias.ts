
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateMathias() {
  console.log('Buscando a Mathias...');
  const { data: mathias, error: findError } = await supabase
    .from('personnel')
    .select('id, first_name, rotation_pattern')
    .ilike('first_name', '%Mathias%')
    .single();

  if (findError || !mathias) {
    console.error('No se encontró a Mathias:', findError?.message);
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
