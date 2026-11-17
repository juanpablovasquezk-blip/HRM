import { listAreas, listShifts, listTemplates } from '@/app/(dashboard)/shifts/actions';
import { CalculadoraClient } from './calculadora-client';

export const dynamic = 'force-dynamic';

export default async function CalculadoraDotacionPage() {
  const [{ data: templates }, { data: areas }, { data: shifts }] = await Promise.all([
    listTemplates(),
    listAreas(),
    listShifts(),
  ]);

  return (
    <CalculadoraClient
      templates={templates || []}
      areas={areas || []}
      shifts={shifts || []}
    />
  );
}
