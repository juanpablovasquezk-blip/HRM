import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  const supabase = createClient(url!, key!)
  
  // 1. Encontrar el Área Atrex y el Cargo Supervisor
  const { data: area } = await supabase.from('areas').select('id').ilike('name', 'Atrex').single();
  const { data: pos } = await supabase.from('positions')
    .select('id, name')
    .eq('area_id', area?.id)
    .ilike('name', 'Supervisor')
    .single();

  if (!pos) return NextResponse.json({ error: 'No se encontró el cargo Supervisor en Atrex' });

  // 2. Revisar quién lo usa
  const { data: personnel } = await supabase.from('personnel')
    .select('first_name, last_name_father')
    .eq('main_position', pos.id);

  return NextResponse.json({
    cargo_atrex: pos.name,
    trabajadores_a_cambiar: personnel?.map(p => `${p.first_name} ${p.last_name_father}`) || [],
    mensaje: 'Debes cambiar el cargo a estos trabajadores antes de poder borrar el cargo de Atrex.'
  })
}
