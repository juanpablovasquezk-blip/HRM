import { 
  Users, Star, CalendarOff, Plane, 
  Car, Bus, GitCompare, AlertCircle
} from 'lucide-react';
import { StatCard } from '@/components/dashboard/stat-card';
import { MonthlyEvolutionChart } from '@/components/dashboard/monthly-evolution-chart';
import { AbsenceDonut } from '@/components/dashboard/absence-donut';
import { TodoList } from '@/components/dashboard/todo-list';
import { ActiveLeavesCard } from '@/components/dashboard/active-leaves-card';
import { BirthdaysCard } from '@/components/dashboard/birthdays-card';

import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
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
  let birthdayPeople: Array<{ name: string; birthDate: string }> = [];

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

      // ── 5c. Ausentismo final: asignaciones canceladas DESPUES de publicar (is_confirmed=true) ──
      const { data: cancelledToday } = await supabase
        .from('shift_assignments').select('personnel_id')
        .eq('status', 'cancelled').eq('is_confirmed', true)
        .eq('date', today).eq('is_extra', false);

      const leavePersonnelIdsToday = new Set((todayLeaves || []).map((l: any) => l.personnel_id));
      const finalAbsentIds = [...new Set(
        (cancelledToday || [])
          .map(a => a.personnel_id)
          .filter(id => id && !leavePersonnelIdsToday.has(id))
      )];

      if (finalAbsentIds.length > 0) {
        const { data: finalPersonnel } = await supabase
          .from('personnel').select('id, first_name, last_name_father')
          .in('id', finalAbsentIds);
        const fpMap = new Map((finalPersonnel || []).map(p => [p.id, p]));
        finalAbsentPeople = finalAbsentIds.map(id => {
          const p = fpMap.get(id) as any;
          return { name: p ? `${p.first_name} ${p.last_name_father}` : 'Desconocido' };
        });
      }

      // ── 6. Transportes (mes actual) ────────────────────────────────────────
      const [{ count: ownCount }, { data: allTransport }] = await Promise.all([
        supabase.from('transport_requests').select('id', { count: 'exact', head: true })
          .eq('transport_type', 'PROPIO').gte('date', monthStart).lte('date', monthEnd),
        supabase.from('transport_requests').select('id', { count: 'exact', head: true })
          .neq('transport_type', 'PROPIO').neq('transport_type', 'PENDIENTE')
          .gte('date', monthStart).lte('date', monthEnd),
      ]);
      ownTransport = ownCount || 0;
      // For company transport, count = total - own - pending
      const { count: totalTransport } = await supabase
        .from('transport_requests').select('id', { count: 'exact', head: true })
        .gte('date', monthStart).lte('date', monthEnd);
      companyTransport = Math.max(0, (totalTransport || 0) - ownTransport);

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

      // ── 9. Evolución mensual (últimos 2 meses) ─────────────────────────────
      const months = [];
      for (let i = 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
        const label = d.toLocaleDateString('es-CL', { month: 'short' });

        const [{ count: mExtra }, { data: mSick }, { data: mVac }, { data: mCancelled }, { data: mLeaves }] = await Promise.all([
          supabase.from('shift_assignments').select('id', { count: 'exact', head: true })
            .eq('is_extra', true).gte('date', mStart).lte('date', mEnd),
          supabase.from('leaves').select('start_date, end_date')
            .eq('type', 'sick').eq('status', 'approved')
            .lte('start_date', mEnd).gte('end_date', mStart),
          supabase.from('leaves').select('start_date, end_date')
            .eq('type', 'vacation').eq('status', 'approved')
            .lte('start_date', mEnd).gte('end_date', mStart),
          supabase.from('shift_assignments').select('personnel_id, date')
            .eq('status', 'cancelled').eq('is_confirmed', true).eq('is_extra', false)
            .gte('date', mStart).lte('date', mEnd),
          supabase.from('leaves').select('personnel_id, start_date, end_date')
            .eq('status', 'approved')
            .lte('start_date', mEnd).gte('end_date', mStart),
        ]);

        // Ausentismo final = cancelled assignments NOT covered by any approved leave
        const leaveMap = new Map<string, {start: string; end: string}[]>();
        (mLeaves || []).forEach((l: any) => {
          if (!leaveMap.has(l.personnel_id)) leaveMap.set(l.personnel_id, []);
          leaveMap.get(l.personnel_id)!.push({ start: l.start_date, end: l.end_date });
        });
        const uniqueNoShows = new Set<string>();
        (mCancelled || []).forEach((ca: any) => {
          const leaves = leaveMap.get(ca.personnel_id) || [];
          const onLeave = leaves.some(l => l.start <= ca.date && l.end >= ca.date);
          if (!onLeave) uniqueNoShows.add(`${ca.personnel_id}-${ca.date}`);
        });
        const ausentismo_final = uniqueNoShows.size;

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
  const greeting = now.getHours() < 12 ? 'Buenos Días' : now.getHours() < 18 ? 'Buenas Tardes' : 'Buenas Noches';
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
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Transporte Propio"
            value={ownTransport}
            subtitle="Solicitudes mes actual"
            icon={Car}
            iconClassName="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
          />
          <StatCard
            title="Transporte Empresa"
            value={companyTransport}
            subtitle="Solicitudes mes actual"
            icon={Bus}
            iconClassName="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
          />
          <StatCard
            title="Cambios de Turno"
            value={manualChanges}
            subtitle="Reasignaciones manuales"
            icon={GitCompare}
            iconClassName="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
          />
          <StatCard
            title="Solicitudes Pendientes"
            value={pendingRequests}
            subtitle="Ausencias por aprobar"
            icon={AlertCircle}
            iconClassName={`${pendingRequests > 0 ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-slate-100 text-slate-500'}`}
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

      {/* ── Fila: TodoList + Ausencias activas ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TodoList />
        <ActiveLeavesCard people={activeLeavesPeople} finalAbsences={finalAbsentPeople} />
      </div>

      {/* ── Fila: Cumpleaños ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BirthdaysCard people={birthdayPeople} />
      </div>
    </div>
  );
}
