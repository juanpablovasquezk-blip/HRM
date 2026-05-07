import React from 'react';
import { getMonthlyPlanning, getSupervisorSession } from '../../actions';
import { redirect } from 'next/navigation';
import SupervisorRosterGrid from './supervisor-roster-grid';
import { Monitor, Smartphone, Calendar } from 'lucide-react';

export default async function RosterPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const session = await getSupervisorSession();
  if (!session) redirect('/supervisor/login');

  const { month } = await searchParams;
  const data = await getMonthlyPlanning(month);
  
  if (!data) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* DESKTOP VIEW: FULL GRID */}
      <div className="hidden md:block p-8">
        <SupervisorRosterGrid 
          personnel={data.personnel}
          assignments={data.assignments}
          shifts={data.shifts}
          areas={data.areas}
          month={data.month}
        />
      </div>

      {/* MOBILE VIEW: REDIRECT MESSAGE OR ALTERNATIVE */}
      <div className="md:hidden flex flex-col items-center justify-center min-h-[80vh] p-8 text-center space-y-6">
        <div className="relative">
          <div className="h-24 w-24 bg-white rounded-full flex items-center justify-center shadow-xl">
            <Smartphone className="h-10 w-10 text-slate-200" />
          </div>
          <div className="absolute -bottom-2 -right-2 h-10 w-10 bg-orange-500 rounded-full flex items-center justify-center text-white border-4 border-slate-50 shadow-lg">
            <Monitor className="h-5 w-5" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Vista de Escritorio</h2>
          <p className="text-sm text-slate-400 font-bold max-w-[280px] mx-auto leading-relaxed">
            La grilla mensual completa solo está disponible en computadores para una mejor visualización.
          </p>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm w-full max-w-[320px] space-y-4">
          <div className="flex items-center gap-3 text-left">
            <div className="h-10 w-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alternativa</p>
              <p className="text-xs font-black text-slate-900 uppercase">Usa la pestaña Asistencia</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 font-bold text-left italic">
            Ahí podrás ver la programación del día a día de forma amigable para tu celular.
          </p>
        </div>
      </div>
    </div>
  );
}
