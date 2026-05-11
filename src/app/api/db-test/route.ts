import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  const supabase = createClient(url!, key!)
  
  const tablesToCheck = ['shift_requirements', 'shift_assignments', 'requirement_templates', 'areas', 'personnel'];
  const results: any = {};

  for (const table of tablesToCheck) {
    const { error } = await supabase.from(table).select('count').limit(1);
    results[table] = {
      existe: !error || (error.code !== 'PGRST204' && error.code !== 'PGRST205'),
      error: error ? { code: error.code, message: error.message } : null
    };
  }

  return NextResponse.json({
    analisis_de_tablas: results,
    timestamp: new Date().toISOString()
  })
}
