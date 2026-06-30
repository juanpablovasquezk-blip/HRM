import { createClient } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Star, Calendar as CalendarIcon, Download, ChevronRight } from 'lucide-react';
import ExtraReportFilters from './extra-report-filters';

interface Props {
  searchParams: Promise<{
    from?: string;
    to?: string;
    company_id?: string;
  }>;
}

export default async function ExtraShiftsReportPage(props: Props) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  
  const from = searchParams.from || format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const to = searchParams.to || format(endOfMonth(new Date()), 'yyyy-MM-dd');
  const companyId = searchParams.company_id;

  // Fetch Companies for the filter
  const { data: companies } = await supabase.from('companies').select('id, name').order('name');

  let query = supabase
    .from('shift_assignments')
    .select(`
      id,
      date,
      status,
      is_extra,
      personnel:personnel_id (
        first_name, 
        last_name_father, 
        company_id,
        company:companies!personnel_company_id_fkey(name)
      ),
      area:area_id (name),
      position:position_id (name),
      shift:shift_id (name, start_time, end_time)
    `)
    .eq('is_extra', true)
    .neq('status', 'cancelled')
    .or('attendance_status.is.null,attendance_status.neq.absent')
    .gte('date', from)
    .lte('date', to);

  if (companyId) {
    query = query.eq('personnel.company_id', companyId);
  }

  const { data: assignments, error } = await query.order('date', { ascending: true });

  if (error) {
    return <div>Error loading report: {error.message}</div>;
  }

  // Group by Personnel
  const groupedByPersonnel: Record<string, any> = {};
  assignments?.forEach(a => {
    const p = a.personnel as any;
    const name = `${p.first_name} ${p.last_name_father}`;
    if (!groupedByPersonnel[name]) {
      groupedByPersonnel[name] = {
        name,
        total: 0,
        shifts: []
      };
    }
    groupedByPersonnel[name].total += 1;
    groupedByPersonnel[name].shifts.push(a);
  });

  const personnelList = Object.values(groupedByPersonnel).sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Star className="w-6 h-6 text-orange-500 fill-orange-500" />
            Reporte de Turnos Extras
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Resumen consolidado de personal en turnos adicionales
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <ExtraReportFilters 
            from={from} 
            to={to} 
            companies={companies || []} 
            companyId={companyId} 
            assignments={assignments || []} 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {personnelList.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="py-12 text-center text-slate-500">
              No se encontraron turnos extras en el rango seleccionado.
            </CardContent>
          </Card>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500">
                  <th className="px-4 py-2 text-left w-[200px]">Colaborador</th>
                  <th className="px-4 py-2 text-left">Detalle de Turnos Extras</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {personnelList.map((person: any) => (
                  <tr key={person.name} className="align-top hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 border-r border-slate-100">
                      <div className="flex flex-col">
                        <span className="text-[13px] font-black text-slate-900 uppercase leading-tight">{person.name}</span>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-bold">{person.total} Extras</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-0">
                      <div className="divide-y divide-slate-100">
                        {person.shifts.map((s: any) => (
                          <div key={s.id} className="grid grid-cols-[140px_1fr_150px] gap-4 px-4 py-1.5 text-[11px] items-center">
                            <div className="flex items-center gap-2 font-medium text-slate-600">
                              <span className="capitalize">{format(parseISO(s.date), "EEE dd/MM", { locale: es })}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-700">{s.area?.name}</span>
                              <span className="text-slate-400">/</span>
                              <span className="text-slate-500">{s.position?.name}</span>
                            </div>
                            <div className="text-right font-mono text-[10px] text-slate-400">
                              {s.shift?.start_time.substring(0,5)} - {s.shift?.end_time.substring(0,5)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
