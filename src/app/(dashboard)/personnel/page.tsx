import Link from 'next/link';
export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Plus, FileSpreadsheet } from 'lucide-react';
import { PersonnelFilters } from './personnel-filters';
import { hasPermission } from '@/lib/auth/roles';
import PersonnelTableClient from './personnel-table-client';

export default async function PersonnelPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; company_id?: string; position_id?: string; status?: 'active' | 'inactive' | 'pending' | 'missing_sizes' | 'all' }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { getUserRole } = await import('@/app/role-actions');
  const role = await getUserRole();
  const canEdit = hasPermission(role as any, 'managePersonnel');

  let positionIds: string[] = [];
  if (params.position_id) {
    const { data: posData } = await supabase
      .from('positions')
      .select('name')
      .eq('id', params.position_id)
      .single();

    if (posData) {
      const { data: shared } = await supabase
        .from('positions')
        .select('id')
        .eq('name', posData.name);
      positionIds = shared?.map(p => p.id) || [];
    }
  }

  let query = supabase
    .from('personnel')
    .select('*, company:companies!personnel_company_id_fkey(name)')
    .order('last_name_father', { ascending: true });

  const status = params.status || 'active';
  if (status === 'active') {
    query = query.eq('is_active', true).or('onboarding_status.is.null,onboarding_status.eq.approved');
  } else if (status === 'missing_sizes') {
    query = query.eq('is_active', true)
      .or('clothing_tshirt_size.is.null,clothing_shoe_size.is.null,clothing_pants_size_letter.is.null,clothing_pants_size_number.is.null');
  } else if (status === 'inactive') {
    query = query.eq('is_active', false).or('onboarding_status.is.null,onboarding_status.eq.approved,onboarding_status.eq.rejected');
  } else if (status === 'pending') {
    query = query.eq('onboarding_status', 'pending');
  }


  if (positionIds.length > 0) {
    query = query.in('main_position', positionIds);
  }

  if (params.search) {
    query = query.or(
      `first_name.ilike.%${params.search}%,last_name_father.ilike.%${params.search}%,rut.ilike.%${params.search}%`
    );
  }

  const [
    { data: personnel, error: pErr }, 
    { data: positions, error: posErr }, 
    { data: companies, error: cErr }, 
    { data: shifts, error: sErr }
  ] = await Promise.all([
    query,
    supabase.from('positions').select('id, name'),
    supabase.from('companies').select('id, name').order('name'),
    supabase.from('shifts').select('id, name, start_time, end_time')

  ]);

  if (pErr || posErr || cErr || sErr) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
        <h2 className="font-bold mb-2">Error detectado en la base de datos:</h2>
        <pre className="text-xs overflow-auto">
          {JSON.stringify({ personnel: pErr, positions: posErr, companies: cErr, shifts: sErr }, null, 2)}
        </pre>
      </div>
    );
  }

  const positionMap = Object.fromEntries((positions || []).map(p => [p.id, p.name]));
  const shiftMap = Object.fromEntries((shifts || []).map(s => [s.id, s.name]));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Personal</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gestiona tu fuerza laboral — {personnel?.length ?? 0} trabajadores {status === 'active' ? 'activos' : status === 'inactive' ? 'de baja' : 'registrados'}
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Link href="/personnel/import">
              <Button variant="outline" className="border-slate-200 text-slate-600 hover:text-orange-600">
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Importar Masivo
              </Button>
            </Link>
            <Link href="/personnel/new">
              <Button className="bg-gradient-to-r from-orange-50 to-orange-100 border-orange-200 text-orange-700 hover:bg-orange-100">
                <Plus className="mr-2 h-4 w-4" />
                Agregar Personal
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Search */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader className="pb-3">
          <PersonnelFilters 
            initialSearch={params.search} 
            initialCompanyId={params.company_id} 
            initialPositionId={params.position_id}
            initialStatus={status}
            companies={companies || []} 
            positions={positions || []}
          />
        </CardHeader>
        <CardContent className="p-0">
          <PersonnelTableClient 
            personnel={personnel as any} 
            positionMap={positionMap} 
            shiftMap={shiftMap}
            canEdit={canEdit}
            companies={companies || []}
            positions={positions || []}
            shifts={shifts || []}
          />

        </CardContent>
      </Card>
    </div>
  );
}

