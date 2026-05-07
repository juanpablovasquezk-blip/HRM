'use server';

import { createClient } from '@/lib/supabase/server';
import { startOfDay, endOfDay, eachDayOfInterval, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export async function getIndividualRoster(personnelId: string, startDate: string, endDate: string) {
  const supabase = await createClient();

  // 1. Fetch Personnel Info
  const { data: personnel, error: pErr } = await supabase
    .from('personnel')
    .select('*, company:companies(name)')
    .eq('id', personnelId)
    .single();

  if (pErr || !personnel) return { error: 'Trabajador no encontrado' };

  // 1b. Fetch Position Name manually since no DB relation is defined for select
  let positionName = 'TRABAJADOR';
  if (personnel.main_position) {
    const { data: pos } = await supabase
      .from('positions')
      .select('name')
      .eq('id', personnel.main_position)
      .single();
    if (pos) positionName = pos.name;
  }
  
  // Attach position name to personnel object
  (personnel as any).position = { name: positionName };

  // 2. Fetch Assignments (Scheduled shifts)
  const { data: assignments, error: aErr } = await supabase
    .from('shift_assignments')
    .select('*, shift:shifts!shift_assignments_shift_id_fkey(*), area:areas(name), position:positions(name)')
    .eq('personnel_id', personnelId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true });

  if (aErr) return { error: aErr.message };

  // 3. Fetch Leaves/Absences
  const { data: leaves } = await supabase
    .from('leaves')
    .select('*')
    .eq('personnel_id', personnelId)
    .lte('start_date', endDate)
    .gte('end_date', startDate);

  return {
    personnel,
    assignments: assignments || [],
    leaves: leaves || [],
    startDate,
    endDate
  };
}
