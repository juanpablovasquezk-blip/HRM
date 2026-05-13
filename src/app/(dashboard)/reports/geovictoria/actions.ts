'use server';

import { createClient } from '@/lib/supabase/server';
import { format, parseISO, eachDayOfInterval, isSaturday, isSunday, isWeekend } from 'date-fns';

export async function getPersonnelForFilter() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('personnel')
    .select('id, first_name, last_name_father')
    .eq('is_active', true)
    .order('first_name');
  return { data: data || [] };
}

export async function getGeoVictoriaData(filters: {
  startDate: string;
  endDate: string;
  onlyManual: boolean;
  personnelIds?: string[];
}) {
  const supabase = await createClient();

  const start = parseISO(filters.startDate);
  const end = parseISO(filters.endDate);

  try {
    let personnelQuery = supabase
      .from('personnel')
      .select('id, rut')
      .eq('is_active', true);

    if (filters.personnelIds && filters.personnelIds.length > 0) {
      personnelQuery = personnelQuery.in('id', filters.personnelIds);
    }

    const { data: personnelList } = await personnelQuery;

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
    
    if (filters.personnelIds && filters.personnelIds.length > 0) {
      assignmentsQuery = assignmentsQuery.in('personnel_id', filters.personnelIds);
    }

    const { data: assignments } = await assignmentsQuery;

    // 3. Get approved leaves (Vacations, Medical, etc.)
    let leavesQuery = supabase
      .from('leaves')
      .select('*')
      .eq('status', 'approved')
      .or(`start_date.lte.${filters.endDate},end_date.gte.${filters.startDate}`);

    if (filters.personnelIds && filters.personnelIds.length > 0) {
      leavesQuery = leavesQuery.in('personnel_id', filters.personnelIds);
    }

    const { data: leaves } = await leavesQuery;

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
            geoVId = -1;
          } else {
            geoVId = isWeekend(day) ? -1 : 24;
          }
        } else if (assignment) {
          geoVId = assignment.shift?.geov ?? -1;
        }

        if (filters.onlyManual && (!assignment || !assignment.is_manual)) {
          continue;
        }

        results.push({
          DNI: cleanRut,
          'ID Turno': geoVId,
          Dia: day.getDate(),
          Mes: day.getMonth() + 1,
          Año: day.getFullYear(),
          'ID Centro de Costo': ''
        });
      }
    }

    return { data: results };
  } catch (error) {
    console.error('Error generating GeoVictoria data:', error);
    return { data: [] };
  }
}
