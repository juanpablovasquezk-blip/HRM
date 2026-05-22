import { format } from 'date-fns';
import { getTransportRequests } from './actions';
import TransportClient from './transport-client';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function TransportPage(props: {
  searchParams: Promise<{ date?: string }>;
}) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const date = searchParams.date || format(new Date(), 'yyyy-MM-dd');

  const { data: requests, error } = await getTransportRequests(date);
  
  // Fetch companies for filtering (if needed)
  const { data: companies } = await supabase.from('companies').select('*').order('name');

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 uppercase">
          Gestión de Transporte
        </h1>
        <p className="text-slate-500">Planificación logística y coordinación de móviles</p>
      </div>

      {error ? (
        <div className="p-12 text-center bg-red-50 text-red-600 rounded-xl border border-red-100">
           {error}
        </div>
      ) : (
        <TransportClient 
          initialRequests={requests || []} 
          selectedDate={date}
          companies={companies || []}
        />
      )}
    </div>
  );
}
