import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('shifts')
    .select('id, name, start_time, end_time')
    .order('start_time');
  
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  // Deduplicate by name
  const seen = new Set<string>();
  const unique = (data || []).filter(s => {
    if (seen.has(s.name)) return false;
    seen.add(s.name);
    return true;
  });
  
  return NextResponse.json(unique);
}
