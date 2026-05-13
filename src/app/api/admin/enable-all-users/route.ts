import { createClient } from '@/lib/supabase/server';
import { enablePersonnelAccess } from '@/app/(dashboard)/personnel/actions';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  
  // 1. Fetch all personnel without user_id but with email
  const { data: personnel, error } = await supabase
    .from('personnel')
    .select('id, email, main_position, first_name, last_name_father')
    .is('user_id', null)
    .not('email', 'is', null)
    .eq('is_active', true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!personnel || personnel.length === 0) {
    return NextResponse.json({ message: 'No hay usuarios pendientes de habilitar con email.' });
  }

  const results = [];
  
  // We process them one by one to avoid rate limits or timeouts
  for (const person of personnel) {
    try {
      // Determine role
      let role: 'SUPERVISOR' | 'USER' = 'USER';
      const { data: pos } = await supabase
        .from('positions')
        .select('name')
        .eq('id', person.main_position)
        .single();
        
      if (pos?.name.toUpperCase().includes('SUPERVISOR')) {
        role = 'SUPERVISOR';
      }

      const res = await enablePersonnelAccess(person.id, person.email!, role);
      results.push({ 
        name: `${person.first_name} ${person.last_name_father}`, 
        email: person.email, 
        role,
        success: res.success, 
        error: res.error 
      });
    } catch (e: any) {
      results.push({ 
        name: `${person.first_name} ${person.last_name_father}`, 
        email: person.email, 
        success: false, 
        error: e.message 
      });
    }
  }

  return NextResponse.json({ 
    summary: {
      total: results.length,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    },
    details: results 
  });
}
