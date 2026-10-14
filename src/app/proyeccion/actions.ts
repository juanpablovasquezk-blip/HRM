'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getDailyOperationalData } from '@/app/(dashboard)/shifts/daily/actions';
import { calculateExpiration } from '@/lib/documents/expiration-engine';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export interface DocumentAlert {
  id: string;
  personnelName: string;
  documentName: string;
  type: 'expired' | 'expiring_soon' | 'missing';
  daysRemaining?: number;
  detail: string;
}

export interface BirthdayPerson {
  id: string;
  name: string;
  day: number;
  isToday: boolean;
  birthDateFormatted: string;
}

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
  documents: {
    expiredCount: number;
    expiringSoonCount: number;
    missingCount: number;
    alerts: DocumentAlert[];
  };
  birthdays: {
    todayBirthdays: BirthdayPerson[];
    monthBirthdays: BirthdayPerson[];
    monthName: string;
  };
}

export interface ProyeccionPayload {
  daily: ProyeccionDailyData;
  dashboard: ProyeccionDashboardData;
  updatedAt: string;
}

export async function getProyeccionData(targetDate?: string): Promise<{ data?: ProyeccionPayload; error?: string }> {
  try {
    const supabase = createAdminClient();

    // Chilean local date & helper parts
    const nowChile = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
    const todayChile = format(nowChile, 'yyyy-MM-dd');
    const date = targetDate || todayChile;
    const currentMonthNum = format(nowChile, 'MM');
    const currentDayNum = parseInt(format(nowChile, 'd'), 10);
    const monthName = format(nowChile, 'MMMM', { locale: es });

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
    // 2.1 All Active Personnel with details
    const { data: activeWorkersRaw } = await supabase
      .from('personnel')
      .select('id, first_name, last_name_father, last_name_mother, birth_date, main_position, secondary_positions')
      .eq('is_active', true)
      .or('onboarding_status.is.null,onboarding_status.eq.approved')
      .order('first_name');

    const activeWorkers = activeWorkersRaw || [];
    const totalActivePersonnel = activeWorkers.length;
    const workerMap = new Map(activeWorkers.map(w => [w.id, w]));

    // 2.2 Extras today
    const extrasToday = activeAssignments.filter((a: any) => a.is_extra).length;

    // 2.3 Absent today
    const { data: absentRaw } = await supabase
      .from('shift_assignments')
      .select('id, personnel_id, attendance_comment, shift:shifts(name), area:areas(name)')
      .eq('attendance_status', 'absent')
      .eq('date', date);

    const absentToday = (absentRaw || []).map((a: any) => {
      const p = workerMap.get(a.personnel_id);
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

    const leavesToday = (leavesRaw || []).map((l: any) => {
      const p = workerMap.get(l.personnel_id);
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

    // ── 2.7 CUMPLEAÑOS DE HOY Y DEL MES ──────────────────────────────────────
    const todayBirthdays: BirthdayPerson[] = [];
    const monthBirthdays: BirthdayPerson[] = [];

    activeWorkers.forEach(w => {
      if (!w.birth_date) return;
      // birth_date format: YYYY-MM-DD
      const [bYear, bMonth, bDayStr] = w.birth_date.split('-');
      if (bMonth === currentMonthNum) {
        const bDay = parseInt(bDayStr, 10);
        const firstName = w.first_name ? w.first_name.split(' ')[0] : '';
        const lastName = w.last_name_father || '';
        const isToday = bDay === currentDayNum;
        const personObj: BirthdayPerson = {
          id: w.id,
          name: `${firstName} ${lastName}`.trim(),
          day: bDay,
          isToday,
          birthDateFormatted: `${bDay} de ${monthName}`,
        };

        if (isToday) {
          todayBirthdays.push(personObj);
        }
        monthBirthdays.push(personObj);
      }
    });

    monthBirthdays.sort((a, b) => a.day - b.day);

    // ── 2.8 DOCUMENTOS VENCIDOS, POR VENCER O FALTANTES ──────────────────────
    let expiredCount = 0;
    let expiringSoonCount = 0;
    let missingCount = 0;
    const documentAlerts: DocumentAlert[] = [];

    const [{ data: allDocsRaw }, { data: mandatoryDefsRaw }] = await Promise.all([
      supabase
        .from('documents')
        .select('id, personnel_id, definition_id, type, uploaded_at, created_at, tica_date, expiration_date, file_url, definition:document_definitions(name)')
        .in('personnel_id', activeWorkers.map(w => w.id)),
      supabase
        .from('document_definitions')
        .select('id, name, applicable_positions')
        .eq('is_active', true)
        .eq('is_mandatory', true),
    ]);

    const allDocs = allDocsRaw || [];
    const mandatoryDefs = mandatoryDefsRaw || [];

    // Check expiration on existing documents
    for (const doc of allDocs) {
      if (!doc.file_url) continue;
      const worker = workerMap.get(doc.personnel_id);
      if (!worker) continue;

      const uploadDate = new Date(doc.uploaded_at || doc.created_at || new Date());
      const ticaDate = doc.tica_date ? new Date(doc.tica_date) : null;
      const explicitExp = doc.expiration_date ? new Date(doc.expiration_date) : null;

      const expResult = calculateExpiration(uploadDate, ticaDate, explicitExp);
      const docName = (doc.definition as any)?.name || doc.type || 'Documento';
      const workerName = `${worker.first_name?.split(' ')[0] || ''} ${worker.last_name_father || ''}`.trim();

      if (expResult.status === 'expired') {
        expiredCount++;
        const daysPast = Math.abs(expResult.days_remaining);
        documentAlerts.push({
          id: doc.id,
          personnelName: workerName,
          documentName: docName,
          type: 'expired',
          daysRemaining: expResult.days_remaining,
          detail: daysPast === 0 ? 'Vence hoy' : `Vencido hace ${daysPast} día${daysPast > 1 ? 's' : ''}`,
        });
      } else if (expResult.status === 'expiring_soon') {
        expiringSoonCount++;
        documentAlerts.push({
          id: doc.id,
          personnelName: workerName,
          documentName: docName,
          type: 'expiring_soon',
          daysRemaining: expResult.days_remaining,
          detail: `Vence en ${expResult.days_remaining} día${expResult.days_remaining > 1 ? 's' : ''}`,
        });
      }
    }

    // Check missing mandatory documents
    for (const worker of activeWorkers) {
      const positionIds: string[] = [];
      if (worker.main_position) positionIds.push(worker.main_position);
      if (Array.isArray(worker.secondary_positions)) positionIds.push(...worker.secondary_positions);

      const workerDocs = allDocs.filter(d => d.personnel_id === worker.id);
      const workerMissing = mandatoryDefs.filter(def => {
        const applicable: string[] = def.applicable_positions || [];
        if (applicable.length > 0 && !applicable.some((p: string) => positionIds.includes(p))) {
          return false;
        }
        const doc = workerDocs.find(d => d.definition_id === def.id);
        return !doc || !doc.file_url;
      });

      if (workerMissing.length > 0) {
        missingCount++;
        const workerName = `${worker.first_name?.split(' ')[0] || ''} ${worker.last_name_father || ''}`.trim();
        for (const mDef of workerMissing) {
          documentAlerts.push({
            id: `missing-${worker.id}-${mDef.id}`,
            personnelName: workerName,
            documentName: mDef.name,
            type: 'missing',
            detail: 'Documento obligatorio no subido',
          });
        }
      }
    }

    // Sort alerts: expired first, then expiring soon, then missing
    documentAlerts.sort((a, b) => {
      const rank = { expired: 1, expiring_soon: 2, missing: 3 };
      if (rank[a.type] !== rank[b.type]) return rank[a.type] - rank[b.type];
      return (a.daysRemaining || 0) - (b.daysRemaining || 0);
    });

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
          documents: {
            expiredCount,
            expiringSoonCount,
            missingCount,
            alerts: documentAlerts,
          },
          birthdays: {
            todayBirthdays,
            monthBirthdays,
            monthName: monthName.charAt(0).toUpperCase() + monthName.slice(1),
          },
        },
        updatedAt: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
      },
    };
  } catch (err: any) {
    console.error('[getProyeccionData] Error fetching projection data:', err);
    return { error: err.message || 'Error al obtener datos para proyección' };
  }
}
