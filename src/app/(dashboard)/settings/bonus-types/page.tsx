import { getBonusTypes } from './actions';
import { BonusTypesClient } from './bonus-types-client';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function SettingsBonusTypesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Verificar que sea ADMIN o HR
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = userData?.role;
  if (role !== 'ADMIN' && role !== 'HR') {
    return (
      <div className="p-8 text-center text-slate-500">
        <h2 className="text-xl font-bold text-slate-800">Acceso Restringido</h2>
        <p className="mt-2 text-sm">Solo los administradores tienen acceso a la configuración de bonos.</p>
      </div>
    );
  }

  const { data: types, error } = await getBonusTypes();

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-200">
        Error cargando tipos de bonos: {error}
      </div>
    );
  }

  return <BonusTypesClient initialTypes={types || []} />;
}
