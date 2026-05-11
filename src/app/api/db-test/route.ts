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
    tablas_encontradas: tables?.map(t => t.tablename) || [],
    error_consulta: error,
    timestamp: new Date().toISOString()
  })
}
