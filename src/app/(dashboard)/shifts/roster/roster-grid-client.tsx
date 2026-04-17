'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
  CheckCircle2,
  Loader2,
  RefreshCw,
  Sparkles,
  Wand2, 
  X, 
  AlertCircle, 
  Info,
  Users
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from "@/components/ui/progress";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { createManualAssignment, deleteAssignment, runScheduler, clearAutoAssignments } from '@/app/(dashboard)/shifts/actions';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';

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

type AIProcessStep = 'preparing' | 'scheduling' | 'optimizing' | 'saving' | 'completed' | 'error';

interface AIProgress {
  step: AIProcessStep;
  percentage: number;
  message?: string;
  stats?: { coverage: number, count: number };
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
  requirements: any[];
  currentMonth: string;
}

export function RosterGridClient({
  personnel,
  shifts,
  areas,
  assignments,
  leaves,
  positions,
  requirements,
  currentMonth
}: RosterGridProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [personnelFilter, setPersonnelFilter] = useState<string[]>([]);
  const [selectedCell, setSelectedCell] = useState<{ person: Personnel, date: Date } | null>(null);
  const [isPending, startTransition] = useTransition();

  // AI Process state
  const [aiStep, setAiStep] = useState<AIProcessStep>('preparing');
  const [aiProgress, setAiProgress] = useState(0);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiStats, setAiStats] = useState<{ coverage: number, count: number } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

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
      
      const pos = positions.find(pos => pos.id === p.main_position);
      const personPositionName = pos?.name || '';
      const posMatch = !positionFilter || personPositionName === positionFilter;

      // Filter by Area (Area of the main position)
      const areaMatch = !areaFilter || pos?.area_id === areaFilter;
      
      const personMatch = personnelFilter.length === 0 || personnelFilter.includes(p.id);
      
      return nameMatch && posMatch && areaMatch && personMatch;
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
  }, [personnel, search, positionFilter, areaFilter, positions, personnelFilter]);

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

  const handleRunAI = () => {
    if (!confirm('¿Ejecutar autogeneración para lo que queda de Abril? (Se respetarán turnos manuales)')) return;
    
    setIsAiModalOpen(true);
    setAiStep('preparing');
    setAiProgress(0);
    setAiError(null);
    setAiStats(null);

    startTransition(async () => {
      try {
        // Since we can't easily stream from server actions yet, 
        // we simulate progress increments for the phases to give feedback
        const interval = setInterval(() => {
          setAiProgress(prev => {
            if (prev < 90) return prev + Math.random() * 5;
            return prev;
          });
        }, 1000);

        setAiStep('scheduling');
        const today = '2026-04-20'; // Inicia desde el 20 de abril como solicitaste
        const end = format(endOfMonth(new Date(monthDate)), 'yyyy-MM-dd');
        
        const res = await runScheduler(today, end);
        
        clearInterval(interval);
        
        if (res.error) {
          setAiError(res.error);
          setAiStep('error');
          toast.error(res.error);
        } else {
          setAiProgress(100);
          setAiStep('completed');
          setAiStats({
            coverage: res.data?.stats.coverage_percent || 0,
            count: res.data?.stats.recalculated_count || 0
          });
          toast.success('Autogeneración completada');
        }
      } catch (err) {
        setAiError(err instanceof Error ? err.message : 'Error desconocido');
        setAiStep('error');
      }
    });
  };

  const handleClearAI = () => {
    if (!confirm('¿Eliminar todos los turnos autogenerados en Abril? (Los manuales se mantendrán)')) return;
    
    startTransition(async () => {
      const start = format(startOfMonth(new Date()), 'yyyy-MM-dd');
      const end = format(endOfMonth(new Date()), 'yyyy-MM-dd');
      const res = await clearAutoAssignments(start, end);
      if (res.error) toast.error(res.error);
      else toast.success('Turnos automáticos eliminados');
    });
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
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
          >
            <option value="">Todas las áreas</option>
            {areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
          </select>
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

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 gap-2">
            <Users className="h-4 w-4" />
            <span>Personas</span>
            {personnelFilter.length > 0 && (
              <Badge variant="secondary" className="ml-1 px-1 h-5 min-w-5 justify-center bg-orange-100 text-orange-700 border-orange-200">
                {personnelFilter.length}
              </Badge>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 max-h-[400px] overflow-y-auto">
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem 
              checked={personnelFilter.length === 0}
              onCheckedChange={() => setPersonnelFilter([])}
            >
              Todos
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {personnel
              .sort((a, b) => a.first_name.localeCompare(b.first_name))
              .map(p => (
                <DropdownMenuCheckboxItem
                  key={p.id}
                  checked={personnelFilter.includes(p.id)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setPersonnelFilter(prev => [...prev, p.id]);
                    } else {
                      setPersonnelFilter(prev => prev.filter(id => id !== p.id));
                    }
                  }}
                >
                  {p.first_name} {p.last_name_father}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex items-center gap-1 border-l pl-3 ml-2 border-slate-200">
           <Button variant="ghost" size="sm" className="h-8">
              <ChevronLeft className="h-4 w-4 mr-1" /> Mes anterior
           </Button>
           <Button variant="ghost" size="sm" className="h-8">
              Mes siguiente <ChevronRight className="h-4 w-4 ml-1" />
           </Button>
        </div>

        {/* AI Test Controls */}
        <div className="flex items-center gap-2 border-l pl-3 ml-auto border-slate-200">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 border-orange-500 text-orange-600 hover:bg-orange-50 text-[10px] font-bold uppercase"
            onClick={async () => {
              const { runDiagnostic } = await import('@/app/(dashboard)/shifts/actions');
              const res = await runDiagnostic();
              alert(`DIAGNÓSTICO 20-21 ABRIL:\n\nREQ. SUPERVISOR (${res.supervisorReqs.length}):\n${res.supervisorReqs.join('\n')}\n\nPERSONALES SUP (${res.supervisors.length}):\n${res.supervisors.join(', ')}\n\nTOTAL REQS EN PERIODO: ${res.totalReqs}`);
            }}
          >
            Diagnóstico 20-21
          </Button>
          <Badge variant="outline" className="text-[10px] uppercase font-bold text-orange-600 border-orange-200 bg-orange-50/50">Prueba IA</Badge>
          <Button 
            variant="default" 
            size="sm" 
            className="h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs"
            onClick={() => {
              if (confirm('¿Generar requerimientos para todo el mes basados en las reglas permanentes?')) {
                const start = format(startOfMonth(monthDate), 'yyyy-MM-dd');
                const end = format(endOfMonth(monthDate), 'yyyy-MM-dd');
                startTransition(async () => {
                  const { materializeTemplates } = await import('@/app/(dashboard)/shifts/actions');
                  const res = await materializeTemplates(start, end);
                  if (res.error) toast.error(res.error);
                  else {
                    toast.success(`${res.count} requerimientos generados`);
                    router.refresh();
                  }
                });
              }
            }}
            disabled={isPending}
          >
            <Calendar className="h-3.5 w-3.5 mr-1" />
            Generar Necesidades
          </Button>
          <Button 
            variant="default" 
            size="sm" 
            className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            onClick={handleRunAI}
            disabled={isPending}
          >
            {isPending && aiStep !== 'completed' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Completar Abril
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 text-red-500 border-red-200 hover:bg-red-50 text-xs"
            onClick={handleClearAI}
            disabled={isPending}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Limpiar IA
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
              {/* Row: Coverage Summary */}
              <tr className="bg-slate-50/80 dark:bg-slate-900 shadow-sm border-b-2 border-slate-200 dark:border-slate-800">
                <td className="sticky left-0 z-10 w-[240px] p-3 border-r border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                       Cobertura Total
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                       Personas asignadas vs requeridas
                    </span>
                  </div>
                </td>
                {days.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  
                  // Filter requirements based on current position filter
                  const dailyReqs = (requirements || []).filter(r => {
                    const dateMatch = r.date === dateStr;
                    if (!dateMatch) return false;
                    
                    if (areaFilter && areaFilter !== "none") {
                      if (r.area_id !== areaFilter) return false;
                    }
                    
                    if (positionFilter && positionFilter !== "none") {
                      const reqName = (r.position as any)?.name?.toUpperCase() || "";
                      if (positionFilter.toUpperCase() !== reqName) return false;
                    }
                    return true;
                  });

                  const dailyReqTotal = dailyReqs.reduce((sum, r) => sum + r.required_count, 0);

                  // Filter assignments based on shown positions
                  const dailyAssignments = assignments.filter(a => {
                    const dateMatch = a.date === dateStr;
                    if (!dateMatch) return false;
                    
                    if (positionFilter && positionFilter !== "none") {
                      const assignPosName = (positions || []).find(p => p.id === a.position_id)?.name?.toUpperCase() || "";
                      return positionFilter.toUpperCase() === assignPosName;
                    }
                    
                    return true;
                  }).length;

                  const isUndercovered = dailyAssignments < dailyReqTotal;
                  
                  // Detail for tooltip/audit
                  const shiftBreakdown = dailyReqs.map(r => {
                    const shift = shifts.find(s => s.id === r.shift_id);
                    const count = assignments.filter(a => a.date === dateStr && a.shift_id === r.shift_id && (!positionFilter || a.position_id === positionFilter)).length;
                    return `${shift?.name || 'Turno'}: ${count}/${r.required_count}`;
                  }).join(' | ');

                  return (
                    <td key={`coverage-${dateStr}`} 
                        title={shiftBreakdown}
                        className={cn(
                      "p-2 text-center border-r border-slate-200 dark:border-slate-800 transition-colors",
                      isUndercovered 
                        ? "bg-red-500/10 dark:bg-red-900/40 border-red-200 dark:border-red-900 shadow-inner" 
                        : "bg-slate-50/80 dark:bg-slate-900",
                      isToday(day) && "ring-2 ring-inset ring-orange-400/30"
                    )}>
                      <div className="flex flex-col items-center cursor-help">
                        <span className={cn(
                          "text-xs font-black tracking-tighter",
                          isUndercovered ? "text-red-600 dark:text-red-400 underline decoration-2 underline-offset-4" : "text-emerald-500"
                        )}>
                          {dailyAssignments} / {dailyReqTotal}
                        </span>
                        {dailyReqTotal > 0 && (
                          <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                            <div 
                              className={cn(
                                "h-full transition-all duration-700 ease-out",
                                isUndercovered ? "bg-red-500" : "bg-emerald-500"
                              )}
                              style={{ width: `${Math.min(100, (dailyAssignments / dailyReqTotal) * 100)}%` }}
                            />
                          </div>
                        )}
                        {isUndercovered && (
                          <span className="text-[8px] text-red-500 font-bold mt-0.5 animate-pulse uppercase">Faltan {dailyReqTotal - dailyAssignments}</span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>

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
                          <div 
                            title={`${shift.name} | Area: ${area?.name || '---'} | Cargo: ${positions.find(p => p.id === assignment?.position_id)?.name || '---'}`}
                            className={cn(
                              "h-full flex flex-col items-center justify-center rounded border shadow-sm",
                              assignment?.is_manual 
                                ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/50" 
                                : "bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/40"
                            )}
                          >
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

      {/* AI Processing Modal */}
      <Dialog open={isAiModalOpen} onOpenChange={(open) => {
        if (!open && (aiStep === 'completed' || aiStep === 'error')) {
          setIsAiModalOpen(false);
        }
      }}>
        <DialogContent className="sm:max-w-[460px] p-0 overflow-hidden border-orange-100 dark:border-orange-900 shadow-2xl">
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-8 text-white">
             <div className="flex items-center gap-3 mb-2">
                <Sparkles className="h-6 w-6 animate-pulse" />
                <h2 className="text-xl font-bold italic tracking-tight">Motor de Inteligencia Artificial</h2>
             </div>
             <p className="text-orange-100/80 text-sm">Optimizando la distribución de turnos según demanda y normativas legales.</p>
          </div>

          <div className="p-8 space-y-6">
            <div className="space-y-4">

              {aiStep !== 'completed' && aiStep !== 'error' && (
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                    <span>Progreso del cálculo</span>
                    <span>{Math.round(aiProgress)}%</span>
                  </div>
                  <Progress value={aiProgress} className="h-2 bg-slate-100" />
                </div>
              )}

                {[
                  { id: 'preparing', label: 'Preparando datos y disponibilidad', active: aiStep === 'preparing' },
                  { id: 'scheduling', label: 'Calculando asignaciones óptimas', active: aiStep === 'scheduling' },
                  { id: 'optimizing', label: 'Validando restricciones legales', active: aiStep === 'optimizing' },
                  { id: 'saving', label: 'Inyectando cambios en sistema', active: aiStep === 'saving' },
                ].map((step, idx, arr) => {
                  const isDone = arr.findIndex(s => s.id === aiStep) > idx || aiStep === 'completed';
                  const isCurrent = step.id === aiStep;

                  return (
                    <div key={step.id} className="flex items-center gap-4">
                       <div className={cn(
                         "h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-all border-2",
                         isDone ? "bg-emerald-500 border-emerald-500 text-white" : 
                         isCurrent ? "bg-white border-orange-500 text-orange-600 shadow-sm scale-110" : 
                         "bg-white border-slate-200 text-slate-300"
                       )}>
                         {isDone ? <CheckCircle2 className="h-5 w-5" /> : 
                          isCurrent ? <Loader2 className="h-4 w-4 animate-spin" /> : 
                          <span className="text-xs font-bold">{idx + 1}</span>}
                       </div>
                       <div className="flex-1">
                          <p className={cn(
                            "text-sm font-semibold transition-colors",
                            isDone ? "text-slate-500 line-through" : 
                            isCurrent ? "text-orange-600" : 
                            "text-slate-400"
                          )}>
                            {step.label}
                          </p>
                       </div>
                    </div>
                  );
                })}
             </div>

             {aiStep === 'completed' && aiStats && (
                <div className="bg-emerald-50 dark:bg-emerald-950/30 p-4 rounded-xl border border-emerald-100 animate-in fade-in zoom-in duration-500">
                   <div className="flex items-center gap-3 mb-2">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      <span className="font-bold text-emerald-700">¡Optimización Exitosa!</span>
                   </div>
                   <div className="grid grid-cols-2 gap-4 mt-1">
                      <div>
                        <p className="text-[10px] text-emerald-600/70 uppercase font-black uppercase tracking-wider">Cobertura</p>
                        <p className="text-2xl font-black text-emerald-700">{aiStats.coverage}%</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-emerald-600/70 uppercase font-black uppercase tracking-wider">Turnos</p>
                        <p className="text-2xl font-black text-emerald-700">{aiStats.count}</p>
                      </div>
                   </div>
                </div>
             )}

             {aiStep === 'error' && (
                <div className="bg-red-50 dark:bg-red-950/30 p-4 rounded-xl border border-red-100 flex items-start gap-4 animate-in slide-in-from-top-2">
                   <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                   <div>
                      <p className="font-bold text-red-700 text-sm">Error en proceso</p>
                      <p className="text-xs text-red-600/80">{aiError}</p>
                   </div>
                </div>
             )}
          </div>

          <DialogFooter className="p-6 bg-slate-50 dark:bg-slate-900/50 border-t">
            {(aiStep === 'completed' || aiStep === 'error') && (
              <Button onClick={() => setIsAiModalOpen(false)} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold h-11">
                 Cerrar y Ver Resultados
              </Button>
            )}
            {aiStep !== 'completed' && aiStep !== 'error' && (
              <p className="text-[10px] text-muted-foreground w-full text-center uppercase tracking-widest font-black opacity-50">
                 No cierres esta ventana hasta finalizar
              </p>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
