import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import HistoricalRecordsClient from './historical-records-client';
import { getFormMetadata, getHistoricalData } from './actions';

export default async function HistoricalRecordsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  // Double check user role
  const role = user?.user_metadata?.role;
  if (role !== 'ADMIN') {
    redirect('/dashboard');
  }

  // Fetch initial form data
  const metaRes = await getFormMetadata();
  const historyRes = await getHistoricalData();

  if (metaRes.error) {
    throw new Error(`Error loading form metadata: ${metaRes.error}`);
  }
  if (historyRes.error) {
    throw new Error(`Error loading historical data: ${historyRes.error}`);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white uppercase tracking-tight">
          Ingreso Histórico
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          Registrar turnos extras y transportes propios históricos realizados antes del uso de la aplicación
        </p>
      </div>

      <HistoricalRecordsClient 
        metadata={metaRes.data!} 
        initialHistory={historyRes.data!} 
      />
    </div>
  );
}
