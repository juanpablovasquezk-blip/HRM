import { createClient } from '@/lib/supabase/server';
import TransportReportClient from './transport-report-client';

export default async function TransportReportPage() {
  const supabase = await createClient();
  
  // Fetch companies for filtering
  const { data: companies } = await supabase.from('companies').select('*').order('name');

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 uppercase">
          Reportes de Transporte
        </h1>
        <p className="text-slate-500">Histórico de servicios y movilización de personal</p>
      </div>

      <TransportReportClient companies={companies || []} />
    </div>
  );
}
