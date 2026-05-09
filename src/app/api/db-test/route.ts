import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  const supabase = createClient(url!, key!)
  
  const { data: tables, error } = await supabase
    .from('pg_catalog.pg_tables')
    .select('tablename')
    .eq('schemaname', 'public');

  return NextResponse.json({
    tables: tables || [],
    error_en_consulta: error,
    url_detectada: url?.substring(0, 20) + '...',
    timestamp: new Date().toISOString()
  })
}
