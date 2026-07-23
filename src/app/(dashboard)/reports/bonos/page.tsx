import { createClient } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { BonosReportClient } from './bonos-report-client';

export default async function BonosReportPage() {
  const supabase = await createClient();

  // Fetch Companies for the filter
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
    .order('name');

  const from = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const to = format(endOfMonth(new Date()), 'yyyy-MM-dd');

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col gap-1 no-print">
        <h1 className="text-2xl font-bold tracking-tight">Reporte de Liquidación de Bonos</h1>
        <p className="text-muted-foreground text-sm">
          Resumen individual de turnos y transportes nocturnos para liquidación de pago.
        </p>
      </div>

      <BonosReportClient 
        companies={companies || []}
        initialFrom={from}
        initialTo={to}
      />
    </div>
  );
}
