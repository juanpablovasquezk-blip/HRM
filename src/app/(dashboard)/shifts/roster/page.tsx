import { createClient } from '@/lib/supabase/server';
import { RosterGridClient } from './roster-grid-client';
import { startOfMonth, endOfMonth, format } from 'date-fns';

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const currentMonth = params.month ? new Date(params.month + '-01T00:00:00') : new Date();
  const startDate = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
  const endDate = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

  const [
    { data: personnel },
    { data: shifts },
    { data: areas },
    { data: assignments },
    { data: leaves },
    { data: positions },
    { data: requirements }
  ] = await Promise.all([
    supabase.from('personnel').select('*, company:companies(name)').eq('is_active', true).order('last_name_father'),
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
          Visualiza y gestiona la carga de turnos de todo el personal para {format(currentMonth, 'MMMM yyyy')}
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
        currentMonth={startDate}
      />
    </div>
  );
}
