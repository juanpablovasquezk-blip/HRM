import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!url || !key) {
    return NextResponse.json({
      error: "Variables de entorno faltantes",
      NEXT_PUBLIC_SUPABASE_URL: url ? "Presente" : "Faltante",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: key ? "Presente" : "Faltante"
    })
  }

  const supabase = createClient(url, key)
  const { count, error } = await supabase
    .from('personnel')
    .select('*', { count: 'exact', head: true })

  return NextResponse.json({
    url_detectada: url.substring(0, 30) + "...",
    total_trabajadores: count,
    error_supabase: error,
    timestamp: new Date().toISOString()
  })
}
