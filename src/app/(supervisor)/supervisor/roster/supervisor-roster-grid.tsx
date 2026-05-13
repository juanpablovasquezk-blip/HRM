'use client';

import React, { useMemo } from 'react';
import { 
  format, 
  eachDayOfInterval, 
  startOfMonth, 
  endOfMonth, 
  isSunday, 
  isSameDay,
  isToday,
  parseISO
} from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Clock, User as UserIcon } from 'lucide-react';

interface Props {
  personnel: any[];
  assignments: any[];
  shifts: any[];
  areas: any[];
  positions: any[];
  month: string;
}

export default function SupervisorRosterGrid({ 
  personnel, 
  assignments, 
  shifts, 
  areas, 
  positions,
  month 
}: Props) {
  const monthDate = parseISO(month + '-01T12:00:00Z');
  const days = useMemo(() => eachDayOfInterval({
    start: startOfMonth(monthDate),
    end: endOfMonth(monthDate),
  }), [monthDate]);

  // Group assignments by personnel and date for fast lookup
  const assignmentMap = useMemo(() => {
    const map: Record<string, Record<string, any>> = {};
    assignments.forEach(a => {
      if (!map[a.personnel_id]) map[a.personnel_id] = {};
      map[a.personnel_id][a.date] = a;
    });
    return map;
  }, [assignments]);

  const positionMap = useMemo(() => {
    return Object.fromEntries((positions || []).map(p => [p.id, p.name]));
  }, [positions]);

  // Sort personnel by area/position
  const sortedPersonnel = useMemo(() => {
    return [...personnel].sort((a, b) => {
      return (a.first_name || '').localeCompare(b.first_name || '');
    });
  }, [personnel]);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden flex flex-col h-[calc(100vh-180px)]">
      {/* Header Info */}
      <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-slate-200">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">
              {format(monthDate, 'MMMM yyyy', { locale: es })}
            </h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Programación Mensual Sincronizada</p>
          </div>
        </div>
      </div>

      {/* Grid Container */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse table-fixed min-w-[1200px]">
          <thead className="sticky top-0 z-30">
            <tr className="bg-white border-b border-slate-200">
              <th className="sticky left-0 z-40 bg-white w-[250px] p-4 text-left border-r border-slate-100">
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <UserIcon className="h-3 w-3" />
                  Trabajador
                </div>
              </th>
              {days.map(day => (
                <th 
                  key={day.toISOString()} 
                  className={`p-2 text-center w-[45px] border-r border-slate-50
                    ${isSunday(day) ? 'bg-red-50/50' : isToday(day) ? 'bg-orange-50/50' : ''}
                  `}
                >
                  <p className="text-[9px] font-black text-slate-400 uppercase leading-none mb-1">
                    {format(day, 'eee', { locale: es }).substring(0, 3)}
                  </p>
                  <p className={`text-sm font-black leading-none
                    ${isSunday(day) ? 'text-red-500' : isToday(day) ? 'text-orange-500' : 'text-slate-900'}
                  `}>
                    {format(day, 'd')}
                  </p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedPersonnel.map(person => (
              <tr key={person.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                <td className="sticky left-0 z-20 bg-white p-4 border-r border-slate-100 group-hover:bg-slate-50">
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-tight truncate">
                    {person.first_name} {person.last_name_father}
                  </p>
                  <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest truncate">
                    {positionMap[person.main_position] || person.main_position || 'Sin Cargo'}
                  </p>
                </td>
                {days.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const asg = assignmentMap[person.id]?.[dateStr];
                  
                  return (
                    <td 
                      key={dateStr}
                      className={`p-1.5 text-center border-r border-slate-50 align-middle
                        ${isSunday(day) ? 'bg-red-50/20' : isToday(day) ? 'bg-orange-50/20' : ''}
                      `}
                    >
                      {asg ? (
                        <div className="flex flex-col items-center justify-center min-h-[36px] bg-indigo-50 rounded-lg border border-indigo-100/50 p-1">
                          <span className="text-[8px] font-black text-indigo-700 leading-tight uppercase">
                            {asg.shift?.name?.split(' ')[0] || 'T'}
                          </span>
                          <span className="text-[7px] font-bold text-indigo-400 leading-tight">
                            {asg.shift?.start_time?.substring(0,5)}
                          </span>
                        </div>
                      ) : (
                        <div className="min-h-[36px] flex items-center justify-center opacity-20">
                          <div className="h-0.5 w-2 bg-slate-300 rounded-full"></div>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer / Legend */}
      <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 bg-indigo-100 border border-indigo-200 rounded"></div>
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Turno Asignado</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 bg-red-50 border border-red-100 rounded"></div>
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Domingo</span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Badge variant="outline" className="text-[10px] font-black border-slate-200 text-slate-400 bg-white">
            {personnel.length} TRABAJADORES
          </Badge>
        </div>
      </div>
    </div>
  );
}
