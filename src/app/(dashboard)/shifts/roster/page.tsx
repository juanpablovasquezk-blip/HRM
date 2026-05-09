import { createClient } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';
import { RosterGridClient } from './roster-grid-client';
import { startOfMonth, endOfMonth, format, startOfWeek, endOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  // Use the month from URL or the current month as base
  const currentMonthDate = params.month ? new Date(params.month + '-01T00:00:00') : new Date();
  
  // Date range for the database queries: Full weeks covering the month
  const startDate = format(startOfWeek(startOfMonth(currentMonthDate), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const endDate = format(endOfWeek(endOfMonth(currentMonthDate), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const [
    { data: personnel },
    { data: shifts },
    { data: areas },
    { data: assignments },
    { data: leaves },
    { data: positions },
    { data: requirements }
  ] = await Promise.all([
    supabase.from('personnel').select('*, company:companies!personnel_company_id_fkey(name)').eq('is_active', true).order('last_name_father'),
    supabase.from('shifts').select('*').order('start_time'),
    supabase.from('areas').select('*, positions(*)').order('name'),
    supabase.from('shift_assignments').select('*').gte('date', startDate).lte('date', endDate),
    supabase.from('leaves').select('*').eq('status', 'approved').lte('start_date', endDate).gte('end_date', startDate),
    supabase.from('positions').select('*').order('name'),
    supabase
      .from('shift_requirements')
      .select('*, shift:shifts(name, start_time, end_time), area:areas(name), position:positions(name)')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Planificador Maestro (Roster)</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Visualiza y gestiona la carga de turnos de todo el personal para {format(currentMonthDate, 'MMMM yyyy', { locale: es })}
        </p>
      </div>

      <RosterGridClient 
        personnel={personnel || []}
        shifts={shifts || []}
        areas={areas || []}
        assignments={assignments || []}
        leaves={leaves || []}
        positions={positions || []}
        requirements={requirements || []}
        currentMonth={format(startOfMonth(currentMonthDate), 'yyyy-MM-dd')}
      />
    </div>
  );
}
