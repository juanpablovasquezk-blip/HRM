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

  // 2. Revisar si alguien lo usa
  const { count: usersCount } = await supabase.from('personnel').select('*', { count: 'exact', head: true }).eq('main_position', pos.id);
  const { count: asgCount } = await supabase.from('shift_assignments').select('*', { count: 'exact', head: true }).eq('position_id', pos.id);
  const { count: reqCount } = await supabase.from('shift_requirements').select('*', { count: 'exact', head: true }).eq('position_id', pos.id);

  return NextResponse.json({
    posicion_detectada: pos,
    trabajadores_usandolo: usersCount,
    asignaciones_usandolo: asgCount,
    requerimientos_usandolo: reqCount,
    mensaje: (usersCount! > 0 || asgCount! > 0 || reqCount! > 0) 
      ? 'BLOQUEADO: Hay registros vinculados a este cargo.' 
      : 'Debería poder borrarse. Si falla, es por otra restricción.'
  })
}
