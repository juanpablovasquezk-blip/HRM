import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import HistoricalRecordsClient from './historical-records-client';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { getFormMetadata, getHistoricalData } from './actions';
import { getUserRole } from '@/app/role-actions';

export default async function HistoricalRecordsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  // Double check user role using the robust getUserRole helper
  const role = await getUserRole();
  const isMarcela = user?.email?.toUpperCase().includes('MARCELA');
  
  if (role !== 'ADMIN' && role !== 'HR' && !isMarcela) {
    redirect('/dashboard');
  }

  // Fetch initial form data for the current month by default
  const now = new Date();
  const startStr = format(startOfMonth(now), 'yyyy-MM-dd');
  const endStr = format(endOfMonth(now), 'yyyy-MM-dd');

  const metaRes = await getFormMetadata();
  const historyRes = await getHistoricalData(startStr, endStr);

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
