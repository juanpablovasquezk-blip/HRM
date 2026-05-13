'use client';

import React from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, AlertTriangle, Cake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface RosterClientProps {
  data: any;
  selectedMonth: string;
}

export default function RosterClient({ data, selectedMonth }: RosterClientProps) {
  const router = useRouter();
  const currentMonthDate = parseISO(selectedMonth + '-01');
  
  const days = eachDayOfInterval({
    start: startOfMonth(currentMonthDate),
    end: endOfMonth(currentMonthDate),
  });

  const handlePrevMonth = () => {
    const d = new Date(currentMonthDate);
    d.setMonth(d.getMonth() - 1);
    router.push(`/worker/roster?month=${format(d, 'yyyy-MM')}`);
  };

  const handleNextMonth = () => {
    const d = new Date(currentMonthDate);
    d.setMonth(d.getMonth() + 1);
    router.push(`/worker/roster?month=${format(d, 'yyyy-MM')}`);
  };

  const getDayAssignment = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    if (!data?.assignments) return null;
    return data.assignments.find((a: any) => a.date === dateStr);
  };

  const getBaseShift = (day: Date) => {
    if (!data.rosterBase) return null;
    const dayNum = day.getDate();
    return data.rosterBase[`d${dayNum}`];
  };

  const getDayLeave = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    if (!data?.leaves) return null;
    return data.leaves.find((l: any) => l.start_date === dateStr);
  };

  return (
    <div className="p-4 space-y-6 max-w-lg mx-auto pb-24">
      {/* Calendar Header */}
      <div className="flex items-center justify-between bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
        <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="rounded-xl">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="font-black text-lg uppercase tracking-tight text-slate-900">
          {format(currentMonthDate, 'MMMM yyyy', { locale: es })}
        </h2>
        <Button variant="ghost" size="icon" onClick={handleNextMonth} className="rounded-xl">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Detailed Weekly List */}
      <div className="space-y-6">
        {/* Helper to group by week */}
        {(() => {
          const weeks: Date[][] = [];
          let currentWeek: Date[] = [];
          
          days.forEach((day, i) => {
            currentWeek.push(day);
            // If it's Sunday (0) or the last day of the month
            if (day.getDay() === 0 || i === days.length - 1) {
              // Pad the beginning of the first week if necessary
              if (weeks.length === 0 && currentWeek.length < 7) {
                 // This logic is simplified for the list view
              }
              weeks.push(currentWeek);
              currentWeek = [];
            }
          });

          return weeks.map((week, weekIdx) => (
            <div key={weekIdx} className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="p-3 text-[10px] font-black uppercase tracking-widest text-center border-r border-slate-800">Día</th>
                      <th className="p-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-800">Fecha</th>
                      <th className="p-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-800">Turno</th>
                      <th className="p-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-800">Asignación</th>
                      <th className="p-3 text-[10px] font-black uppercase tracking-widest text-center">Horas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {week.map(day => {
                        const assignment = getDayAssignment(day);
                        const baseShift = getBaseShift(day);
                        const leave = getDayLeave(day);
                        const isFreeRequest = leave && (leave.type === 'free_request' || leave.reason === 'Solicitud mensual de días libres');
                        
                        const isBirthday = data.personnel?.birth_date && 
                          format(day, 'MM-dd') === format(parseISO(data.personnel.birth_date), 'MM-dd');
                        
                        const actualShiftName = assignment?.shift?.name || 'L';
                        const isDifferent = baseShift && actualShiftName !== baseShift && actualShiftName !== 'L';
                        const isToday = isSameDay(day, new Date());

                        return (
                          <tr key={day.toString()} className={`
                            ${isToday ? 'bg-orange-50/40' : ''} 
                            ${isFreeRequest ? 'bg-emerald-50/60 border-l-4 border-l-emerald-500' : 
                              isDifferent ? 'bg-orange-50/20 border-l-4 border-l-orange-500' : 'border-l-4 border-l-transparent'}
                            transition-all duration-300
                          `}>
                          <td className="p-3 text-center border-r border-slate-50">
                            <span className={`text-[10px] font-black uppercase ${isToday ? 'text-orange-600' : 'text-slate-400'}`}>
                              {format(day, 'EEE', { locale: es })}
                            </span>
                          </td>
                          <td className="p-3 border-r border-slate-50">
                            <span className={`text-[11px] font-bold ${isToday ? 'text-orange-700' : 'text-slate-700'}`}>
                              {format(day, 'dd-MM-yyyy')}
                            </span>
                          </td>
                          <td className="p-3 border-r border-slate-50">
                             <div className="flex items-center gap-1.5">
                                <Badge className={`
                                  ${isFreeRequest ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-100' : 
                                    isBirthday && actualShiftName === 'L' ? 'bg-pink-500 text-white shadow-sm shadow-pink-100' :
                                    actualShiftName === 'L' ? 'bg-slate-100 text-slate-400' : 
                                    isDifferent ? 'bg-orange-500 text-white ring-2 ring-orange-200 ring-offset-1' : 
                                    'bg-slate-900 text-white'} 
                                  border-none text-[9px] font-black px-1.5 py-0.5 shadow-sm
                                `}>
                                  {isFreeRequest ? 'LIBRE' : isBirthday && actualShiftName === 'L' ? 'CUMPLE' : actualShiftName}
                                </Badge>
                               {isDifferent && <AlertTriangle className="h-3.5 w-3.5 text-orange-600 animate-pulse" />}
                             </div>
                          </td>
                          <td className="p-3 border-r border-slate-50">
                             <span className={cn(
                               "text-[11px] font-bold uppercase",
                               isBirthday && actualShiftName === 'L' ? "text-pink-600" : "text-slate-600"
                             )}>
                               {isBirthday && actualShiftName === 'L' ? 'LIBRE CUMPLEAÑOS' : (assignment?.area?.name || (actualShiftName === 'L' ? 'LIBRE' : '—'))}
                             </span>
                          </td>
                          <td className="p-3 text-center">
                             {assignment?.shift ? (
                               <span className="text-[10px] font-black text-slate-900">
                                 {assignment.shift.start_time.substring(0,5)} - {assignment.shift.end_time.substring(0,5)}
                               </span>
                             ) : (
                               <span className="text-[10px] text-slate-300">—</span>
                             )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ));
        })()}
      </div>

      {/* Legend */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 space-y-4 shadow-sm">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-50 pb-2">Leyenda</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-lg bg-slate-900 flex items-center justify-center text-[10px] font-black text-white">AM</div>
            <span className="text-xs font-bold text-slate-600">Turno Normal</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-lg bg-orange-500 flex items-center justify-center text-[10px] font-black text-white">PM</div>
            <span className="text-xs font-bold text-slate-600 text-orange-600 italic">Cambio de Turno</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-lg bg-emerald-500 flex items-center justify-center text-[8px] font-black text-white">LIBRE</div>
            <span className="text-xs font-bold text-slate-600">Día Solicitado</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-lg bg-slate-50 flex items-center justify-center text-[10px] font-black text-slate-300">L</div>
            <span className="text-xs font-bold text-slate-600">Día Libre Roster</span>
          </div>
        </div>
      </div>
    </div>
  );
}
