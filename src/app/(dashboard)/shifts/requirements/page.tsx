import { listRequirements, listAreas, listShifts, listTemplates } from '@/app/(dashboard)/shifts/actions';
import { RequirementsClient } from './requirements-client';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function RequirementsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await supabase.from('users').select('company_id').eq('id', user.id).single() : null;
  
  let companyId = profile?.data?.company_id;
  if (!companyId) {
    const { data: fallbackCompany } = await supabase.from('companies').select('id').limit(1).single();
    companyId = fallbackCompany?.id || '';
  }

  const [{ data: reqs }, { data: areas }, { data: shifts }, { data: templates }] = await Promise.all([
    listRequirements(),
    listAreas(),
    listShifts(),
    listTemplates(),
  ]);

  return (
    <RequirementsClient
      initialReqs={JSON.parse(JSON.stringify(reqs || []))}
      templates={JSON.parse(JSON.stringify(templates || []))}
      areas={JSON.parse(JSON.stringify(areas || []))}
      shifts={JSON.parse(JSON.stringify(shifts || []))}
      companyId={companyId}
    />
  );
}
