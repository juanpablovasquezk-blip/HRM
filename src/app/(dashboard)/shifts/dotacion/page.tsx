import { listRequirements, listAreas, listShifts, listTemplates } from '@/app/(dashboard)/shifts/actions';
import { RequirementsClient } from './requirements-client';
import { createClient } from '@/lib/supabase/server';
import { format, startOfMonth, endOfMonth } from 'date-fns';

export const dynamic = 'force-dynamic';

export default async function RequirementsPage() {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    
    // Filter to current month for performance
    const start = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const end = format(endOfMonth(new Date()), 'yyyy-MM-dd');

    // Sequential fetch for stability
    const { data: reqs } = await listRequirements(start, end);
    const { data: areas } = await listAreas();
    const { data: shifts } = await listShifts();
    const { data: templates } = await listTemplates();

    return (
      <RequirementsClient
        initialReqs={reqs || []}
        templates={templates || []}
        areas={areas || []}
        shifts={shifts || []}
        companyId={authData.user?.id || ''}
      />
    );
  } catch (e: any) {
    return (
      <div className="p-10 border-2 border-red-500 bg-red-50 rounded-xl">
        <h1 className="text-xl font-bold text-red-700">Error de Carga</h1>
        <p className="mt-2 text-red-600">{e.message}</p>
      </div>
    );
  }
}
