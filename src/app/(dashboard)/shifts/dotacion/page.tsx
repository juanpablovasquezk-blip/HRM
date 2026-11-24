import { listRequirements, listAreas, listShifts, listTemplates } from '@/app/(dashboard)/shifts/actions';
import { RequirementsClient } from './requirements-client';
import { createClient } from '@/lib/supabase/server';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { getUserRole } from '@/app/role-actions';
import { hasPermission } from '@/lib/auth/roles';
import type { Role } from '@/types/database';

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
    const { data: templates, quotas: templateQuotas } = await listTemplates();
    const { data: positions } = await supabase.from('positions').select('id, name').order('name');
    const role = await getUserRole();
    const canEdit = Boolean(role && hasPermission(role as Role, 'manageShifts'));

    return (
      <RequirementsClient
        initialReqs={reqs || []}
        templates={templates || []}
        templateQuotas={templateQuotas || []}
        areas={areas || []}
        shifts={shifts || []}
        positions={positions || []}
        companyId={authData.user?.id || ''}
        canEdit={canEdit}
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
