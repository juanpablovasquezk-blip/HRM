import { 
  Users, Star, CalendarOff, Plane, 
  Car, Bus, GitCompare, AlertCircle, UserMinus
} from 'lucide-react';
import { StatCard } from '@/components/dashboard/stat-card';
import { MonthlyEvolutionChart } from '@/components/dashboard/monthly-evolution-chart';
import { AbsenceDonut } from '@/components/dashboard/absence-donut';
import { PendingDocsCard } from '@/components/dashboard/pending-docs-card';
import { IncompleteProfilesCard } from '@/components/dashboard/incomplete-profiles-card';
import { MissingDocsCard } from '@/components/dashboard/missing-docs-card';
import { BulkReminderButton } from '@/components/dashboard/bulk-reminder-button';
import { ActiveLeavesCard } from '@/components/dashboard/active-leaves-card';
import { BirthdaysCard } from '@/components/dashboard/birthdays-card';
import { MonthlyFinalAbsencesCard } from '@/components/dashboard/monthly-final-absences-card';
import { PendingTransportsCard } from '@/components/dashboard/pending-transports-card';
import { DashboardMonthSelector } from '@/components/dashboard/dashboard-month-selector';
import { NeedsCoverageCard } from '@/components/dashboard/needs-coverage-card';

import { format, startOfMonth, endOfMonth, subMonths, isSameMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { deactivateExpiredPersonnel } from '@/lib/deactivate-expired';
import { reconcileAllOverlappingLeaves } from '@/lib/leaves/leave-overlap';

export const dynamic = 'force-dynamic';

interface DashboardPageProps {
  searchParams?: Promise<{ month?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  // Auto-deactivate personnel whose termination date has arrived (fire-and-forget)
  deactivateExpiredPersonnel().catch(() => {});
  // Auto-reconcile overlapping leaves in the background (fire-and-forget)
  reconcileAllOverlappingLeaves(createAdminClient()).catch(() => {});

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const resolvedParams = searchParams ? await searchParams : {};
  const monthParam = resolvedParams?.month;

  // Date helpers
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();

  let selectedDate = now;
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split('-').map(Number);
    selectedDate = new Date(y, m - 1, 1);
  }

  const selectedMonthStr = format(selectedDate, 'yyyy-MM');
  const isSelectedCurrentMonth = isSameMonth(selectedDate, now);
  const selectedMonthLabel = format(selectedDate, "MMMM 'de' yyyy", { locale: es });
  const selectedMonthLabelCap = selectedMonthLabel.charAt(0).toUpperCase() + selectedMonthLabel.slice(1);

  const monthStart = format(startOfMonth(selectedDate), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(selectedDate), 'yyyy-MM-dd');

  // Previous month for trend comparison
  const prevMonthDate = subMonths(selectedDate, 1);
  const prevMonthStart = format(startOfMonth(prevMonthDate), 'yyyy-MM-dd');
  const prevMonthEnd = format(endOfMonth(prevMonthDate), 'yyyy-MM-dd');

  // ── KPI Data ──────────────────────────────────────────────────────────────────
  let totalPersonnel = 0;
  let extraShifts = 0;       let prevExtraShifts = 0;
  let sickDays = 0;          let prevSickDays = 0;
  let vacationDays = 0;      let prevVacationDays = 0;
  let onLeaveToday = 0;
  let ownTransport = 0;
  let companyTransport = 0;
  let pendingTransports = 0;
  let pendingDates: string[] = [];
  let manualChanges = 0;
  let pendingRequests = 0;
  let absencePercent = 0;
  let pendingDismissals = 0;

  // Coverage of operational needs
  let totalRequiredSlots = 0;
  let totalAssignedSlots = 0;
  let coveragePercent = 0;
  let missingSlots = 0;

  // For charts
  let monthlyData: Array<{ month: string; extras: number; licencias: number; vacaciones: number; ausentismo_final: number }> = [];
  let todayOnVacation = 0;
  let todaySick = 0;
  let todayActive = 0;

  // For new sections
  let activeLeavesPeople: Array<{ name: string; startDate: string; endDate: string; type: string }> = [];
  let finalAbsentPeople: Array<{ name: string }> = [];
  let monthlyFinalAbsences: Array<{ name: string; count: number }> = [];
  let birthdayPeople: Array<{ name: string; birthDate: string }> = [];

  // For new widgets
  let pendingDocsCount = 0;
  let pendingDocs: any[] = [];
  let incompleteCount = 0;
  let incompletePersonnel: any[] = [];
  let missingDocsCount = 0;
  let missingDocsList: any[] = [];
  let pendingComplianceWorkers: any[] = [];

  if (user) {
    const { data: profile } = await supabase
      .from('users').select('company_id').eq('id', user.id).single();

    const companyId = profile?.company_id || 'c0cc0000-0000-0000-0000-000000000000';

    // ── 1. Personal total ──────────────────────────────────────────────────
    const { count: staffCount } = await supabase
      .from('personnel').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('is_active', true)
      .or('onboarding_status.is.null,onboarding_status.eq.approved');
    totalPersonnel = staffCount || 0;

    // ── 2. Cobertura de Necesidades Operacionales del Mes Seleccionado ──────
    const [{ data: monthRequirements }, { count: assignedCount }] = await Promise.all([
      supabase
        .from('shift_requirements')
        .select('required_count')
        .gte('date', monthStart)
        .lte('date', monthEnd),
      supabase
        .from('shift_assignments')
        .select('id', { count: 'exact', head: true })
        .gte('date', monthStart)
        .lte('date', monthEnd)
    ]);

    totalRequiredSlots = (monthRequirements || []).reduce((sum, r) => sum + (r.required_count || 1), 0);
    totalAssignedSlots = assignedCount || 0;
    coveragePercent = totalRequiredSlots > 0 ? Math.round((totalAssignedSlots / totalRequiredSlots) * 100) : (totalAssignedSlots > 0 ? 100 : 0);
    missingSlots = Math.max(0, totalRequiredSlots - totalAssignedSlots);

    // ── 3. Turnos extra (mes seleccionado vs mes anterior) ───────────────────
    const [{ count: extraCurr }, { count: extraPrev }] = await Promise.all([
      supabase.from('shift_assignments').select('id', { count: 'exact', head: true })
        .eq('is_extra', true).gte('date', monthStart).lte('date', monthEnd),
      supabase.from('shift_assignments').select('id', { count: 'exact', head: true })
        .eq('is_extra', true).gte('date', prevMonthStart).lte('date', prevMonthEnd),
    ]);
    extraShifts = extraCurr || 0;
    prevExtraShifts = extraPrev || 0;

    // ── 4. Licencias médicas (días aprobados mes seleccionado) ────────────────
    const { data: sickLeaves } = await supabase
      .from('leaves').select('start_date, end_date')
      .eq('type', 'sick').eq('status', 'approved')
      .lte('start_date', monthEnd).gte('end_date', monthStart);

    const countDaysInMonth = (start: string, end: string) => {
      const s = new Date(Math.max(new Date(start).getTime(), new Date(monthStart).getTime()));
      const e = new Date(Math.min(new Date(end).getTime(), new Date(monthEnd).getTime()));
      return Math.max(0, Math.floor((e.getTime() - s.getTime()) / 86400000) + 1);
    };
    sickDays = (sickLeaves || []).reduce((acc, l) => acc + countDaysInMonth(l.start_date, l.end_date), 0);

    const { data: prevSickLeaves } = await supabase
      .from('leaves').select('start_date, end_date')
      .eq('type', 'sick').eq('status', 'approved')
      .lte('start_date', prevMonthEnd).gte('end_date', prevMonthStart);
    const countDaysPrevMonth = (start: string, end: string) => {
      const s = new Date(Math.max(new Date(start).getTime(), new Date(prevMonthStart).getTime()));
      const e = new Date(Math.min(new Date(end).getTime(), new Date(prevMonthEnd).getTime()));
      return Math.max(0, Math.floor((e.getTime() - s.getTime()) / 86400000) + 1);
    };
    prevSickDays = (prevSickLeaves || []).reduce((acc, l) => acc + countDaysPrevMonth(l.start_date, l.end_date), 0);

    // ── 5. Vacaciones (días aprobados mes seleccionado) ─────────────────────
    const { data: vacLeaves } = await supabase
      .from('leaves').select('start_date, end_date')
      .eq('type', 'vacation').eq('status', 'approved')
      .lte('start_date', monthEnd).gte('end_date', monthStart);
    vacationDays = (vacLeaves || []).reduce((acc, l) => acc + countDaysInMonth(l.start_date, l.end_date), 0);

    const { data: prevVacLeaves } = await supabase
      .from('leaves').select('start_date, end_date')
      .eq('type', 'vacation').eq('status', 'approved')
      .lte('start_date', prevMonthEnd).gte('end_date', prevMonthStart);
    prevVacationDays = (prevVacLeaves || []).reduce((acc, l) => acc + countDaysPrevMonth(l.start_date, l.end_date), 0);

    // ── 6. Ausencias hoy (para donut y % ausentismo diario) ─────────────────
    // Exclude 'personal' (libres solicitados)
    const { data: todayLeaves } = await supabase
      .from('leaves').select('type, start_date, end_date, personnel_id')
      .eq('status', 'approved').lte('start_date', today).gte('end_date', today)
      .neq('type', 'personal');

    todayOnVacation = (todayLeaves || []).filter(l => l.type === 'vacation').length;
    todaySick = (todayLeaves || []).filter(l => l.type === 'sick').length;
    onLeaveToday = (todayLeaves || []).length;
    todayActive = Math.max(0, totalPersonnel - onLeaveToday);
    absencePercent = totalPersonnel > 0 ? Math.round((onLeaveToday / totalPersonnel) * 100) : 0;

    // ── 7. Bajas pendientes de devolución TICA/PCP ──────────────────────────
    const { count: pendingDismissalsCount } = await supabase
      .from('personnel')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('is_active', false)
      .eq('dismissal_status', 'pending');
    pendingDismissals = pendingDismissalsCount || 0;

    // ── 8. Ausencias activas hoy con nombres (excluye personal/libres) ───────
    if ((todayLeaves || []).length > 0) {
      const personnelIds = (todayLeaves || []).map(l => l.personnel_id).filter(Boolean);
      const { data: leavePersonnel } = await supabase
        .from('personnel').select('id, first_name, last_name_father')
        .in('id', personnelIds);
      const pMap = new Map((leavePersonnel || []).map(p => [p.id, p]));
      activeLeavesPeople = (todayLeaves || []).map(l => {
        const p = pMap.get(l.personnel_id) as any;
        return {
          name: p ? `${p.first_name} ${p.last_name_father}` : 'Desconocido',
          startDate: l.start_date,
          endDate: l.end_date,
          type: l.type,
        };
      });
    }

    // ── 9. Ausentismo final: marcado por supervisor en vista Asistencia (attendance_status='absent') ──
    const { data: absentToday } = await supabase
      .from('shift_assignments').select('personnel_id, attendance_comment')
      .eq('attendance_status', 'absent').eq('date', today);

    const finalAbsentIds = [...new Set(
      (absentToday || []).map((a: any) => a.personnel_id).filter(Boolean)
    )];

    if (finalAbsentIds.length > 0) {
      const { data: finalPersonnel } = await supabase
        .from('personnel').select('id, first_name, last_name_father')
        .in('id', finalAbsentIds);
      const fpMap = new Map((finalPersonnel || []).map((p: any) => [p.id, p]));
      finalAbsentPeople = (absentToday || [])
        .map((a: any) => {
          if (!a.personnel_id) return null;
          const p = fpMap.get(a.personnel_id) as any;
          return {
            name: p ? `${p.first_name} ${p.last_name_father}` : 'Desconocido',
            comment: a.attendance_comment || 'sin motivo'
          };
        })
        .filter(Boolean) as any[];
    }

    // ── 10. Ausentismo final del mes seleccionado: agrupado por persona ─────
    const { data: monthAbsentRaw } = await supabase
      .from('shift_assignments').select('personnel_id')
      .eq('attendance_status', 'absent')
      .gte('date', monthStart).lte('date', monthEnd);

    // Count no-shows per person
    const noShowCountMap = new Map<string, number>();
    (monthAbsentRaw || []).forEach((ca: any) => {
      if (ca.personnel_id) {
        noShowCountMap.set(ca.personnel_id, (noShowCountMap.get(ca.personnel_id) || 0) + 1);
      }
    });

    if (noShowCountMap.size > 0) {
      const noShowIds = [...noShowCountMap.keys()];
      const { data: noShowPersonnel } = await supabase
        .from('personnel').select('id, first_name, last_name_father')
        .in('id', noShowIds);
      const nsMap = new Map((noShowPersonnel || []).map((p: any) => [p.id, p]));
      monthlyFinalAbsences = noShowIds
        .map(id => {
          const p = nsMap.get(id) as any;
          return {
            name: p ? `${p.first_name} ${p.last_name_father}` : 'Desconocido',
            count: noShowCountMap.get(id) || 1,
          };
        })
        .sort((a, b) => b.count - a.count);
    }

    // ── 11. Transportes (diarios y pendientes acumulados) ───────────────────
    const todayStr = format(
      new Date(new Date().toLocaleString("en-US", { timeZone: "America/Santiago" })),
      'yyyy-MM-dd'
    );

    const [
      { count: ownCount },
      { count: companyCount },
      { count: pendingTransCount },
      { data: pendingDatesData }
    ] = await Promise.all([
      supabase.from('transport_requests').select('id', { count: 'exact', head: true })
        .eq('transport_type', 'PROPIO')
        .eq('date', todayStr),
      supabase.from('transport_requests').select('id', { count: 'exact', head: true })
        .neq('transport_type', 'PROPIO')
        .neq('transport_type', 'PENDIENTE')
        .eq('date', todayStr),
      supabase.from('transport_requests').select('id', { count: 'exact', head: true })
        .eq('transport_type', 'PENDIENTE'),
      supabase.from('transport_requests')
        .select('date')
        .eq('transport_type', 'PENDIENTE')
        .order('date', { ascending: false })
    ]);

    ownTransport = ownCount || 0;
    companyTransport = companyCount || 0;
    pendingTransports = pendingTransCount || 0;
    pendingDates = Array.from(new Set(pendingDatesData?.map(d => d.date) || [])) as string[];

    // ── 12. Cambios de turno post-publicación (mes seleccionado) ────────────
    // Solo contabiliza reasignaciones y modificaciones hechas sobre turnos ya publicados
    const { count: auditCount } = await supabase
      .from('roster_audit_logs')
      .select('id', { count: 'exact', head: true })
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .eq('was_published', true);
    manualChanges = auditCount || 0;

    // ── 13. Solicitudes pendientes ──────────────────────────────────────────
    const { count: pendingCount } = await supabase
      .from('leaves').select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    pendingRequests = pendingCount || 0;

    // ── 14. Cumpleaños del mes seleccionado ─────────────────────────────────
    const selectedMonthNum = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const { data: allPersonnel } = await supabase
      .from('personnel').select('first_name, last_name_father, birth_date')
      .eq('is_active', true).not('birth_date', 'is', null);
    birthdayPeople = (allPersonnel || [])
      .filter(p => p.birth_date && p.birth_date.slice(5, 7) === selectedMonthNum)
      .map(p => ({
        name: `${p.first_name} ${p.last_name_father}`,
        birthDate: p.birth_date,
      }));

    // ── 15. Documentos por validar ─────────────────────────────────────────
    const { data: pDocs, count: pDocsCount } = await supabase
      .from('documents')
      .select('id, type, personnel!inner(id, first_name, last_name_father, is_active, company_id)', { count: 'exact' })
      .eq('personnel.is_active', true)
      .eq('personnel.company_id', companyId)
      .eq('status', 'PENDING')
      .order('uploaded_at', { ascending: false })
      .limit(5);
    pendingDocsCount = pDocsCount || 0;
    pendingDocs = pDocs || [];

    // ── 16. Fichas Incompletas ──────────────────────────────────────────────
    const { data: incPers, count: incCount } = await supabase
      .from('personnel')
      .select('id, first_name, last_name_father, rut', { count: 'exact' })
      .eq('company_id', companyId)
      .eq('is_active', true)
      .or('onboarding_status.is.null,onboarding_status.eq.approved')
      .or('afp.is.null,health_system.is.null,bank_account_number.is.null,emergency_contact_phone.is.null,gender.is.null,marital_status.is.null,phone.is.null,afp.eq.,health_system.eq.,bank_account_number.eq.,emergency_contact_phone.eq.,gender.eq.,marital_status.eq.,phone.eq.')
      .order('first_name', { ascending: true })
      .limit(5);
    incompleteCount = incCount || 0;
    incompletePersonnel = incPers || [];

    // ── 17. Documentos por subir ──────────────────────────────────────────
    const [{ data: activeWorkers }, { data: mandatoryDefs }] = await Promise.all([
      supabase
        .from('personnel')
        .select('id, first_name, last_name_father, email, rut, phone, afp, health_system, bank_account_number, emergency_contact_phone, gender, marital_status, main_position, secondary_positions')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .or('onboarding_status.is.null,onboarding_status.eq.approved'),
      supabase
        .from('document_definitions')
        .select('id, name, applicable_positions')
        .eq('is_active', true)
        .eq('is_mandatory', true)
    ]);

    if (activeWorkers && activeWorkers.length > 0 && mandatoryDefs && mandatoryDefs.length > 0) {
      const workerIds = activeWorkers.map(w => w.id);
      const { data: existingDocs } = await supabase
        .from('documents')
        .select('definition_id, personnel_id, file_url')
        .in('personnel_id', workerIds);

      const eDocs = existingDocs || [];
      const missingList: any[] = [];

      for (const worker of activeWorkers) {
        const positionIds: string[] = [];
        if (worker.main_position) positionIds.push(worker.main_position);
        if (Array.isArray(worker.secondary_positions)) {
          positionIds.push(...worker.secondary_positions);
        }

        // Check if missing documents
        const workerDocs = eDocs.filter(d => d.personnel_id === worker.id);
        const missingForThisWorker = mandatoryDefs.filter(def => {
          const applicable: string[] = def.applicable_positions || [];
          if (applicable.length > 0 && !applicable.some((p: string) => positionIds.includes(p))) {
            return false;
          }
          const doc = workerDocs.find(d => d.definition_id === def.id);
          return !doc || !doc.file_url;
        });

        if (missingForThisWorker.length > 0) {
          missingList.push({
            personnel: worker,
            missingCount: missingForThisWorker.length,
            documentNames: missingForThisWorker.map(def => def.name)
          });
        }

        // Check if profile is incomplete
        const isProfileIncomplete = !worker.afp || !worker.health_system || !worker.bank_account_number || 
          !worker.emergency_contact_phone || !worker.gender || !worker.marital_status || !worker.phone;

        // Add to consolidated compliance list if either condition is met
        if (isProfileIncomplete || missingForThisWorker.length > 0) {
          pendingComplianceWorkers.push({
            id: worker.id,
            first_name: worker.first_name,
            last_name_father: worker.last_name_father,
            email: worker.email || '',
            rut: worker.rut || '',
            phone: worker.phone || '',
            hasIncompleteProfile: isProfileIncomplete,
            missingDocs: missingForThisWorker.map(def => def.name)
          });
        }
      }

      missingList.sort((a, b) => b.missingCount - a.missingCount);
      missingDocsCount = missingList.length;
      missingDocsList = missingList.slice(0, 5);
    }

    // ── 18. Evolución mensual (6 meses hasta el mes seleccionado) ───────────
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(selectedDate, i);
      const mStart = format(startOfMonth(d), 'yyyy-MM-dd');
      const mEnd = format(endOfMonth(d), 'yyyy-MM-dd');
      const label = d.toLocaleDateString('es-CL', { month: 'short' });

      const [{ count: mExtra }, { data: mSick }, { data: mVac }, { count: mAbsent }] = await Promise.all([
        supabase.from('shift_assignments').select('id', { count: 'exact', head: true })
          .eq('is_extra', true).gte('date', mStart).lte('date', mEnd),
        supabase.from('leaves').select('start_date, end_date')
          .eq('type', 'sick').eq('status', 'approved')
          .lte('start_date', mEnd).gte('end_date', mStart),
        supabase.from('leaves').select('start_date, end_date')
          .eq('type', 'vacation').eq('status', 'approved')
          .lte('start_date', mEnd).gte('end_date', mStart),
        supabase.from('shift_assignments').select('id', { count: 'exact', head: true })
          .eq('attendance_status', 'absent')
          .gte('date', mStart).lte('date', mEnd),
      ]);

      const ausentismo_final = mAbsent || 0;

      const countDays = (start: string, end: string, ms: string, me: string) => {
        const s = new Date(Math.max(new Date(start).getTime(), new Date(ms).getTime()));
        const e = new Date(Math.min(new Date(end).getTime(), new Date(me).getTime()));
        return Math.max(0, Math.floor((e.getTime() - s.getTime()) / 86400000) + 1);
      };

      months.push({
        month: label.charAt(0).toUpperCase() + label.slice(1),
        extras: mExtra || 0,
        licencias: (mSick || []).reduce((a, l) => a + countDays(l.start_date, l.end_date, mStart, mEnd), 0),
        vacaciones: (mVac || []).reduce((a, l) => a + countDays(l.start_date, l.end_date, mStart, mEnd), 0),
        ausentismo_final,
      });
    }
    monthlyData = months;
  }

  // ── Trend helpers ─────────────────────────────────────────────────────────────
  const trendValue = (curr: number, prev: number, lowerIsBetter = false) => {
    if (prev === 0) return undefined;
    const pct = Math.round(Math.abs(((curr - prev) / prev) * 100));
    const isUp = curr > prev;
    const positive = lowerIsBetter ? curr <= prev : curr >= prev;
    return { value: pct, label: 'vs mes anterior', positive, isUp };
  };

  // ── Greeting ──────────────────────────────────────────────────────────────────
  const santiagoHour = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Santiago" })).getHours();
  const greeting = santiagoHour < 12 ? 'Buenos Días' : santiagoHour < 18 ? 'Buenas Tardes' : 'Buenas Noches';
  const dateStr = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{greeting}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Resumen operacional — {dateStr}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <DashboardMonthSelector currentMonthStr={selectedMonthStr} />
          <div className="shrink-0">
            <BulkReminderButton people={pendingComplianceWorkers} />
          </div>
        </div>
      </div>

      {/* ── Cobertura de Necesidades del Mes Seleccionado ── */}
      <NeedsCoverageCard
        totalRequired={totalRequiredSlots}
        totalAssigned={totalAssignedSlots}
        coveragePercent={coveragePercent}
        missingSlots={missingSlots}
        monthLabel={selectedMonthLabelCap}
        monthStr={selectedMonthStr}
      />

      {/* ── Fila 1: KPIs principales del mes ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {isSelectedCurrentMonth ? 'Este mes' : `Estadísticas de ${selectedMonthLabelCap}`}
          </p>
          <span className="text-xs font-bold text-slate-500">
            {selectedMonthLabelCap}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Turnos Extra"
            value={extraShifts}
            subtitle={isSelectedCurrentMonth ? 'Mes actual' : selectedMonthLabelCap}
            icon={Star}
            trend={trendValue(extraShifts, prevExtraShifts, true)}
            iconClassName="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
          />
          <StatCard
            title="Días Licencia Médica"
            value={sickDays}
            subtitle="Días aprobados"
            icon={CalendarOff}
            trend={trendValue(sickDays, prevSickDays, true)}
            iconClassName="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
          />
          <StatCard
            title="Días Vacaciones"
            value={vacationDays}
            subtitle="Días aprobados"
            icon={Plane}
            trend={trendValue(vacationDays, prevVacationDays, false)}
            iconClassName="bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400"
          />
          <StatCard
            title="Ausentismo Final Hoy"
            value={`${finalAbsentPeople.length}`}
            subtitle={`${finalAbsentPeople.length} persona${finalAbsentPeople.length !== 1 ? 's' : ''} no presentó`}
            icon={Users}
            iconClassName={`${finalAbsentPeople.length > 0 ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-slate-100 text-slate-500'}`}
          />
        </div>
      </div>

      {/* ── Fila 2: KPIs secundarios / Operaciones ── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Operaciones</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard
            title="Transporte Propio"
            value={ownTransport}
            subtitle="Solicitudes hoy"
            icon={Car}
            iconClassName="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
          />
          <StatCard
            title="Transporte Empresa"
            value={companyTransport}
            subtitle="Solicitudes hoy"
            icon={Bus}
            iconClassName="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
          />
          <PendingTransportsCard
            count={pendingTransports}
            dates={pendingDates}
          />
          <StatCard
            title="Cambios de Turno"
            value={manualChanges}
            subtitle={manualChanges === 0 ? "0 reasignaciones post-publicación" : `${manualChanges} cambio${manualChanges !== 1 ? 's' : ''} post-publicación`}
            icon={GitCompare}
            iconClassName="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
          />
          <StatCard
            title="Solicitudes Ausencia"
            value={pendingRequests}
            subtitle="Por aprobar"
            icon={CalendarOff}
            iconClassName={`${pendingRequests > 0 ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-slate-100 text-slate-500'}`}
          />
          <StatCard
            title="Bajas Pendientes"
            value={pendingDismissals}
            subtitle="Devoluciones DGAC"
            icon={UserMinus}
            iconClassName={`${pendingDismissals > 0 ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-slate-100 text-slate-500'}`}
          />
        </div>
      </div>

      {/* ── Gráficos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <MonthlyEvolutionChart data={monthlyData} />
        </div>
        <div className="lg:col-span-2">
          <AbsenceDonut
            active={todayActive}
            vacation={todayOnVacation}
            sick={todaySick}
            total={totalPersonnel}
          />
        </div>
      </div>

      {/* ── Fila: Documentos por Validar, Fichas Incompletas y Documentos por Subir ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PendingDocsCard count={pendingDocsCount} docs={pendingDocs} />
        <IncompleteProfilesCard count={incompleteCount} people={incompletePersonnel} />
        <MissingDocsCard count={missingDocsCount} people={missingDocsList} />
      </div>

      {/* ── Fila: Ausencias Hoy, Cumpleaños + Ausentismo Final del Mes ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ActiveLeavesCard people={activeLeavesPeople} finalAbsences={finalAbsentPeople} />
        <BirthdaysCard people={birthdayPeople} />
        <MonthlyFinalAbsencesCard
          people={monthlyFinalAbsences}
          monthLabel={selectedMonthLabelCap}
        />
      </div>
    </div>
  );
}
