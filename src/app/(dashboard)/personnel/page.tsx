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
  searchParams: Promise<{ search?: string; company_id?: string; position_id?: string; status?: 'active' | 'inactive' | 'pending' | 'missing_sizes' | 'all' | 'incomplete' | 'missing_docs' | 'dismissal_pending' }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { getUserRole } = await import('@/app/role-actions');
  const role = await getUserRole();
  const canEdit = hasPermission(role as any, 'managePersonnel');

  let positionIds: string[] = [];
  if (params.position_id) {
    const ids = params.position_id.split(',').filter(Boolean);
    if (ids.length > 0) {
      const { data: posData } = await supabase
        .from('positions')
        .select('name')
        .in('id', ids);

      if (posData && posData.length > 0) {
        const names = posData.map(p => p.name);
        const { data: shared } = await supabase
          .from('positions')
          .select('id')
          .in('name', names);
        positionIds = shared?.map(p => p.id) || [];
      }
    }
  }

  let query = supabase
    .from('personnel')
    .select('*, company:companies!personnel_company_id_fkey(name)')
    .order('last_name_father', { ascending: true });

  const status = params.status || 'active';
  if (status === 'active' || status === 'missing_docs') {
    query = query.eq('is_active', true).or('onboarding_status.is.null,onboarding_status.eq.approved');
  } else if (status === 'missing_sizes') {
    query = query.eq('is_active', true)
      .or('clothing_tshirt_size.is.null,clothing_shoe_size.is.null,clothing_pants_size_letter.is.null,clothing_pants_size_number.is.null');
  } else if (status === 'incomplete') {
    query = query.eq('is_active', true)
      .or('afp.is.null,health_system.is.null,bank_account_number.is.null,emergency_contact_phone.is.null,gender.is.null,marital_status.is.null,phone.is.null,afp.eq.,health_system.eq.,bank_account_number.eq.,emergency_contact_phone.eq.,gender.eq.,marital_status.eq.,phone.eq.');
  } else if (status === 'dismissal_pending') {
    query = query.eq('is_active', false).eq('dismissal_status', 'pending');
  } else if (status === 'inactive') {
    query = query.eq('is_active', false)
      .or('dismissal_status.is.null,dismissal_status.eq.completed')
      .or('onboarding_status.is.null,onboarding_status.eq.approved,onboarding_status.eq.rejected');
  } else if (status === 'pending') {
    query = query.or('onboarding_status.eq.pending,dismissal_status.eq.pending');
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

  let displayPersonnel: any[] = personnel || [];

  if (displayPersonnel.length > 0) {
    const [{ data: mandatoryDefs }, { data: existingDocs }] = await Promise.all([
      supabase
        .from('document_definitions')
        .select('id, name, applicable_positions')
        .eq('is_active', true)
        .eq('is_mandatory', true),
      supabase
        .from('documents')
        .select('definition_id, personnel_id, file_url, number, expiration_date')
        .in('personnel_id', displayPersonnel.map(w => w.id))
    ]);

    const mDefs = mandatoryDefs || [];
    const eDocs = existingDocs || [];

    displayPersonnel = displayPersonnel.map(worker => {
      // 1. Missing fields (Ficha Incompleta)
      const fieldsToCheck = {
        afp: 'AFP',
        health_system: 'Sist. Salud',
        bank_account_number: 'Nº Cuenta',
        emergency_contact_phone: 'Contacto Emerg.',
        gender: 'Género',
        marital_status: 'Est. Civil',
        phone: 'Teléfono'
      };
      const missingFields: string[] = [];
      for (const [field, label] of Object.entries(fieldsToCheck)) {
        if (!worker[field] || (typeof worker[field] === 'string' && worker[field].trim() === '')) {
          missingFields.push(label);
        }
      }

      // 2. Missing documents (Doc. Incompleta)
      const positionIds: string[] = [];
      if (worker.main_position) positionIds.push(worker.main_position);
      if (Array.isArray(worker.secondary_positions)) {
        positionIds.push(...worker.secondary_positions);
      }

      const workerDocs = eDocs.filter(d => d.personnel_id === worker.id);
      const missingDocs = mDefs
        .filter(def => {
          const applicable: string[] = def.applicable_positions || [];
          if (applicable.length > 0 && !applicable.some((p: string) => positionIds.includes(p))) {
            return false;
          }
          const doc = workerDocs.find(d => d.definition_id === def.id);
          return !doc || !doc.file_url;
        })
        .map(def => def.name);

      // Check for TICA & PCP documents
      const ticaDoc = workerDocs.find((d: any) =>
        (d.definition_id && mDefs.find(def => def.id === d.definition_id)?.name.toLowerCase().includes('tica')) ||
        (d.type || '').toLowerCase().includes('tica')
      );
      const pcpDoc = workerDocs.find((d: any) =>
        (d.definition_id && mDefs.find(def => def.id === d.definition_id)?.name.toLowerCase().includes('pcp')) ||
        (d.type || '').toLowerCase().includes('pcp')
      );

      const hasTica = !!ticaDoc && !!ticaDoc.file_url;
      const hasPcp = !!pcpDoc && !!pcpDoc.file_url;
      const ticaNumber = ticaDoc?.number || '';
      const pcpNumber = pcpDoc?.number || '';
      const ticaExpiry = ticaDoc?.expiration_date || '';
      const pcpExpiry = pcpDoc?.expiration_date || '';
      const ticaUrl = ticaDoc?.file_url || '';
      const pcpUrl = pcpDoc?.file_url || '';

      return {
        ...worker,
        missingFields,
        missingDocs,
        hasTica,
        hasPcp,
        ticaNumber,
        pcpNumber,
        ticaExpiry,
        pcpExpiry,
        ticaUrl,
        pcpUrl
      };
    });

    if (status === 'missing_docs') {
      displayPersonnel = displayPersonnel.filter(worker => worker.missingDocs && worker.missingDocs.length > 0);
    }
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
            Gestiona tu fuerza laboral — {displayPersonnel.length} trabajadores {
              status === 'active' ? 'activos' : 
              status === 'inactive' ? 'de baja' : 
              status === 'dismissal_pending' ? 'en proceso de baja pendiente' :
              status === 'missing_docs' ? 'con documentación requerida incompleta' :
              'registrados'
            }
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
            personnel={displayPersonnel as any} 
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

