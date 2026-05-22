import { Users, UserCheck, Clock, CalendarOff } from 'lucide-react';
import { StatCard } from '@/components/dashboard/stat-card';
import { KPIChart } from '@/components/dashboard/kpi-chart';
import { AttendanceDonut } from '@/components/dashboard/attendance-donut';
import { TodoList } from '@/components/dashboard/todo-list';
import { WhosAway } from '@/components/dashboard/whos-away';

import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  let totalPersonnel = 0;
  let activeToday = 0;
  let upcomingShifts = 0;
  let onLeave = 0;

  if (user) {
    const { data: profile } = await supabase.from('users').select('company_id').eq('id', user.id).single();
    
    if (profile?.company_id) {
      const today = new Date().toISOString().split('T')[0];
      
      // Total Personnel
      const { count: staffCount } = await supabase
        .from('personnel')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', profile.company_id);
      totalPersonnel = staffCount || 0;

      // Active Today (Has a shift assignment today)
      const { count: activeCount } = await supabase
        .from('shift_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('date', today);
      activeToday = activeCount || 0;

      // Pending Shifts Upcoming (Next 7 days)
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const { count: shiftCount } = await supabase
        .from('shift_assignments')
        .select('id', { count: 'exact', head: true })
        .gte('date', today)
        .lte('date', nextWeek.toISOString().split('T')[0]);
      upcomingShifts = shiftCount || 0;

      // On Leave Today
      const { count: leaveCount } = await supabase
        .from('leaves')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved')
        .lte('start_date', today)
        .gte('end_date', today);
      onLeave = leaveCount || 0;
    }
  }

  const now = new Date();
  const greeting =
    now.getHours() < 12 ? 'Buenos Días' : now.getHours() < 18 ? 'Buenas Tardes' : 'Buenas Noches';
  const dateStr = now.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{greeting}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Un resumen rápido de tu progreso hoy ({dateStr})
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Personal Total"
          value={totalPersonnel}
          icon={Users}
          iconClassName="bg-blue-100 text-orange-600 dark:bg-blue-900/30 dark:text-blue-400"
        />
        <StatCard
          title="Tareas Programadas"
          value={activeToday}
          icon={UserCheck}
          iconClassName="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
        />
        <StatCard
          title="Turnos Próximos"
          value={upcomingShifts}
          subtitle="Próx. 7 días"
          icon={Clock}
          iconClassName="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        />
        <StatCard
          title="En Licencia"
          value={onLeave}
          icon={CalendarOff}
          iconClassName="bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <KPIChart />
        </div>
        <div className="lg:col-span-2">
          <AttendanceDonut />
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <TodoList />
        </div>
        <div className="lg:col-span-2">
          <WhosAway />
        </div>
      </div>
    </div>
  );
}
