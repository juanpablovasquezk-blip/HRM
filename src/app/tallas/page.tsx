import { getWorkersListForSelfService } from '../(dashboard)/epp/actions';
import TallasClient from './tallas-client';

export const metadata = {
  title: 'Registro de Tallas de Personal | Grupo Minerquim',
  description: 'Formulario oficial de actualización de tallas de uniforme y EPP para trabajadores.',
};

export default async function TallasPage({
  searchParams,
}: {
  searchParams: Promise<{ rut?: string; id?: string; token?: string }>;
}) {
  const params = await searchParams;
  const initialWorkerIdOrRut = params?.rut || params?.id || '';
  const initialToken = params?.token || '';

  const { data: workersList } = await getWorkersListForSelfService();

  return (
    <TallasClient 
      workersList={workersList || []} 
      initialWorkerIdOrRut={initialWorkerIdOrRut} 
      initialToken={initialToken}
    />
  );
}
