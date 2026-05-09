import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  const supabase = createClient(url!, key!)
  
  // 1. Encontrar o crear el Área "Cargos Generales"
  let { data: generalArea } = await supabase.from('areas').select('id').ilike('name', 'Cargos Generales').maybeSingle();
  if (!generalArea) {
    const { data: newArea } = await supabase.from('areas').insert({ name: 'Cargos Generales' }).select().single();
    generalArea = newArea;
  }

  // 2. Encontrar o crear el Cargo "Supervisor" en Cargos Generales
  let { data: globalPos } = await supabase.from('positions')
    .select('id')
    .eq('area_id', generalArea?.id)
    .ilike('name', 'Supervisor')
    .maybeSingle();
    
  if (!globalPos) {
    const { data: newPos } = await supabase.from('positions')
      .insert({ area_id: generalArea?.id, name: 'Supervisor' })
      .select().single();
    globalPos = newPos;
  }

  // 3. Mover a los trabajadores (Pablo y Carlos) al nuevo cargo global
  const { data: targetPos } = await supabase.from('positions').select('id').ilike('name', 'Supervisor').single(); // This might be ambiguous if multiple exist
  // We use the ID of the "Supervisor (Atrex)" we found earlier to target exactly who to move
  const atrexPosId = '17153543-abd7-43d1-9d0d-93b2353967d0'; 

  const { error: updateError } = await supabase.from('personnel')
    .update({ main_position: globalPos?.id, area_id: generalArea?.id })
    .eq('main_position', atrexPosId);

  return NextResponse.json({
    area_general: generalArea,
    nuevo_cargo_id: globalPos?.id,
    error_update: updateError?.message || 'Ninguno',
    mensaje: 'Se han movido los supervisores al Área "Cargos Generales". Ahora el cargo de Supervisor en Atrex debería estar libre para ser borrado.'
  })
}
