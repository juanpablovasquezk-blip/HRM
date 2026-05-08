import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  const supabase = createClient(url!, key!)
  
  // 1. Total bruto
  const { count: total_total } = await supabase.from('personnel').select('*', { count: 'exact', head: true });
  
  // 2. Filtrado por activos
  const { count: total_activos } = await supabase.from('personnel').select('*', { count: 'exact', head: true }).eq('is_active', true);
  
  // 3. Consulta completa con orden (como la página)
  const { data: personnel, error } = await supabase
    .from('personnel')
    .select('*, company:companies(name)')
    .eq('is_active', true)
    .order('last_name_father', { ascending: true })
    .limit(5);

  return NextResponse.json({
    total_total: total_total || 0,
    total_activos: total_activos || 0,
    total_ordenados_con_data: personnel?.length || 0,
    error_en_consulta: error,
    muestra_nombres: personnel?.map(p => `${p.first_name} ${p.last_name_father}`) || [],
    url_detectada: url?.substring(0, 20) + '...',
    timestamp: new Date().toISOString()
  })
}
