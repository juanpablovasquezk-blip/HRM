import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireApiAuth } from '@/lib/auth/api-guard';

export async function GET(request: Request) {
  const auth = await requireApiAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const name = url.searchParams.get('name') || 'MATIAS PABLO';
  
  const supabase = createAdminClient();
  
  // Find personnel
  const { data: personnel } = await supabase
    .from('personnel')
    .select('id, first_name, last_name_father, main_position, rotation_pattern')
    .ilike('first_name', `%${name}%`)
    .limit(1)
    .single();
    
  if (!personnel) {
    return NextResponse.json({ error: 'Personnel not found' });
  }
  
  // Fetch their assignments
  const { data: assignments } = await supabase
    .from('shift_assignments')
    .select('*, shift:shifts(name, start_time, end_time), area:areas(name)')
    .eq('personnel_id', personnel.id)
    .order('date');
    
  return NextResponse.json({
    personnel,
    assignmentsCount: assignments?.length || 0,
    assignments
  });
}
