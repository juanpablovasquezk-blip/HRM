'use server';

import { createClient } from '@/lib/supabase/server';
import { format, parseISO, eachDayOfInterval, isSaturday, isSunday, isWeekend } from 'date-fns';

export async function getGeoVictoriaData(filters: {
  startDate: string;
  endDate: string;
  onlyManual: boolean;
}) {
  const supabase = await createClient();

  const start = parseISO(filters.startDate);
  const end = parseISO(filters.endDate);

  // 1. Get ALL active personnel (to report their status for each day)
  const { data: personnelList } = await supabase
    .from('personnel')
    .select('id, rut')
    .eq('is_active', true);

  if (!personnelList) return { data: [] };

  // 2. Get assignments (EXCLUDING EXTRAS)
  let assignmentsQuery = supabase
    .from('shift_assignments')
    .select(`
      date,
      personnel_id,
      is_manual,
      shift:shifts!shift_assignments_shift_id_fkey(geov)
    `)
    .gte('date', filters.startDate)
    .lte('date', filters.endDate)
    .eq('is_published', true)
    .eq('is_extra', false) // RULE: No extra shifts
    .neq('status', 'cancelled');

  if (filters.onlyManual) {
    assignmentsQuery = assignmentsQuery.eq('is_manual', true);
  }

  const { data: assignments } = await assignmentsQuery;

  // 3. Get approved leaves (Vacations, Medical, etc.)
  const { data: leaves } = await supabase
    .from('leaves')
    .select('*')
    .eq('status', 'approved')
    .or(`start_date.lte.${filters.endDate},end_date.gte.${filters.startDate}`);

  // Create lookup maps for performance
  const assignmentMap = new Map();
  assignments?.forEach(a => {
    assignmentMap.set(`${a.personnel_id}_${a.date}`, a);
  });

  const daysInRange = eachDayOfInterval({ start, end });
  const results: any[] = [];

  // 4. Generate rows for each person and each day
  for (const person of personnelList) {
    const cleanRut = (person.rut || '').replace(/[.-]/g, '');

    for (const day of daysInRange) {
      const dateStr = format(day, 'yyyy-MM-dd');
      const assignment = assignmentMap.get(`${person.id}_${dateStr}`);
      
      // Check if person has a leave on this day
      const hasLeave = leaves?.some(l => 
        person.id === l.personnel_id && 
        dateStr >= l.start_date && 
        dateStr <= l.end_date
      );

      let geoVId = -1; // Default: Day Off / Free

      if (hasLeave) {
        const leave = leaves?.find(l => 
          person.id === l.personnel_id && 
          dateStr >= l.start_date && 
          dateStr <= l.end_date
        );

        if (leave?.type === 'free_request' || leave?.type === 'other') {
          // RULE: Free Requests and ABS (Other) are always -1
          geoVId = -1;
        } else {
          // RULE: Vacations/Medical Leave
          // Mon-Fri = 24, Sat-Sun = -1
          geoVId = isWeekend(day) ? -1 : 24;
        }
      } else if (assignment) {
        // Normal Assignment
        geoVId = assignment.shift?.geov ?? -1;
      }

      // If "Only Manual Changes" is active, skip if it's not a manual change
      // AND skip leaves (unless the user specifically wants leaves in manual report? 
      // Usually manual changes report is for audits of shifts. 
      // I'll stick to the "is_manual" flag for assignments.)
      if (filters.onlyManual && (!assignment || !assignment.is_manual)) {
        continue;
      }

      results.push({
        DNI: cleanRut,
        'ID Turno': geoVId,
        Dia: day.getDate(),
        Mes: day.getMonth() + 1,
        Año: day.getFullYear()
      });
    }
  }

  return { data: results };
}
