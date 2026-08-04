import { 
  Users, Star, CalendarOff, Plane, 
  Car, Bus, GitCompare, AlertCircle
} from 'lucide-react';
import { StatCard } from '@/components/dashboard/stat-card';
import { MonthlyEvolutionChart } from '@/components/dashboard/monthly-evolution-chart';
import { AbsenceDonut } from '@/components/dashboard/absence-donut';
import { PendingDocsCard } from '@/components/dashboard/pending-docs-card';
import { IncompleteProfilesCard } from '@/components/dashboard/incomplete-profiles-card';
import { MissingDocsCard } from '@/components/dashboard/missing-docs-card';
import { ActiveLeavesCard } from '@/components/dashboard/active-leaves-card';
import { BirthdaysCard } from '@/components/dashboard/birthdays-card';
import { MonthlyFinalAbsencesCard } from '@/components/dashboard/monthly-final-absences-card';
import { PendingTransportsCard } from '@/components/dashboard/pending-transports-card';

import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { deactivateExpiredPersonnel } from '@/lib/deactivate-expired';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  // Auto-deactivate personnel whose termination date has arrived (fire-and-forget)
  deactivateExpiredPersonnel().catch(() => {});

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Date helpers
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  // Previous month for trend comparison
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

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

  if (user) {
    const { data: profile } = await supabase
      .from('users').select('company_id').eq('id', user.id).single();

    if (profile?.company_id) {

      // ── 1. Personal total ──────────────────────────────────────────────────
      const { count: staffCount } = await supabase
        .from('personnel').select('id', { count: 'exact', head: true })
        .eq('company_id', profile.company_id).eq('is_active', true);
      totalPersonnel = staffCount || 0;

      // ── 2. Turnos extra (mes actual vs mes anterior) ────────────────────────
      const [{ count: extraCurr }, { count: extraPrev }] = await Promise.all([
        supabase.from('shift_assignments').select('id', { count: 'exact', head: true })
          .eq('is_extra', true).gte('date', monthStart).lte('date', monthEnd),
        supabase.from('shift_assignments').select('id', { count: 'exact', head: true })
          .eq('is_extra', true).gte('date', prevMonthStart).lte('date', prevMonthEnd),
      ]);
      extraShifts = extraCurr || 0;
      prevExtraShifts = extraPrev || 0;

      // ── 3. Licencias médicas (días aprobados mes actual) ───────────────────
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

      // ── 4. Vacaciones (días aprobados mes actual) ──────────────────────────
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

      // ── 5. Ausencias hoy (para donut y % ausentismo) ───────────────────────
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

      // ── 5b. Ausencias activas hoy con nombres (excluye personal/libres) ─────
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

      // ── 5c. Ausentismo final: marcado por supervisor en vista Asistencia (attendance_status='absent') ──
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

      // ── 5d. Ausentismo final del mes: agrupado por persona ────────────────
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

      // ── 6. Transportes (diarios y pendientes acumulados) ───────────────────
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

      // ── 7. Cambios manuales de turno (mes actual) ──────────────────────────
      const { count: manualCount } = await supabase
        .from('shift_assignments').select('id', { count: 'exact', head: true })
        .eq('is_manual', true).gte('date', monthStart).lte('date', monthEnd);
      manualChanges = manualCount || 0;

      // ── 8. Solicitudes pendientes ──────────────────────────────────────────
      const { count: pendingCount } = await supabase
        .from('leaves').select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      pendingRequests = pendingCount || 0;

      // ── 9. Cumpleaños del mes ──────────────────────────────────────────────
      const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
      const { data: allPersonnel } = await supabase
        .from('personnel').select('first_name, last_name_father, birth_date')
        .eq('is_active', true).not('birth_date', 'is', null);
      birthdayPeople = (allPersonnel || [])
        .filter(p => p.birth_date && p.birth_date.slice(5, 7) === currentMonth)
        .map(p => ({
          name: `${p.first_name} ${p.last_name_father}`,
          birthDate: p.birth_date,
        }));

      // ── 8b. Documentos por validar ─────────────────────────────────────────
      const { data: pDocs, count: pDocsCount } = await supabase
        .from('documents')
        .select('id, type, personnel!inner(id, first_name, last_name_father, is_active, company_id)', { count: 'exact' })
        .eq('personnel.is_active', true)
        .eq('personnel.company_id', profile.company_id)
        .eq('status', 'PENDING')
        .order('uploaded_at', { ascending: false })
        .limit(5);
      pendingDocsCount = pDocsCount || 0;
      pendingDocs = pDocs || [];

      // ── 8c. Fichas Incompletas ──────────────────────────────────────────────
      const { data: incPers, count: incCount } = await supabase
        .from('personnel')
        .select('id, first_name, last_name_father, rut', { count: 'exact' })
        .eq('company_id', profile.company_id)
        .eq('is_active', true)
        .or('afp.is.null,health_system.is.null,bank_account_number.is.null,emergency_contact_phone.is.null,gender.is.null,marital_status.is.null,phone.is.null,afp.eq.,health_system.eq.,bank_account_number.eq.,emergency_contact_phone.eq.,gender.eq.,marital_status.eq.,phone.eq.')
        .order('first_name', { ascending: true })
        .limit(5);
      incompleteCount = incCount || 0;
      incompletePersonnel = incPers || [];

      // ── 8d. Documentos por subir ──────────────────────────────────────────
      const [{ data: activeWorkers }, { data: mandatoryDefs }] = await Promise.all([
        supabase
          .from('personnel')
          .select('id, first_name, last_name_father')
          .eq('company_id', profile.company_id)
          .eq('is_active', true),
        supabase
          .from('document_definitions')
          .select('id, name')
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
          const workerDocs = eDocs.filter(d => d.personnel_id === worker.id);
          const missingForThisWorker = mandatoryDefs.filter(def => {
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
        }

        missingList.sort((a, b) => b.missingCount - a.missingCount);
        missingDocsCount = missingList.length;
        missingDocsList = missingList.slice(0, 5);
      }

      // ── 9. Evolución mensual (últimos 6 meses) ─────────────────────────────
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{greeting}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Resumen operacional — {dateStr}
        </p>
      </div>

      {/* ── Fila 1: KPIs principales ── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Este mes</p>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Turnos Extra"
            value={extraShifts}
            subtitle={`Mes actual`}
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

      {/* ── Fila 2: KPIs secundarios ── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Operaciones</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
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
            subtitle="Reasignaciones manuales"
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
          monthLabel={now.toLocaleDateString('es-CL', { month: 'long' })}
        />
      </div>
    </div>
  );
}
