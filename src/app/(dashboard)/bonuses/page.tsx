import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { getBonusRecords } from './actions';
import { getBonusTypes } from '../settings/bonus-types/actions';
import { BonusesClient } from './bonuses-client';

export const dynamic = 'force-dynamic';

export default async function BonusesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Verificar rol de usuario
  const { data: userData } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .single();

  const role = userData?.role;
  if (role !== 'ADMIN' && role !== 'HR') {
    return (
      <div className="p-8 text-center text-slate-500">
        <h2 className="text-xl font-bold text-slate-800">Acceso Restringido</h2>
        <p className="mt-2 text-sm">Solo los administradores tienen acceso a la gestión de bonos.</p>
      </div>
    );
  }

  const admin = createAdminClient();

  // 1. Obtener registros de bonos activos por defecto
  const [bonusesRes, typesRes, companiesRes, personnelRes] = await Promise.all([
    getBonusRecords({ status: 'active' }),
    getBonusTypes(true),
    admin.from('companies').select('*').order('name'),
    admin.from('personnel').select('id, first_name, last_name_father, last_name_mother, rut, company_id').eq('is_active', true).order('first_name'),
  ]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <BonusesClient
        initialRecords={bonusesRes.data || []}
        bonusTypes={typesRes.data || []}
        companies={companiesRes.data || []}
        personnelList={personnelRes.data || []}
      />
    </div>
  );
}
