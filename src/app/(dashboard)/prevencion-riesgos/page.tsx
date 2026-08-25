import { getRiohsDashboardData } from './actions';
import { getUserRole } from '@/app/role-actions';
import { PrevencionRiesgosClient } from './prevencion-riesgos-client';

export const dynamic = 'force-dynamic';

export default async function PrevencionRiesgosPage() {
  const role = await getUserRole();
  const canExecute = role === 'ADMIN' || role === 'HR' || role === 'SAFETY_OFFICER';

  const res = await getRiohsDashboardData();

  if (!res.success || !res.data) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-600">
        <h3 className="font-bold text-base mb-1">Error al cargar el panel de Prevención de Riesgos</h3>
        <p className="text-xs">{res.error || 'No se pudieron recuperar los datos de la base de datos.'}</p>
      </div>
    );
  }

  return (
    <PrevencionRiesgosClient
      initialWorkers={res.data.workers}
      companies={res.data.companies}
      positions={res.data.positions}
      canExecute={canExecute}
    />
  );
}
