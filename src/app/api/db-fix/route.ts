import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  const supabase = createClient(url!, key!)
  
  // Forzamos que todos los trabajadores estén activos
  const { data, error } = await supabase
    .from('personnel')
    .update({ is_active: true })
    .is('is_active', null) // Si es null
    .select()

  const { data: data2 } = await supabase
    .from('personnel')
    .update({ is_active: true })
    .eq('is_active', false) // Si es false
    .select()

  return NextResponse.json({
    activados_desde_null: data?.length || 0,
    activados_desde_false: data2?.length || 0,
    error: error,
    timestamp: new Date().toISOString()
  })
}
