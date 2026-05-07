'use client';

import React, { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar, 
  Search,
  Filter,
  User,
  Briefcase,
  Clock,
  LayoutGrid,
  ChevronRight,
  CalendarDays
} from 'lucide-react';
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';

export default function SupervisorRosterClient({ initialAssignments }: { initialAssignments: any[] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedArea, setSelectedArea] = useState<string | null>(null);

  // Get unique areas for filter
  const areas = useMemo(() => {
    const unique = new Set(initialAssignments.map((a: any) => a.area?.name).filter(Boolean));
    return Array.from(unique).sort() as string[];
  }, [initialAssignments]);

  // Hierarchical Grouping: Area -> Shift -> Position
  const groupedData = useMemo(() => {
    let filtered = initialAssignments.filter((asg: any) => {
      const fullName = `${asg.personnel?.first_name} ${asg.personnel?.last_name_father} ${asg.personnel?.last_name_mother || ''}`.toLowerCase();
      const matchesSearch = fullName.includes(searchTerm.toLowerCase());
      const matchesArea = !selectedArea || asg.area?.name === selectedArea;
      return matchesSearch && matchesArea;
    });

    // Sort by name
    filtered.sort((a: any, b: any) => {
      const nameA = `${a.personnel?.first_name} ${a.personnel?.last_name_father}`.toLowerCase();
      const nameB = `${b.personnel?.first_name} ${b.personnel?.last_name_father}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });

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
        const sortedPositions = Array.from(new Set(shiftAssignments.map((a: any) => (a.position?.name as string) || 'SIN CARGO'))).sort() as string[];
        
        sortedPositions.forEach((posName: string) => {
          groups[areaName][shiftName][posName] = shiftAssignments.filter((a: any) => (a.position?.name || 'SIN CARGO') === posName);
        });
      });
    });

    return groups;
  }, [initialAssignments, searchTerm, selectedArea]);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
        <div className="p-4 space-y-4 max-w-lg mx-auto">
          {/* Top Bar */}
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Calendar className="h-6 w-6 text-orange-600" />
              Consulta Roster
            </h1>
            <Badge variant="outline" className="border-orange-200 text-orange-700 text-[10px] font-black rounded-lg bg-orange-50">
              PROGRAMACIÓN CERRADA
            </Badge>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Buscar personal..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border-none text-sm font-medium focus:ring-2 focus:ring-orange-600 outline-none"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => setSelectedArea(null)}
              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all
                ${!selectedArea ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-100'}
              `}
            >
              Todos
            </button>
            {areas.map((area) => (
              <button
                key={area}
                onClick={() => setSelectedArea(area)}
                className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all
                  ${selectedArea === area ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-100'}
                `}
              >
                {area}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Roster List */}
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
              <div key={shiftName} className="space-y-4 bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-slate-900 rounded-xl flex items-center justify-center text-white">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Horario</p>
                      <p className="text-sm font-black text-slate-900 leading-none">{shiftName}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-slate-200 text-slate-400 text-[10px] font-bold rounded-lg">
                    {Object.values(positions).flat().length} PERSONAS
                  </Badge>
                </div>

                <div className="h-px bg-slate-50 w-full"></div>

                {Object.entries(positions).map(([posName, assignments]) => (
                  <div key={posName} className="space-y-2">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 px-1">
                      <Briefcase className="h-3 w-3 text-slate-300" />
                      {posName}
                    </p>
                    <div className="grid grid-cols-1 gap-1">
                      {assignments.map((asg: any) => (
                        <div key={asg.id} className="flex items-center gap-3 py-1.5 px-2 hover:bg-slate-50 rounded-lg transition-colors group">
                          <div className="h-1.5 w-1.5 rounded-full bg-orange-400"></div>
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-tight group-hover:text-slate-900">
                            {asg.personnel?.first_name} {asg.personnel?.last_name_father}
                          </span>
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
              <CalendarDays className="h-8 w-8 text-slate-200" />
            </div>
            <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest px-8">No hay programación oficial disponible</p>
          </div>
        )}
      </div>
    </div>
  );
}
