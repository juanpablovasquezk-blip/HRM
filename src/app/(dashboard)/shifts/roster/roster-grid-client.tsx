'use client';

import { useState, useMemo, useTransition } from 'react';
import { 
  format, 
  eachDayOfInterval, 
  startOfMonth, 
  endOfMonth, 
  isSunday, 
  isSameDay,
  isToday
} from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  Calendar,
  MoreVertical,
  Plus,
  Trash2,
  Clock,
  User as UserIcon,
  Loader2
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { createManualAssignment, deleteAssignment } from '@/app/(dashboard)/shifts/actions';

interface Position { id: string; name: string; area_id: string; }
interface Area { id: string; name: string; positions: Position[]; }
interface Shift { id: string; name: string; start_time: string; end_time: string; }
interface Leave { id: string; personnel_id: string; start_date: string; end_date: string; type: string; }
interface Assignment { 
  id: string; 
  personnel_id: string; 
  date: string; 
  shift_id: string; 
  area_id: string; 
  position_id: string;
  is_manual: boolean;
}

interface Personnel {
  id: string;
  first_name: string;
  last_name_father: string;
  rotation_pattern: string | null;
  main_position: string;
  secondary_positions: string[];
  hire_date: string | null;
  termination_date: string | null;
  has_special_contract: boolean;
}

interface RosterGridProps {
  personnel: Personnel[];
  shifts: Shift[];
  areas: Area[];
  assignments: Assignment[];
  leaves: Leave[];
  positions: Position[];
  currentMonth: string;
}

export function RosterGridClient({
  personnel,
  shifts,
  areas,
  assignments,
  leaves,
  positions,
  currentMonth
}: RosterGridProps) {
  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [selectedCell, setSelectedCell] = useState<{ person: Personnel, date: Date } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Local state for the dialog selects
  const [dialogPositionId, setDialogPositionId] = useState<string>('');
  const [dialogAreaId, setDialogAreaId] = useState<string>('');

  const monthDate = new Date(currentMonth + 'T00:00:00');
  const days = eachDayOfInterval({
    start: startOfMonth(monthDate),
    end: endOfMonth(monthDate),
  });

  const filteredPersonnel = useMemo(() => {
    const filtered = personnel.filter(p => {
      const nameMatch = `${p.first_name} ${p.last_name_father}`.toLowerCase().includes(search.toLowerCase());
      
      // Filter by position Name instead of ID
      const personPositionName = positions.find(pos => pos.id === p.main_position)?.name || '';
      const posMatch = !positionFilter || personPositionName === positionFilter;
      
      return nameMatch && posMatch;
    });

    // Sort by position name first, then by last name
    return [...filtered].sort((a, b) => {
      const posA = positions.find(p => p.id === a.main_position)?.name || '';
      const posB = positions.find(p => p.id === b.main_position)?.name || '';
      
      if (posA !== posB) {
        return posA.localeCompare(posB);
      }
      return a.last_name_father.localeCompare(b.last_name_father);
    });
  }, [personnel, search, positionFilter, positions]);

  const uniquePositionNames = useMemo(() => {
    const names = positions.map(p => p.name);
    return Array.from(new Set(names)).sort();
  }, [positions]);

  const handleCellClick = (person: Personnel, date: Date) => {
    setSelectedCell({ person, date });
    
    // Pre-select main position and area
    if (person.main_position) {
      setDialogPositionId(person.main_position);
      const pos = positions.find(p => p.id === person.main_position);
      if (pos) setDialogAreaId(pos.area_id);
    } else {
      setDialogPositionId('');
      setDialogAreaId('');
    }
  };

  const handleSaveAssignment = (formData: FormData) => {
    if (!selectedCell) return;
    
    formData.set('personnel_id', selectedCell.person.id);
    formData.set('date', format(selectedCell.date, 'yyyy-MM-dd'));

    startTransition(async () => {
      const res = await createManualAssignment(formData);
      if (res.error) toast.error(res.error);
      else {
        toast.success('Asignación guardada');
        setSelectedCell(null);
      }
    });
  };

  const handleDelete = (assignmentId: string) => {
    startTransition(async () => {
      const res = await deleteAssignment(assignmentId);
      if (res.error) toast.error(res.error);
      else {
        toast.success('Asignación eliminada');
        setSelectedCell(null);
      }
    });
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Buscar por nombre..." 
            className="pl-9 h-9" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-[200px]">
          <select 
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
          >
            <option value="">Todos los cargos</option>
            {uniquePositionNames.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1 border-l pl-3 ml-2 border-slate-200">
           <Button variant="ghost" size="sm" className="h-8">
              <ChevronLeft className="h-4 w-4 mr-1" /> Mes anterior
           </Button>
           <Button variant="ghost" size="sm" className="h-8">
              Mes siguiente <ChevronRight className="h-4 w-4 ml-1" />
           </Button>
        </div>
      </div>

      {/* Roster Grid Wrapper */}
      <div className="flex-1 overflow-hidden border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 shadow-md">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-320px)]">
          <table className="w-full border-collapse table-fixed min-w-[2000px]">
            <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-900 shadow-sm">
              <tr>
                <th className="sticky left-0 z-30 w-[240px] p-3 text-left font-semibold text-slate-600 dark:text-slate-300 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                   Trabajador
                </th>
                {days.map(day => (
                  <th 
                    key={day.toISOString()} 
                    className={cn(
                      "p-2 text-center border-b border-slate-100 dark:border-slate-800",
                      isSunday(day) && "bg-slate-100/50 dark:bg-slate-800/30",
                      isToday(day) && "bg-orange-50 dark:bg-orange-900/40 ring-2 ring-inset ring-orange-500/20"
                    )}
                  >
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] uppercase font-bold text-slate-400">
                        {format(day, 'eee', { locale: es })}
                      </span>
                      <span className={cn(
                        "text-sm font-bold",
                        isSunday(day) ? "text-red-500" : "text-slate-700 dark:text-slate-200"
                      )}>
                        {format(day, 'd')}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredPersonnel.map(person => (
                <tr key={person.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors">
                  <td className="sticky left-0 z-10 w-[240px] p-3 border-b border-r border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400">
                         <UserIcon className="h-4 w-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold truncate max-w-[160px]">
                          {person.first_name} {person.last_name_father}
                        </span>
                        <div className="flex flex-col">
                          <span className="text-[10px] text-orange-600 font-bold uppercase truncate max-w-[160px]">
                             {positions.find(pos => pos.id === person.main_position)?.name || 'Sin Cargo'}
                          </span>
                          <span className="text-[9px] text-muted-foreground uppercase">
                             {person.rotation_pattern || 'Estándar'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  {days.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const assignment = assignments.find(a => a.personnel_id === person.id && a.date === dateStr);
                    const leave = leaves.find(l => 
                      person.id === l.personnel_id && 
                      dateStr >= l.start_date && 
                      dateStr <= l.end_date
                    );
                    const shift = assignment ? shifts.find(s => s.id === assignment.shift_id) : null;
                    const area = assignment ? areas.find(a => a.id === assignment.area_id) : null;
                    
                    const getLeaveLabel = (type: string) => {
                      switch(type) {
                        case 'vacation': return 'VAC';
                        case 'sick': return 'LM';
                        case 'personal': return 'ADM';
                        default: return 'ABS';
                      }
                    };
                    const getLeaveColor = (type: string) => {
                      switch(type) {
                        case 'vacation': return 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 text-emerald-600';
                        case 'sick': return 'bg-red-50 dark:bg-red-900/20 border-red-100 text-red-600';
                        case 'personal': return 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 text-amber-600';
                        default: return 'bg-slate-50 dark:bg-slate-900/20 border-slate-100 text-slate-600';
                      }
                    };

                    const isTerminated = person.termination_date && dateStr > person.termination_date;
                    const isPreHire = person.hire_date && dateStr < person.hire_date;
                    const isBlocked = isTerminated || isPreHire;

                    return (
                      <td 
                        key={dateStr}
                        onClick={() => !isBlocked && handleCellClick(person, day)}
                        className={cn(
                          "p-1 text-center border-b border-slate-50 dark:border-slate-900 cursor-pointer h-14",
                          isSunday(day) && "bg-slate-50/30 dark:bg-slate-900/10",
                          isToday(day) && "bg-orange-50/40 dark:bg-orange-900/20 shadow-[inset_0_0_0_1px_rgba(249,115,22,0.1)]",
                          isBlocked && "bg-slate-100 dark:bg-slate-900/80 cursor-not-allowed opacity-50 repeating-bg-stripe",
                          "hover:ring-2 hover:ring-orange-500/20"
                        )}
                      >
                        {isTerminated ? (
                          <div className="h-full flex items-center justify-center">
                             <span className="text-[10px] font-bold text-slate-400 rotate-45">BAJA</span>
                          </div>
                        ) : isPreHire ? (
                          <div className="h-full flex items-center justify-center">
                             <span className="text-[10px] font-bold text-slate-400">PRE</span>
                          </div>
                        ) : leave ? (
                          <div className={cn(
                             "h-full flex flex-col items-center justify-center rounded border font-black text-[10px]",
                             getLeaveColor(leave.type)
                          )}>
                             {getLeaveLabel(leave.type)}
                          </div>
                        ) : shift ? (
                          <div className={cn(
                            "h-full flex flex-col items-center justify-center rounded border shadow-sm",
                            assignment?.is_manual 
                              ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/50" 
                              : "bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/40"
                          )}>
                             <span className="text-[9px] font-bold text-slate-700 dark:text-slate-300">
                               {shift.start_time.slice(0, 5)}
                             </span>
                             <span className="text-[8px] uppercase font-bold text-muted-foreground truncate w-full px-1">
                               {area?.name.split(' ')[0] || 'T'}
                             </span>
                          </div>
                        ) : (
                          <div className="h-full flex items-center justify-center opacity-10">
                             <Plus className="h-3 w-3" />
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
      </div>

      {/* Assignment Dialog */}
      <Dialog open={!!selectedCell} onOpenChange={(open) => !open && setSelectedCell(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-orange-600" />
              {selectedCell && format(selectedCell.date, 'PPP', { locale: es })}
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
             <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
                   <UserIcon className="h-5 w-5" />
                </div>
                <div>
                   <p className="font-semibold">{selectedCell?.person.first_name} {selectedCell?.person.last_name_father}</p>
                   <p className="text-xs text-muted-foreground uppercase">{selectedCell?.person.rotation_pattern || 'Asignación Manual'}</p>
                </div>
             </div>

             <form id="assign-form" action={handleSaveAssignment} className="space-y-4">
                <div className="space-y-1">
                  <Label>Turno</Label>
                  <select name="shift_id" required className="w-full h-9 rounded-md border text-sm px-2">
                    <option value="">Seleccionar turno</option>
                    {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0, 5)})</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Cargo</Label>
                    <select 
                      name="position_id" 
                      required 
                      className="w-full h-9 rounded-md border text-sm px-2"
                      value={dialogPositionId}
                      onChange={(e) => {
                        const posId = e.target.value;
                        setDialogPositionId(posId);
                        const pos = positions.find(p => p.id === posId);
                        if (pos) setDialogAreaId(pos.area_id);
                      }}
                    >
                      <option value="">Seleccionar cargo</option>
                      {/* Filter to only main and secondary positions */}
                      {selectedCell && positions
                        .filter(p => p.id === selectedCell.person.main_position || selectedCell.person.secondary_positions.includes(p.id))
                        .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Área</Label>
                    <select 
                      name="area_id" 
                      required 
                      className="w-full h-9 rounded-md border text-sm px-2"
                      value={dialogAreaId}
                      onChange={(e) => setDialogAreaId(e.target.value)}
                    >
                      <option value="">Seleccionar área</option>
                      {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                </div>
             </form>

             {selectedCell && assignments.find(a => a.personnel_id === selectedCell.person.id && a.date === format(selectedCell.date, 'yyyy-MM-dd')) && (
               <div className="pt-4 border-t">
                  <Button 
                    variant="destructive" 
                    className="w-full gap-2"
                    onClick={() => {
                      const a = assignments.find(ax => ax.personnel_id === selectedCell.person.id && ax.date === format(selectedCell.date, 'yyyy-MM-dd'));
                      if (a) handleDelete(a.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" /> Eliminar Asignación Actual
                  </Button>
               </div>
             )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedCell(null)}>Cancelar</Button>
            <Button 
              form="assign-form" 
              type="submit" 
              disabled={isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar Turno'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
