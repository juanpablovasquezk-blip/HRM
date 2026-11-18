import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import DailyPlanningClient from './daily-planning-client';
import { getDailyOperationalData } from './actions';
import { requireActionAuth } from '@/lib/auth/action-guard';

export const dynamic = 'force-dynamic';

const MOBILE_UA_REGEX = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

export default async function DailyPlanningPage(props: {
  searchParams: Promise<{ date?: string }>;
}) {
  const auth = await requireActionAuth({ roles: ['ADMIN', 'SUPERVISOR'] });
  if (!auth.ok) {
    return (
      <div className="p-8 text-center text-slate-500">
        <h2 className="text-xl font-bold text-slate-800">Acceso Restringido</h2>
        <p className="mt-2 text-sm">
          Solo los roles ADMIN y SUPERVISOR tienen acceso a la Planificación Diaria.
        </p>
      </div>
    );
  }

  const headerList = await headers();
  const userAgent = headerList.get('user-agent') || '';
  if (auth.role === 'SUPERVISOR' && MOBILE_UA_REGEX.test(userAgent)) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center text-slate-600 space-y-2">
        <h2 className="text-xl font-bold text-slate-800">Acceso exclusivo desde PC / Escritorio</h2>
        <p className="text-sm">
          Para el rol SUPERVISOR, la Planificación Diaria está habilitada únicamente desde un computador de escritorio.
        </p>
      </div>
    );
  }

  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const canEdit = true;
  
  const date = searchParams.date || format(new Date(), 'yyyy-MM-dd');

  // Fetch baseline data
  let { assignments, requirements, error } = await getDailyOperationalData(date);
  
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
          userRole={auth.role}
        />
      )}
    </div>
  );
}
