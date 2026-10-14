'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getDailyOperationalData } from '@/app/(dashboard)/shifts/daily/actions';
import { format } from 'date-fns';

export interface ProyeccionDailyData {
  date: string;
  assignments: any[];
  requirements: any[];
  areas: any[];
  positions: any[];
  shifts: any[];
}

export interface ProyeccionDashboardData {
  date: string;
  dateFormatted: string;
  totalActivePersonnel: number;
  scheduledToday: number;
  extrasToday: number;
  absentToday: Array<{
    id: string;
    name: string;
    comment: string;
    shiftName: string;
    areaName: string;
  }>;
  leavesToday: Array<{
    id: string;
    name: string;
    type: string;
    startDate: string;
    endDate: string;
  }>;
  transport: {
    propio: number;
    empresa: number;
    pendiente: number;
  };
  shiftsBreakdown: Array<{
    shiftName: string;
    startTime: string;
    endTime: string;
    count: number;
  }>;
}

export interface ProyeccionPayload {
  daily: ProyeccionDailyData;
  dashboard: ProyeccionDashboardData;
  updatedAt: string;
}

export async function getProyeccionData(targetDate?: string): Promise<{ data?: ProyeccionPayload; error?: string }> {
  try {
    const supabase = createAdminClient();

    // Chilean local date
    const todayChile = format(
      new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' })),
      'yyyy-MM-dd'
    );
    const date = targetDate || todayChile;

    // ── 1. DAILY PLANNING DATA ──────────────────────────────────────────────
    const [
      dailyResult,
      { data: areas },
      { data: positions },
      { data: shifts },
    ] = await Promise.all([
      getDailyOperationalData(date),
      supabase.from('areas').select('*').order('name'),
      supabase.from('positions').select('*').order('name'),
      supabase.from('shifts').select('*').order('start_time'),
    ]);

    const activeAssignments = (dailyResult.assignments || []).filter(
      (a: any) => a.status !== 'cancelled'
    );

    // ── 2. DASHBOARD DEL DÍA METRICS ─────────────────────────────────────────
    // 2.1 Total Active Personnel
    const { count: staffCount } = await supabase
      .from('personnel')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .or('onboarding_status.is.null,onboarding_status.eq.approved');

    const totalActivePersonnel = staffCount || 0;

    // 2.2 Extras today
    const extrasToday = activeAssignments.filter((a: any) => a.is_extra).length;

    // 2.3 Absent today
    const { data: absentRaw } = await supabase
      .from('shift_assignments')
      .select('id, personnel_id, attendance_comment, shift:shifts(name), area:areas(name)')
      .eq('attendance_status', 'absent')
      .eq('date', date);

    const absentPersonnelIds = (absentRaw || []).map((a: any) => a.personnel_id).filter(Boolean);
    let absentMap = new Map<string, any>();
    if (absentPersonnelIds.length > 0) {
      const { data: absentPeople } = await supabase
        .from('personnel')
        .select('id, first_name, last_name_father, last_name_mother')
        .in('id', absentPersonnelIds);
      (absentPeople || []).forEach(p => absentMap.set(p.id, p));
    }

    const absentToday = (absentRaw || []).map((a: any) => {
      const p = absentMap.get(a.personnel_id);
      const firstName = p?.first_name ? p.first_name.split(' ')[0] : 'Desconocido';
      const lastName = p?.last_name_father || '';
      return {
        id: a.id,
        name: `${firstName} ${lastName}`.trim(),
        comment: a.attendance_comment || 'Sin motivo registrado',
        shiftName: a.shift?.name || 'Turno',
        areaName: a.area?.name || 'General',
      };
    });

    // 2.4 Active leaves covering today
    const { data: leavesRaw } = await supabase
      .from('leaves')
      .select('id, personnel_id, type, start_date, end_date')
      .eq('status', 'approved')
      .lte('start_date', date)
      .gte('end_date', date);

    const leavePersonnelIds = (leavesRaw || []).map((l: any) => l.personnel_id).filter(Boolean);
    let leavePersonMap = new Map<string, any>();
    if (leavePersonnelIds.length > 0) {
      const { data: leavePeople } = await supabase
        .from('personnel')
        .select('id, first_name, last_name_father')
        .in('id', leavePersonnelIds);
      (leavePeople || []).forEach(p => leavePersonMap.set(p.id, p));
    }

    const leavesToday = (leavesRaw || []).map((l: any) => {
      const p = leavePersonMap.get(l.personnel_id);
      const firstName = p?.first_name ? p.first_name.split(' ')[0] : 'Personal';
      const lastName = p?.last_name_father || '';
      return {
        id: l.id,
        name: `${firstName} ${lastName}`.trim(),
        type: l.type,
        startDate: l.start_date,
        endDate: l.end_date,
      };
    });

    // 2.5 Transport today
    const [
      { count: propioCount },
      { count: empresaCount },
      { count: pendienteCount },
    ] = await Promise.all([
      supabase
        .from('transport_requests')
        .select('id', { count: 'exact', head: true })
        .eq('date', date)
        .eq('transport_type', 'PROPIO'),
      supabase
        .from('transport_requests')
        .select('id', { count: 'exact', head: true })
        .eq('date', date)
        .neq('transport_type', 'PROPIO')
        .neq('transport_type', 'PENDIENTE'),
      supabase
        .from('transport_requests')
        .select('id', { count: 'exact', head: true })
        .eq('date', date)
        .eq('transport_type', 'PENDIENTE'),
    ]);

    // 2.6 Shifts breakdown
    const shiftCountMap = new Map<string, { shift: any; count: number }>();
    activeAssignments.forEach((a: any) => {
      if (!a.shift) return;
      const sid = a.shift.id;
      if (!shiftCountMap.has(sid)) {
        shiftCountMap.set(sid, { shift: a.shift, count: 0 });
      }
      shiftCountMap.get(sid)!.count++;
    });

    const shiftsBreakdown = Array.from(shiftCountMap.values())
      .map(({ shift, count }) => ({
        shiftName: shift.name,
        startTime: shift.start_time?.substring(0, 5) || '',
        endTime: shift.end_time?.substring(0, 5) || '',
        count,
      }))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    // Formatted date string in Spanish
    const dateFormatted = new Intl.DateTimeFormat('es-CL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${date}T12:00:00`));

    return {
      data: {
        daily: {
          date,
          assignments: activeAssignments,
          requirements: dailyResult.requirements || [],
          areas: areas || [],
          positions: positions || [],
          shifts: shifts || [],
        },
        dashboard: {
          date,
          dateFormatted: dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1),
          totalActivePersonnel,
          scheduledToday: activeAssignments.length,
          extrasToday,
          absentToday,
          leavesToday,
          transport: {
            propio: propioCount || 0,
            empresa: empresaCount || 0,
            pendiente: pendienteCount || 0,
          },
          shiftsBreakdown,
        },
        updatedAt: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
      },
    };
  } catch (err: any) {
    console.error('[getProyeccionData] Error fetching projection data:', err);
    return { error: err.message || 'Error al obtener datos para proyección' };
  }
}
