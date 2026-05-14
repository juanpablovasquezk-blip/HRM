'use server';

import { createClient } from '@/lib/supabase/server';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import DailyPlanningClient from './daily-planning-client';
import { getDailyOperationalData } from './actions';

export default async function DailyPlanningPage(props: {
  searchParams: Promise<{ date?: string }>;
}) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const { getUserRole } = await import('@/app/role-actions');
  const role = await getUserRole();
  const { hasPermission } = await import('@/lib/auth/roles');
  const canEdit = hasPermission(role as any, 'manageShifts');
  
  const date = searchParams.date || format(new Date(), 'yyyy-MM-dd');

  // Fetch baseline data
  let { assignments, requirements, error } = await getDailyOperationalData(date);
  
  // Filter for Administrative Assistant: Only see confirmed/validated data
  if (role === 'AIRPORT_ASSISTANT' && assignments) {
    assignments = assignments.filter(a => a.is_confirmed);
  }
  
  // Fetch metadata for the "Add Extra" form
  const { data: areas } = await supabase.from('areas').select('*').order('name');
  const { data: positions } = await supabase.from('positions').select('*').order('name');
  const { data: shifts } = await supabase.from('shifts').select('*').order('start_time');

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 uppercase">
            Programación Operativa {format(parseISO(date), "EEEE d 'de' MMMM 'de' yyyy", { locale: es })}
          </h1>
          <p className="text-slate-500">Gestión de dotación diaria y turnos extras</p>
        </div>
        
        <div className="flex items-center gap-2">
           {/* Date Picker will be handled by client component for immediate revalidation */}
        </div>
      </div>

      {error ? (
        <div className="p-12 text-center bg-red-50 text-red-600 rounded-xl border border-red-100">
           {error}
        </div>
      ) : (
        <DailyPlanningClient 
          initialAssignments={assignments || []} 
          initialRequirements={requirements || []}
          areas={areas || []}
          positions={positions || []}
          shifts={shifts || []}
          selectedDate={date}
          readOnly={!canEdit}
        />
      )}
    </div>
  );
}
