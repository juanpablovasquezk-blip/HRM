import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  const supabase = createClient(url!, key!)
  
  // Intentar leer la tabla de reglas directamente
  const { data, error } = await supabase
    .from('requirement_templates')
    .select('count')
    .limit(1);

  return NextResponse.json({
    tabla_existe: !error || error.code !== 'PGRST204',
    error_detectado: error,
    mensaje: error ? 'La tabla NO existe o hay un error de permisos.' : 'La tabla EXISTE y es accesible.',
    timestamp: new Date().toISOString()
  })
}
