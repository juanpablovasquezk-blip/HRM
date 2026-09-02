import { listAreas } from '@/app/(dashboard)/shifts/actions';
import { AreasClient } from '@/app/(dashboard)/shifts/areas/areas-client';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function SettingsAreasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await supabase.from('users').select('company_id').eq('id', user.id).single() : null;
  
  let companyId = profile?.data?.company_id;
  
  if (!companyId) {
    const { data: fallbackCompany } = await supabase.from('companies').select('id').limit(1).single();
    companyId = fallbackCompany?.id || '';
  }

  const { data: areas, error } = await listAreas();
  const safeAreas = areas ? JSON.parse(JSON.stringify(areas)) : [];

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-200">
        Error cargando áreas: {error}
      </div>
    );
  }

  return <AreasClient initialAreas={safeAreas} userCompanyId={companyId} backUrl="/settings" backLabel="Volver a Ajustes" />;
}
