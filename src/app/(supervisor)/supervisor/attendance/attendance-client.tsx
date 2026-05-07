'use client';

import React, { useState, useTransition, useMemo } from 'react';
import { updateAttendance, updateAssignmentShift } from '../../actions';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, 
  XCircle, 
  User, 
  CalendarDays,
  Search,
  ChevronRight,
  Filter,
  Users,
  CheckSquare,
  Briefcase,
  Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { format, addDays, subDays } from 'date-fns';
import { useRouter } from 'next/navigation';
import { es } from 'date-fns/locale';

export default function AttendanceClient({ initialData }: { initialData: any }) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [isPending, startTransition] = useTransition();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedArea, setSelectedArea] = useState<string | null>(null);

  const isFutureDate = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(data.date + 'T12:00:00');
    target.setHours(0, 0, 0, 0);
    return target > today;
  }, [data.date]);

  // Get unique areas for filter
  const areas = useMemo(() => {
    const unique = new Set(data.assignments.map((a: any) => a.area?.name).filter(Boolean));
    return Array.from(unique).sort() as string[];
  }, [data.assignments]);

  // Statistics
  const stats = useMemo(() => {
    const total = data.assignments.length;
    if (isFutureDate) {
      return { total, presentCount: 0, absentCount: 0, percent: 0 };
    }
    // Now 'completed' is basically marking absences, because everyone else is present by default
    const absentCount = data.assignments.filter((a: any) => a.attendance_status === 'absent').length;
    const presentCount = total - absentCount;
    return { total, presentCount, absentCount, percent: 100 };
  }, [data.assignments, isFutureDate]);

  // Grouped and Filtered data: Area -> Shift -> Position
  const groupedData = useMemo(() => {
    let filtered = data.assignments.filter((asg: any) => {
      const fullName = `${asg.personnel?.first_name} ${asg.personnel?.last_name_father} ${asg.personnel?.last_name_mother || ''}`.toLowerCase();
      const matchesSearch = fullName.includes(searchTerm.toLowerCase());
      const matchesArea = !selectedArea || asg.area?.name === selectedArea;
      return matchesSearch && matchesArea;
    });

    // 1. Sort filtered data by name first
    filtered.sort((a: any, b: any) => {
      const nameA = `${a.personnel?.first_name} ${a.personnel?.last_name_father}`.toLowerCase();
      const nameB = `${b.personnel?.first_name} ${b.personnel?.last_name_father}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });

    // 2. Hierarchical Grouping
    const groups: Record<string, Record<string, Record<string, any[]>>> = {};
    
    const sortedAreas = Array.from(new Set(filtered.map((a: any) => (a.area?.name as string) || 'SIN ÁREA'))).sort() as string[];

    sortedAreas.forEach((areaName: string) => {
      groups[areaName] = {};
      const areaAssignments = filtered.filter((a: any) => (a.area?.name || 'SIN ÁREA') === areaName);
      
      const uniqueShifts = Array.from(new Set(areaAssignments.map((a: any) => (a.shift?.name as string) || 'SIN TURNO')));
      const sortedShifts = (uniqueShifts as string[]).sort((a: string, b: string) => {
        const shiftA = areaAssignments.find((asg: any) => (asg.shift?.name || 'SIN TURNO') === a)?.shift;
        const shiftB = areaAssignments.find((asg: any) => (asg.shift?.name || 'SIN TURNO') === b)?.shift;
        return (shiftA?.start_time || '').localeCompare(shiftB?.start_time || '');
      });

      sortedShifts.forEach((shiftName: string) => {
        groups[areaName][shiftName] = {};
        const shiftAssignments = areaAssignments.filter((a: any) => (a.shift?.name || 'SIN TURNO') === shiftName);
        
        // Group by Position
        const sortedPositions = Array.from(new Set(shiftAssignments.map((a: any) => (a.position?.name as string) || 'SIN CARGO'))).sort() as string[];
        
        sortedPositions.forEach((posName: string) => {
          groups[areaName][shiftName][posName] = shiftAssignments.filter((a: any) => (a.position?.name || 'SIN CARGO') === posName);
        });
      });
    });

    return groups;
  }, [data.assignments, searchTerm, selectedArea]);

  const handleStatusChange = (id: string, status: 'present' | 'absent') => {
    startTransition(async () => {
      const res = await updateAttendance(id, status);
      if (res.success) {
        toast.success(`${status === 'present' ? 'Presente' : 'Ausente'}`);
        setData((prev: any) => ({
          ...prev,
          assignments: prev.assignments.map((a: any) => 
            a.id === id ? { ...a, attendance_status: status, attendance_updated_by: 'Tú' } : a
          )
        }));
      } else {
        toast.error("Error al actualizar");
      }
    });
  };

  const handleDateChange = (newDate: string) => {
    router.push(`/supervisor/attendance?date=${newDate}`);
  };

  const handleShiftChange = (assignmentId: string, newShiftId: string) => {
    startTransition(async () => {
      const res = await updateAssignmentShift(assignmentId, newShiftId);
      if (res.success) {
        toast.success("Horario actualizado");
        setData((prev: any) => ({
          ...prev,
          assignments: prev.assignments.map((a: any) => 
            a.id === assignmentId ? { ...a, shift: initialData.shifts.find((s: any) => s.id === newShiftId) } : a
          )
        }));
      } else {
        toast.error("Error al cambiar horario");
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
        <div className="p-4 space-y-4 max-w-lg mx-auto">
          {/* Top Bar */}
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Asistencia</h1>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => handleDateChange(format(subDays(new Date(data.date + 'T12:00:00'), 1), 'yyyy-MM-dd'))}
                className="h-8 w-8 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400"
              >
                <ChevronRight className="h-4 w-4 rotate-180" />
              </button>
              <div className="flex items-center gap-2 text-slate-900 text-[10px] font-black uppercase tracking-widest bg-orange-100 px-3 py-1.5 rounded-full">
                <CalendarDays className="h-3 w-3 text-orange-600" />
                {format(new Date(data.date + 'T12:00:00'), "eee d 'Mayo'", { locale: es })}
              </div>
              <button 
                onClick={() => handleDateChange(format(addDays(new Date(data.date + 'T12:00:00'), 1), 'yyyy-MM-dd'))}
                className="h-8 w-8 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Progress Bar (Always full now, showing exceptions) */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-end">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resumen de Asistencia</p>
              <div className="flex gap-3">
                {isFutureDate ? (
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Programación Futura</p>
                ) : (
                  <>
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{stats.presentCount} Presentes</p>
                    <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">{stats.absentCount} Ausentes</p>
                  </>
                )}
              </div>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full transition-all duration-500 ${isFutureDate ? 'bg-slate-300 w-0' : 'bg-emerald-500 w-full'}`} />
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Buscar por nombre o apellido..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border-none text-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none"
            />
          </div>

          {/* Area Filters - Improved Wrap Layout */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => setSelectedArea(null)}
              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all
                ${!selectedArea ? 'bg-slate-900 text-white shadow-lg shadow-slate-200' : 'bg-white text-slate-400 border border-slate-100'}
              `}
            >
              Todos
            </button>
            {areas.map((area) => (
              <button
                key={area}
                onClick={() => setSelectedArea(area)}
                className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all
                  ${selectedArea === area ? 'bg-slate-900 text-white shadow-lg shadow-slate-200' : 'bg-white text-slate-400 border border-slate-100'}
                `}
              >
                {area}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Hierarchical Grouped List */}
      <div className="p-4 space-y-10 max-w-lg mx-auto">
        {Object.entries(groupedData).map(([areaName, shifts]) => (
          <div key={areaName} className="space-y-6">
            {/* Area Title */}
            <div className="flex items-center justify-between gap-4">
              <div className="h-px bg-slate-200 flex-1"></div>
              <h2 className="text-[12px] font-black text-slate-900 uppercase tracking-[0.25em]">{areaName}</h2>
              <div className="h-px bg-slate-200 flex-1"></div>
            </div>

            {Object.entries(shifts).map(([shiftName, positions]) => (
              <div key={shiftName} className="space-y-4 bg-white/50 p-4 rounded-[2rem] border border-slate-100/50">
                {/* Shift Subtitle */}
                <div className="flex items-center gap-2 px-1">
                  <Badge className="bg-slate-900 text-white text-[9px] font-black rounded-lg px-2">
                    {shiftName}
                  </Badge>
                  <div className="h-px bg-slate-100 flex-1"></div>
                </div>

                {Object.entries(positions).map(([posName, assignments]) => (
                  <div key={posName} className="space-y-2">
                    {/* Position Label */}
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 px-2">
                      <Briefcase className="h-3 w-3 text-slate-300" />
                      {posName}
                      <span className="ml-auto text-[8px] opacity-50">({assignments.length})</span>
                    </p>

                    {/* Person Item */}
                    <div className="space-y-1">
                      {assignments.map((asg: any) => (
                        <div 
                          key={asg.id} 
                          className={`flex items-center justify-between p-3 rounded-2xl transition-all duration-300 border
                            ${isFutureDate ? 'bg-white border-slate-100 opacity-80' : 
                               asg.attendance_status === 'absent' ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'}
                          `}
                        >
                          <div className="flex-1 min-w-0 pr-4">
                            <p className={`text-xs font-black uppercase tracking-tight truncate
                              ${isFutureDate ? 'text-slate-400' : 
                                asg.attendance_status === 'absent' ? 'text-red-700' : 'text-emerald-700'}
                            `}>
                              {asg.personnel?.first_name} {asg.personnel?.last_name_father}
                            </p>
                            
                            {/* Shift Selector for Warehouse Personnel */}
                            <div className="mt-1 flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
                              <Clock className="h-2.5 w-2.5 text-slate-400" />
                              <select 
                                value={asg.shift?.id}
                                onChange={(e) => handleShiftChange(asg.id, e.target.value)}
                                disabled={isPending}
                                className="bg-transparent text-[9px] font-black uppercase tracking-widest text-slate-500 border-none p-0 outline-none focus:ring-0 appearance-none cursor-pointer hover:text-slate-900"
                              >
                                {initialData.shifts?.map((s: any) => (
                                  <option key={s.id} value={s.id} className="text-xs font-sans normal-case">
                                    {s.name} ({s.start_time?.substring(0,5)})
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Compact Buttons */}
                          <div className={`flex gap-1 ${isFutureDate ? 'grayscale opacity-30 pointer-events-none' : ''}`}>
                            <button
                              onClick={() => handleStatusChange(asg.id, 'present')}
                              disabled={isPending || isFutureDate || (!asg.attendance_status || asg.attendance_status === 'present')}
                              className={`h-9 w-12 rounded-xl flex items-center justify-center transition-all
                                ${(!asg.attendance_status || asg.attendance_status === 'present') ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' : 'bg-slate-100 text-slate-300 hover:bg-emerald-100 hover:text-emerald-500'}
                              `}
                            >
                              <CheckCircle2 className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handleStatusChange(asg.id, 'absent')}
                              disabled={isPending || isFutureDate || asg.attendance_status === 'absent'}
                              className={`h-9 w-12 rounded-xl flex items-center justify-center transition-all
                                ${asg.attendance_status === 'absent' ? 'bg-red-500 text-white shadow-lg shadow-red-200' : 'bg-slate-100 text-slate-300 hover:bg-red-100 hover:text-red-500'}
                              `}
                            >
                              <XCircle className="h-5 w-5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}

        {Object.keys(groupedData).length === 0 && (
          <div className="text-center py-20 space-y-4">
            <div className="h-20 w-20 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm">
              <Search className="h-8 w-8 text-slate-200" />
            </div>
            <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest px-8">No hay programación sincronizada para este día o filtro</p>
          </div>
        )}
      </div>
    </div>
  );
}
