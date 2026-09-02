'use client';

import { useState, useMemo, useTransition, useEffect, memo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  format, 
  eachDayOfInterval, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek,
  endOfWeek,
  isSunday, 
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  addDays,
  parseISO
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
  Check,
  Loader2,
  RefreshCw,
  Sparkles,
  Wand2, 
  X, 
  AlertCircle, 
  Info,
  Users,
  Play,
  Terminal,
  Zap,
  Truck,
  FileText,
  Cake,
  MapPin,
  EyeOff,
  Send,
  Briefcase,
  ChevronDown,
  MessageCircleOff,
  Download
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BlueConfigurator } from './blue-configurator';
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
import { 
  createManualAssignment, 
  deleteAssignment, 
  runScheduler, 
  clearAutoAssignments,
  bulkDeleteManualAssignments,
  validateAssignments,
  publishAssignments,
  moveAssignment,
  sendTodayChangeNotifications,
  previewTodayChangeNotifications,

} from '@/app/(dashboard)/shifts/actions';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem
} from '@/components/ui/dropdown-menu';

interface Position { id: string; name: string; area_id: string; requires_shifts?: boolean; }
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
  is_validated?: boolean;
  is_published?: boolean;
  original_shift_id?: string | null;
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
  last_name_mother?: string;
  rotation_pattern: string | null;
  main_position: string;
  secondary_positions: string[];
  hire_date: string | null;
  termination_date: string | null;
  has_special_contract: boolean;
  birth_date: string | null;
  address?: any;
  requires_shifts?: boolean;
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
  readOnly?: boolean;
}

export function RosterGridClient({
  personnel,
  shifts,
  areas,
  assignments,
  leaves,
  positions,
  requirements,
  currentMonth,
  readOnly = false
}: RosterGridProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [personnelFilter, setPersonnelFilter] = useState<string[]>([]);

  // PERSISTENCE: Load filters from localStorage on mount
  useEffect(() => {
    const savedFilters = localStorage.getItem('roster_filters');
    if (savedFilters) {
      try {
        const parsed = JSON.parse(savedFilters);
        if (parsed.search) setSearch(parsed.search);
        if (parsed.positionFilter) setPositionFilter(parsed.positionFilter);
        if (parsed.areaFilter) setAreaFilter(parsed.areaFilter);
        if (parsed.personnelFilter) setPersonnelFilter(parsed.personnelFilter);
      } catch (e) {
        console.error('Error loading filters:', e);
      }
    }
  }, []);

  // PERSISTENCE: Save filters to localStorage when they change
  useEffect(() => {
    const filters = { search, positionFilter, areaFilter, personnelFilter };
    localStorage.setItem('roster_filters', JSON.stringify(filters));
  }, [search, positionFilter, areaFilter, personnelFilter]);
  const [selectedCell, setSelectedCell] = useState<{ person: Personnel, date: Date } | null>(null);
  const [isPending, startTransition] = useTransition();

  // AI Process state
  const [aiStep, setAiStep] = useState<AIProcessStep>('preparing');
  const [aiProgress, setAiProgress] = useState(0);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiStats, setAiStats] = useState<{ coverage: number, count: number, executionTime?: number } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isBlueConfigOpen, setIsBlueConfigOpen] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<string[] | null>(null);
  const [pendingLogs, setPendingLogs] = useState<string[]>([]);
  const [isStepMode, setIsStepMode] = useState(false);
  const [isStepSimOpen, setIsStepSimOpen] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [currentSimDate, setCurrentSimDate] = useState<Date | null>(null);
  const [simLogs, setSimLogs] = useState<string[]>([]);
  const [simResults, setSimResults] = useState<any[]>([]);
  const [isAudit4x4Open, setIsAudit4x4Open] = useState(false);
  const [audit4x4Data, setAudit4x4Data] = useState<any[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isAiConfigOpen, setIsAiConfigOpen] = useState(false);
  const [draggingAssignment, setDraggingAssignment] = useState<Assignment | null>(null);
  const [reasonDialogOpen, setReasonDialogOpen] = useState<{ open: boolean, assignment: Assignment | null, newDate: string }>({ 
    open: false, assignment: null, newDate: '' 
  });
  const [pushedReason, setPushedReason] = useState('');
  const [planningRange, setPlanningRange] = useState<{ from: string, to: string }>({ from: '', to: '' });
  const [aiActionMode, setAiActionMode] = useState<'scheduling' | 'needs' | 'clear'>('scheduling');
  const [isAssignmentDialogOpen, setIsAssignmentDialogOpen] = useState(false);
  const [auditSummary, setAuditSummary] = useState<any[] | null>(null);
  const [isAuditSummaryOpen, setIsAuditSummaryOpen] = useState(false);
  const [clearOptions, setClearOptions] = useState({
    includeManual: false,
    includeValidated: false,
    includePublished: false,
  });

  // One-shot: tracks whether today's manual notifications have been sent this session
  const [isTodayNotifSent, setIsTodayNotifSent] = useState(false);
  const [isSendingTodayNotif, setIsSendingTodayNotif] = useState(false);

  // Local state for the dialog selects
  const [dialogPositionId, setDialogPositionId] = useState<string>('');
  const [dialogAreaId, setDialogAreaId] = useState<string>('');

  // Multi-selection state
  const [selectedCells, setSelectedCells] = useState<{ personId: string; dateStr: string }[]>([]);

  // Coverage detail dialog state
  const [coverageDialog, setCoverageDialog] = useState<{ dateStr: string; day: Date } | null>(null);

  const monthDate = new Date(currentMonth + 'T00:00:00');
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 }),
  });

  const goToMonth = (date: Date) => {
    const formatted = format(date, 'yyyy-MM');
    router.push(`/shifts/roster?month=${formatted}`);
  };

  const nextMonth = () => goToMonth(addMonths(monthDate, 1));
  const prevMonth = () => goToMonth(subMonths(monthDate, 1));

  // INDEXING: Create fast lookup maps for performance
  const assignmentsMap = useMemo(() => {
    const map: Record<string, Record<string, Assignment>> = {};
    
    // Debug for Matias
    const matiasId = 'd2dd0000-0000-0000-0000-000000000000';
    const matiasAsgns = assignments.filter(a => a.personnel_id === matiasId);
    console.log(`[CLIENT-DEBUG] Received ${assignments.length} assignments total. Matias has ${matiasAsgns.length} assignments in client prop.`);
    if (matiasAsgns.length > 0) {
      console.log(`[CLIENT-DEBUG] Matias sample dates: ${matiasAsgns.slice(0, 5).map(a => a.date).join(', ')}`);
    }

    assignments.forEach(a => {
      if (!map[a.personnel_id]) map[a.personnel_id] = {};
      map[a.personnel_id][a.date] = a;
    });
    return map;
  }, [assignments]);

  const leavesMap = useMemo(() => {
    const map: Record<string, Leave[]> = {};
    leaves.forEach(l => {
      if (!map[l.personnel_id]) map[l.personnel_id] = [];
      map[l.personnel_id].push(l);
    });
    return map;
  }, [leaves]);

  const shiftsMap = useMemo(() => {
    const map: Record<string, Shift> = {};
    shifts.forEach(s => { map[s.id] = s; });
    return map;
  }, [shifts]);

  const areasMap = useMemo(() => {
    const map: Record<string, Area> = {};
    areas.forEach(a => { map[a.id] = a; });
    return map;
  }, [areas]);

  const positionsMap = useMemo(() => {
    const map: Record<string, Position> = {};
    positions.forEach(p => { map[p.id] = p; });
    return map;
  }, [positions]);

  const requirementsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    (requirements || []).forEach(r => {
      if (!map[r.date]) map[r.date] = [];
      map[r.date].push(r);
    });
    return map;
  }, [requirements]);

  const assignmentsByDate = useMemo(() => {
    const map: Record<string, Assignment[]> = {};
    assignments.forEach(a => {
      if (!map[a.date]) map[a.date] = [];
      map[a.date].push(a);
    });
    return map;
  }, [assignments]);

  const filteredPersonnel = useMemo(() => {
    const monthStartStr = format(startOfMonth(monthDate), 'yyyy-MM-dd');
    const monthEndStr = format(endOfMonth(monthDate), 'yyyy-MM-dd');

    const filtered = personnel.filter(p => {
      // 0. Exclude non-shift personnel / positions (e.g. Gerente de Operaciones)
      if (p.requires_shifts === false) return false;
      const posObj = positions.find(pos => pos.id === p.main_position);
      if (posObj?.requires_shifts === false) return false;

      // 1. Contract Date Check
      if (p.termination_date && p.termination_date < monthStartStr) {
        // Only show if they have assignments in this month (historical data)
        const hasAssignments = assignments.some(a => a.personnel_id === p.id && a.date >= monthStartStr && a.date <= monthEndStr);
        if (!hasAssignments) return false;
      }
      if (p.hire_date && p.hire_date > monthEndStr) {
        return false;
      }

      // 2. Existing filters
      const nameMatch = `${p.first_name} ${p.last_name_father}`.toLowerCase().includes(search.toLowerCase());
      
      const pos = positions.find(pos => pos.id === p.main_position);
      const personPositionName = pos?.name || '';
      const posMatch = !positionFilter || personPositionName === positionFilter;

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
    const activePositionsWithShifts = positions.filter(pos => {
      // 1. Exclude positions that explicitly do not require shifts (e.g. Gerente de Operaciones)
      if (pos.requires_shifts === false) return false;

      // 2. Exclude positions that currently have no active personnel assigned to them
      const count = personnel.filter(p => {
        if (p.requires_shifts === false) return false;
        return p.main_position === pos.id || p.main_position === pos.name;
      }).length;

      return count > 0;
    });

    const names = activePositionsWithShifts.map(p => p.name);
    return Array.from(new Set(names)).sort();
  }, [positions, personnel]);

  const filteredPersonnelForSelect = useMemo(() => {
    return personnel.filter(p => {
      if (!positionFilter && !areaFilter) return true;
      const pos = positions.find(pos => pos.id === p.main_position);
      const posName = pos?.name || "";
      const posMatch = !positionFilter || posName === positionFilter;
      const areaMatch = !areaFilter || pos?.area_id === areaFilter;
      return posMatch && areaMatch;
    }).sort((a, b) => a.first_name.localeCompare(b.first_name));
  }, [personnel, positionFilter, areaFilter, positions]);

  const handleCellClick = useCallback((person: Personnel, date: Date) => {
    if (readOnly) return;
    const dateStr = format(date, 'yyyy-MM-dd');
    
    setSelectedCells(prev => {
      const exists = prev.find(c => c.personId === person.id && c.dateStr === dateStr);
      if (exists) {
        const next = prev.filter(c => !(c.personId === person.id && c.dateStr === dateStr));
        return next;
      } else {
        const newCell = { personId: person.id, dateStr };
        
        // Pre-select main position and area for the dialog based on the last person clicked
        if (person.main_position) {
          setDialogPositionId(person.main_position);
          const pos = positions.find(p => p.id === person.main_position);
          if (pos) setDialogAreaId(pos.area_id);
        } else {
          setDialogPositionId('');
          setDialogAreaId('');
        }

        return [...prev, newCell];
      }
    });
  }, [readOnly, positions]);

  const handleToggleRow = useCallback((personId: string) => {
    const personDates = days.map(d => format(d, 'yyyy-MM-dd'));
    const isTerminated = (p: Personnel, d: string) => p.termination_date && d > p.termination_date;
    const isPreHire = (p: Personnel, d: string) => p.hire_date && d < p.hire_date;
    const person = personnel.find(p => p.id === personId);
    if (!person) return;

    const availableDates = personDates.filter(d => !isTerminated(person, d) && !isPreHire(person, d));
    const allSelected = availableDates.every(d => selectedCells.some(c => c.personId === personId && c.dateStr === d));

    if (allSelected) {
      setSelectedCells(prev => prev.filter(c => c.personId !== personId));
    } else {
      setSelectedCells(prev => {
        const others = prev.filter(c => c.personId !== personId);
        const newOnes = availableDates.map(d => ({ personId, dateStr: d }));
        return [...others, ...newOnes];
      });
    }
  }, [days, personnel, selectedCells]);

  const handleToggleColumn = (dateStr: string) => {
    const isTerminated = (p: Personnel, d: string) => p.termination_date && d > p.termination_date;
    const isPreHire = (p: Personnel, d: string) => p.hire_date && d < p.hire_date;
    
    const availablePersonnel = filteredPersonnel.filter(p => !isTerminated(p, dateStr) && !isPreHire(p, dateStr));
    const allSelected = availablePersonnel.every(p => selectedCells.some(c => c.personId === p.id && c.dateStr === dateStr));

    if (allSelected) {
      setSelectedCells(prev => prev.filter(c => c.dateStr !== dateStr));
    } else {
      setSelectedCells(prev => {
        const others = prev.filter(c => c.dateStr !== dateStr);
        const newOnes = availablePersonnel.map(p => ({ personId: p.id, dateStr }));
        return [...others, ...newOnes];
      });
    }
  };

  const handleToggleAll = () => {
    const isTerminated = (p: Personnel, d: string) => p.termination_date && d > p.termination_date;
    const isPreHire = (p: Personnel, d: string) => p.hire_date && d < p.hire_date;
    
    const allCells: { personId: string; dateStr: string }[] = [];
    filteredPersonnel.forEach(p => {
      days.forEach(day => {
        const d = format(day, 'yyyy-MM-dd');
        if (!isTerminated(p, d) && !isPreHire(p, d)) {
          allCells.push({ personId: p.id, dateStr: d });
        }
      });
    });

    const allSelected = allCells.length > 0 && allCells.every(ac => selectedCells.some(sc => sc.personId === ac.personId && sc.dateStr === ac.dateStr));

    if (allSelected) {
      setSelectedCells([]);
    } else {
      setSelectedCells(allCells);
    }
  };

  const handleRunAI = (from?: string, to?: string) => {
    const start = from || planningRange.from;
    const end = to || planningRange.to;
    
    if (!start || !end) {
      toast.error('Seleccione un rango de fechas válido');
      return;
    }

    setIsAiConfigOpen(false);
    
    if (aiActionMode === 'clear') {
       if (!confirm(`¿Estás seguro de eliminar los turnos en el rango ${start} a ${end}? Esta acción no se puede deshacer.`)) return;
       startTransition(async () => {
         const res = await clearAutoAssignments(
           start, 
           end, 
           areaFilter || undefined, 
           personnelFilter, 
           positionFilter || undefined,
           clearOptions
         );
         if (res.error) toast.error(res.error);
         else {
           toast.success('Limpieza completada');
           router.refresh();
         }
       });
       return;
    }

    if (aiActionMode === 'needs') {
       startTransition(async () => {
         const { materializeTemplates } = await import('@/app/(dashboard)/shifts/actions');
         const res = await materializeTemplates(start, end);
         if (res.error) toast.error(res.error);
         else {
           toast.success(`${res.count} requerimientos generados`);
           router.refresh();
         }
       });
       return;
    }

    // Default scheduling mode
    setIsAiModalOpen(true);
    setAiStep('preparing');
    setAiProgress(0);
    setAiStats(null);
    setAiError(null);
    setElapsedSeconds(0);

    startTransition(async () => {
      const timer = setInterval(() => {
        setElapsedSeconds((prev: number) => prev + 1);
      }, 1000);

      const progressInterval = setInterval(() => {
        setAiProgress(prev => {
          if (prev < 90) return prev + Math.random() * 5;
          return prev;
        });
      }, 1000);

      try {
        setAiStep('scheduling');
        const res = await runScheduler(start, end, areaFilter || undefined, personnelFilter, positionFilter || undefined) as any;
        
        if (res.error) {
          setAiError(res.error);
          setAiStep('error');
          toast.error(res.error);
        } else {
          setAiProgress(100);
          setAiStep('completed');
          setAiStats({
            coverage: res.data?.stats?.coverage_percent || 0,
            count: res.data?.count || 0,
            executionTime: res.data?.stats?.execution_time_ms
          });

          // DISPARAR EL INFORME DE AUDITORÍA
          if (res.auditSummary) {
            setAuditSummary(res.auditSummary);
            setIsAuditSummaryOpen(true);
          }

          if (res.diagnosticLogs) {
            setSimLogs(["--- LOGS DE LA IA REAL ---", ...res.diagnosticLogs, "✅ AUDITORÍA FINALIZADA"]);
          } else {
            setSimLogs(["--- LOGS DE LA IA REAL ---", "--- NO SE RECIBIERON LOGS ---", "✅ AUDITORÍA FINALIZADA"]);
          }

          toast.success('Autogeneración completada');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('was not found on the server') || msg.includes('failed-to-find-server-action') || msg.includes('Server Action')) {
          setAiError('Se ha desplegado una nueva versión del sistema. Recargando la página automáticamente para sincronizar...');
          toast.info('Sincronizando la última versión del sistema...');
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } else {
          setAiError(msg);
          setAiStep('error');
        }
      } finally {
        clearInterval(timer);
        clearInterval(progressInterval);
      }
    });
  };

  const handleClearAI = () => {
    const isCurrentMonth = format(new Date(), 'yyyy-MM') === format(monthDate, 'yyyy-MM');
    setPlanningRange({
      from: isCurrentMonth ? format(new Date(), 'yyyy-MM-dd') : format(days[0], 'yyyy-MM-dd'),
      to: format(days[days.length - 1], 'yyyy-MM-dd')
    });
    setAiActionMode('clear');
    setIsAiConfigOpen(true);
  };

  const startStepSimulation = () => {
    const marcelo = personnel.find(p => p.first_name.toUpperCase().includes('MARCELO'));
    if (!marcelo) {
      toast.error("No se encontró a Marcelo");
      return;
    }
    if (!planningRange.from || !planningRange.to) {
      setPlanningRange({
        from: format(startOfMonth(monthDate), 'yyyy-MM-dd'),
        to: format(endOfMonth(monthDate), 'yyyy-MM-dd')
      });
    }
    setSimLogs(["Simulación iniciada para " + marcelo.first_name]);
    setSimResults([]);
    setCurrentSimDate(null); // Empezamos sin fecha para que el usuario pueda auditar el rango elegido
    setIsStepSimOpen(true);
  };

  const nextSimStep = async () => {
    if (!currentSimDate) return;
    
    const marcelo = personnel.find(p => p.first_name.toUpperCase().includes('MARCELO'));
    if (!marcelo) return;

    const dateStr = format(currentSimDate, 'yyyy-MM-dd');
    const mirrorDate = addDays(currentSimDate, -4);
    const mirrorStr = format(mirrorDate, 'yyyy-MM-dd');

    // Buscamos en los resultados que llevamos acumulados + los que ya había
    const workedMirror = [...assignments, ...simResults].some(a => a.personnel_id === marcelo.id && a.date === mirrorStr);
    
    const newLog = `Día ${format(currentSimDate, 'dd/MM')}: Mirando ${format(mirrorDate, 'dd/MM')}... ${workedMirror ? 'TRABAJÓ' : 'VACÍO'}`;
    const actionLog = workedMirror ? "-> Hoy DESCANSA" : "-> Hoy TRABAJA (NS22)";
    
    setSimLogs(prev => [...prev, newLog, actionLog]);

    if (!workedMirror) {
      // Si toca trabajar, lo añadimos a los resultados temporales de la simulación
      const referenceAssignment = assignments.find(a => a.personnel_id === marcelo.id && a.shift_id);
      setSimResults(prev => [...prev, {
        personnel_id: marcelo.id,
        date: dateStr,
        shift_id: referenceAssignment?.shift_id || 'ns22-id', // fallback
        area_id: referenceAssignment?.area_id || 'aero-id',
        is_manual: true
      }]);
    }

    const nextDay = addDays(currentSimDate, 1);
    if (nextDay > parseISO('2026-05-31T12:00:00Z')) {
      setCurrentSimDate(null);
      setSimLogs(prev => [...prev, "--- FIN DE LA SIMULACIÓN ---"]);
    } else {
      setCurrentSimDate(nextDay);
    }
  };

  const commitSimulation = async () => {
    // Aquí es donde realmente guardamos en la DB
    toast.loading("Guardando resultados de simulación...");
    try {
      // 1. Limpiar mayo para Marcelo
      const marcelo = personnel.find(p => p.first_name.toUpperCase().includes('MARCELO'));
      if (marcelo) {
        const mayoAssignments = assignments.filter(a => 
          a.personnel_id === marcelo.id && 
          a.date >= '2026-05-11' && 
          a.date <= '2026-05-31'
        );
        for (const a of mayoAssignments) {
          await deleteAssignment(a.id);
        }

        // 2. Crear los nuevos
        const airportArea = areas.find(a => a.name.toUpperCase().includes('AEROPUERTO'));
        const ns22Shift = shifts.find(s => s.name.includes('22:00'));

        for (const res of simResults) {
          const formData = new FormData();
          formData.append('personnel_id', res.personnel_id);
          formData.append('date', res.date);
          formData.append('shift_id', ns22Shift?.id || res.shift_id);
          formData.append('area_id', airportArea?.id || res.area_id);
          formData.append('position_id', marcelo.main_position);
          formData.append('is_manual', 'true');
          await createManualAssignment(formData);
        }
      }
      toast.dismiss();
      toast.success("Simulación aplicada con éxito");
      window.location.reload();
    } catch (e) {
      toast.error("Error al aplicar la simulación");
    }
  };

  const handleAudit = async () => {
    setAuditing(true);
    setSimLogs(["Generando reporte mensual...", "Esto puede tardar unos segundos..."]);
    try {
      const { getMonthlyAudit } = await import('@/app/(dashboard)/shifts/actions');
      const start = format(startOfMonth(monthDate), 'yyyy-MM-dd');
      
      const currentPersonnelIds = filteredPersonnel.map(p => p.id);
      
      const res = await getMonthlyAudit(start, areaFilter !== 'all' ? areaFilter : undefined, currentPersonnelIds, positionFilter || undefined) as any;
      
      if (res.success && res.auditSummary) {
        setAuditSummary(res.auditSummary);
        setIsAuditSummaryOpen(true);
        setAuditing(false);
      } else {
        toast.error("No se pudo generar el reporte.");
        setAuditing(false);
      }
    } catch (e) {
      toast.error("Error al generar reporte: " + (e as any).message);
      setAuditing(false);
    }
  };

  const playLogs = (logs: string[]) => {
    if (isStepMode) {
      setPendingLogs(logs);
      setSimLogs([]);
      // Mostrar el primer log inmediatamente
      if (logs.length > 0) {
        setSimLogs([logs[0]]);
        setPendingLogs(logs.slice(1));
      }
      return;
    }

    let i = 0;
    setSimLogs([]);
    const interval = setInterval(() => {
      if (i >= logs.length) {
        clearInterval(interval);
        setAuditing(false);
        return;
      }
      setSimLogs(prev => [...prev, logs[i]]);
      i++;
    }, 50);
  };

  const nextStep = () => {
    if (pendingLogs.length === 0) {
      setAuditing(false);
      setSimLogs(prev => [...prev, "✅ AUDITORÍA FINALIZADA"]);
      return;
    }
    const next = pendingLogs[0];
    setSimLogs(prev => [...prev, next]);
    setPendingLogs(prev => prev.slice(1));
  };

  const runPureMath4x4 = async () => {
    try {
      const marcelo = personnel.find(p => p.first_name.toUpperCase().includes('MARCELO'));
      if (!marcelo) {
        toast.error("No se encontró a Marcelo");
        return;
      }

      // 1. Limpiar todo lo actual de MAYO del 11 al 31
      const toDelete = assignments.filter(a => {
        const aDate = parseISO(a.date);
        return a.personnel_id === marcelo.id && 
               format(aDate, 'yyyy-MM') === '2026-05' && 
               parseInt(format(aDate, 'dd')) >= 11;
      });

      for (const a of toDelete) {
        await deleteAssignment(a.id);
      }

      // 2. Loop matemático puro
      // En lugar de buscar por nombre, usamos el cargo y el turno que YA tiene Marcelo en sus días previos
      const referenceAssignment = assignments.find(a => a.personnel_id === marcelo.id && a.shift_id);
      const airportAreaId = referenceAssignment?.area_id || areas.find(a => a.name.toUpperCase().includes('AEROPUERTO'))?.id;
      const ns22ShiftId = referenceAssignment?.shift_id || shifts.find(s => s.name.includes('22:00'))?.id;

      if (!airportAreaId || !ns22ShiftId) {
        toast.error("No se pudo detectar el Area o Turno de referencia");
        return;
      }

      // Referencia de assignments para el espejo
      const currentAssignments = [...assignments];

      for (let d = 11; d <= 31; d++) {
        const dateStr = `2026-05-${d.toString().padStart(2, '0')}`;
        const currentDate = parseISO(dateStr);
        const mirrorDate = addDays(currentDate, -4);
        const mirrorStr = format(mirrorDate, 'yyyy-MM-dd');

        // ¿Hubo turno hace 4 días?
        const workedMirror = currentAssignments.some(a => a.personnel_id === marcelo.id && a.date === mirrorStr);

        if (!workedMirror) {
          // Si el espejo está VACÍO, ASIGNAMOS TURNO
          const formData = new FormData();
          formData.append('personnel_id', marcelo.id);
          formData.append('date', dateStr);
          formData.append('shift_id', ns22ShiftId);
          formData.append('area_id', airportAreaId);
          formData.append('position_id', marcelo.main_position);
          formData.append('is_manual', 'false');
          
          await createManualAssignment(formData);
          // Actualizamos localmente para el siguiente paso del loop
          currentAssignments.push({
            id: 'temp-' + d,
            personnel_id: marcelo.id,
            date: dateStr,
            shift_id: ns22ShiftId,
            area_id: airportAreaId,
            position_id: marcelo.main_position,
            is_manual: false
          } as any);
        }
      }
      
      toast.success("Matemática 4x4 aplicada correctamente");
      window.location.reload();
    } catch (error) {
      console.error(error);
      toast.error("Error en el loop matemático");
    }
  };

  const runAudit4x4 = () => {
    const results: any[] = [];
    const marcelo = personnel.find(p => p.first_name.toUpperCase().includes('MARCELO'));
    if (!marcelo) return;

    const pAssignments = assignments.filter(a => a.personnel_id === marcelo.id);
    const assignedDates = new Set(pAssignments.map(a => a.date));
    const startDate = parseISO('2026-05-11T12:00:00Z');
    const endDate = parseISO('2026-05-31T12:00:00Z');
    const auditDays = eachDayOfInterval({ start: startDate, end: endDate });

    auditDays.forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const mirrorDate = addDays(day, -4);
      const mirrorStr = format(mirrorDate, 'yyyy-MM-dd');
      
      const workedMirror = assignedDates.has(mirrorStr);
      const mirrorShift = workedMirror ? pAssignments.find(a => a.date === mirrorStr) : null;
      const shiftName = mirrorShift ? (shifts.find(s => s.id === mirrorShift.shift_id)?.name || 'TURNO') : 'VACÍO';

      results.push({
        date: dateStr,
        dayNum: format(day, 'dd'),
        mirrorDayNum: format(mirrorDate, 'dd'),
        mirrorStatus: shiftName,
        canAssign: !workedMirror,
        explanation: `${format(day, 'dd')} - 4 = ${format(mirrorDate, 'dd')}`
      });
    });

    setAudit4x4Data(results);
    setIsAudit4x4Open(true);
  };

  const handleSaveAssignment = (formData: FormData) => {
    if (selectedCells.length === 0) return;
    
    const shiftId = formData.get('shift_id') as string;
    const positionId = formData.get('position_id') as string;
    const areaId = formData.get('area_id') as string;

    startTransition(async () => {
      // Group by person to avoid too many calls, or we can update createManualAssignment to handle multiple people
      // For now, let's group by person and call sequentially or better yet, I should have updated createManualAssignment.
      // Actually, since I have the tools, let's keep it simple and just loop or use a promise.all
      
      const peopleMap = selectedCells.reduce((acc, cell) => {
        if (!acc[cell.personId]) acc[cell.personId] = [];
        acc[cell.personId].push(cell.dateStr);
        return acc;
      }, {} as Record<string, string[]>);

      let hasError = false;
      for (const [pId, dates] of Object.entries(peopleMap)) {
        const batchData = new FormData();
        batchData.set('personnel_id', pId);
        batchData.set('date', dates.join(','));
        batchData.set('shift_id', shiftId);
        batchData.set('position_id', positionId);
        batchData.set('area_id', areaId);
        
        const res = await createManualAssignment(batchData);
        if (res.error) {
          toast.error(`Error en ${pId}: ${res.error}`);
          hasError = true;
        }
      }

      if (!hasError) {
        toast.success(`${selectedCells.length} asignaciones guardadas`);
        setSelectedCell(null);
        setSelectedCells([]);
        setIsAssignmentDialogOpen(false);
        router.refresh();
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

  const handleBulkDelete = () => {
    if (selectedCells.length === 0) return;
    
    if (!confirm(`¿Eliminar las ${selectedCells.length} asignaciones seleccionadas?`)) return;

    startTransition(async () => {
      const idsToDelete = assignments
        .filter(a => selectedCells.some(c => c.personId === a.personnel_id && c.dateStr === a.date))
        .map(a => a.id);

      if (idsToDelete.length === 0) {
        // If no assignments exist for the selected empty cells, just clear selection
        setSelectedCells([]);
        return;
      }

      const { bulkDeleteAssignmentsByIds } = await import('@/app/(dashboard)/shifts/actions');
      const res = await bulkDeleteAssignmentsByIds(idsToDelete);
      
      if (res.error) toast.error(res.error);
      else {
        toast.success(`${idsToDelete.length} asignaciones eliminadas`);
        setSelectedCells([]);
        setSelectedCell(null);
      }
    });
  };

  // ─── Administration & DND Handlers ──────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, assignment: Assignment) => {
    setDraggingAssignment(assignment);
    e.dataTransfer.setData('assignmentId', assignment.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, personId: string, targetDate: string) => {
    e.preventDefault();
    if (!draggingAssignment || draggingAssignment.personnel_id !== personId) {
      if (draggingAssignment && draggingAssignment.personnel_id !== personId) {
        toast.error('Solo puedes mover turnos dentro de la misma persona');
      }
      setDraggingAssignment(null);
      return;
    }

    if (draggingAssignment.date === targetDate) {
      setDraggingAssignment(null);
      return;
    }

    if (draggingAssignment.is_validated) {
      setReasonDialogOpen({ 
        open: true, 
        assignment: draggingAssignment, 
        newDate: targetDate 
      });
    } else {
      startTransition(async () => {
        const res = await moveAssignment(draggingAssignment.id, targetDate);
        if (res.success) {
          toast.success('Turno movido');
          router.refresh();
        } else {
          toast.error(res.error || 'Error al mover turno');
        }
      });
    }
    setDraggingAssignment(null);
  }, [draggingAssignment, moveAssignment, router]);

  const handleConfirmMoveWithReason = () => {
    if (!reasonDialogOpen.assignment) return;
    
    startTransition(async () => {
      const res = await moveAssignment(
        reasonDialogOpen.assignment!.id, 
        reasonDialogOpen.newDate, 
        pushedReason
      );
      if (res.success) {
        toast.success('Turno movido y auditado');
        setReasonDialogOpen({ open: false, assignment: null, newDate: '' });
        setPushedReason('');
        router.refresh();
      } else {
        toast.error(res.error || 'Error al mover');
      }
    });
  };

  const handleValidateSelection = () => {
    if (selectedCells.length === 0) {
       toast.error('Selecciona turnos primero (clic en las celdas)');
       return;
    }

    const idsToValidate = assignments
      .filter(a => selectedCells.some(c => c.personId === a.personnel_id && c.dateStr === a.date) && !a.is_validated)
      .map(a => a.id);

    if (idsToValidate.length === 0) {
      toast.info('No hay turnos pendientes de validación en la selección');
      return;
    }

    startTransition(async () => {
      const res = await validateAssignments(idsToValidate);
      if (res.success) {
        toast.success(`${idsToValidate.length} turnos validados`);
        setSelectedCells([]);
        router.refresh();
      } else {
        toast.error(res.error || 'Error al validar');
      }
    });
  };

  const handleUnpublishSelection = () => {
    if (selectedCells.length === 0) {
       toast.error('Selecciona turnos primero (clic en las celdas)');
       return;
    }

    const idsToUnpublish = assignments
      .filter(a => selectedCells.some(c => c.personId === a.personnel_id && c.dateStr === a.date) && a.is_published)
      .map(a => a.id);

    if (idsToUnpublish.length === 0) {
      toast.info('No hay turnos publicados en la selección');
      return;
    }

    startTransition(async () => {
      const { unpublishAssignments } = await import('@/app/(dashboard)/shifts/actions');
      const res = await unpublishAssignments(idsToUnpublish);
      if (res.success) {
        toast.success(`${idsToUnpublish.length} turnos despublicados`);
        setSelectedCells([]);
        router.refresh();
      } else {
        toast.error(res.error || 'Error al despublicar');
      }
    });
  };

  const handlePublishSelection = (skipWhatsApp = false) => {
    if (selectedCells.length === 0) {
       toast.error('Selecciona turnos primero (clic en las celdas)');
       return;
    }

    const idsToPublish = assignments
      .filter(a => selectedCells.some(c => c.personId === a.personnel_id && c.dateStr === a.date) && !a.is_published)
      .map(a => a.id);

    if (idsToPublish.length === 0) {
      toast.info('No hay turnos pendientes por publicar en la selección');
      return;
    }

    startTransition(async () => {
      const { publishAssignments } = await import('@/app/(dashboard)/shifts/actions');
      const res = await publishAssignments(idsToPublish, undefined, undefined, { skipWhatsApp }) as any;
      if (res.success) {
        if (skipWhatsApp) {
          toast.success(`${idsToPublish.length} turnos publicados (sin notificación WhatsApp)`);
        } else {
          const notified: string[] = res.notifiedWorkers || [];
          const skipped: string[] = res.skippedWorkers || [];
          const failed: string[] = res.failedWorkers || [];

          if (notified.length > 0) {
            toast.success(
              <div>
                <p className="font-bold">{idsToPublish.length} turnos publicados</p>
                <p className="text-xs text-slate-500 mt-1">✅ WhatsApp enviado a: <strong>{notified.join(', ')}</strong></p>
                {skipped.length > 0 && <p className="text-xs text-amber-600 mt-1">⚠️ Sin teléfono: {skipped.join(', ')}</p>}
                {failed.length > 0 && <p className="text-xs text-red-600 mt-1">❌ Error envío: {failed.join(', ')}</p>}
              </div>,
              { duration: 6000 }
            );
          } else if (skipped.length > 0) {
            toast.warning(
              <div>
                <p className="font-bold">{idsToPublish.length} turnos publicados</p>
                <p className="text-xs mt-1">⚠️ No se pudo notificar — sin número de teléfono: <strong>{skipped.join(', ')}</strong></p>
                <p className="text-xs text-slate-400 mt-0.5">Agrega el teléfono en el perfil de cada persona</p>
              </div>,
              { duration: 8000 }
            );
          } else if (failed.length > 0) {
            toast.error(
              <div>
                <p className="font-bold">{idsToPublish.length} turnos publicados</p>
                <p className="text-xs mt-1">❌ Error al enviar WhatsApp a: <strong>{failed.join(', ')}</strong></p>
              </div>,
              { duration: 6000 }
            );
          } else {
            toast.success(`${idsToPublish.length} turnos publicados (sin cambios de turno detectados)`);
          }
        }
        setSelectedCells([]);
        router.refresh();
      } else {
        toast.error(res.error || 'Error al publicar');
      }
    });
  };

  const handlePublishRange = (skipWhatsApp = false) => {
    const start = format(days[0], 'yyyy-MM-dd');
    const end = format(days[days.length - 1], 'yyyy-MM-dd');
    
    const confirmMsg = skipWhatsApp
      ? `¿Publicar todos los turnos visibles (${start} al ${end}) SIN enviar WhatsApp?`
      : `¿Publicar todos los turnos visibles (${start} al ${end})?`;
    if (!confirm(confirmMsg)) return;

    const personnelIds = new Set(filteredPersonnel.map(p => p.id));
    const dateStrings = new Set(days.map(d => format(d, 'yyyy-MM-dd')));

    const idsToPublish = assignments
      .filter(a => personnelIds.has(a.personnel_id) && dateStrings.has(a.date) && !a.is_published)
      .map(a => a.id);

    if (idsToPublish.length === 0) {
      toast.info("No hay turnos pendientes por publicar en este rango.");
      return;
    }

    startTransition(async () => {
      const { publishAssignments } = await import('@/app/(dashboard)/shifts/actions');
      const res = await publishAssignments(idsToPublish, undefined, undefined, { skipWhatsApp }) as any;
      if (res.success) {
        if (skipWhatsApp) {
          toast.success(`${idsToPublish.length} turnos publicados con éxito (sin notificación WhatsApp)`);
        } else {
          const notified: string[] = res.notifiedWorkers || [];
          const skipped: string[] = res.skippedWorkers || [];
          const failed: string[] = res.failedWorkers || [];

          if (notified.length > 0) {
            toast.success(
              <div>
                <p className="font-bold">{idsToPublish.length} turnos publicados con éxito</p>
                <p className="text-xs text-slate-500 mt-1">✅ WhatsApp enviado a: <strong>{notified.join(', ')}</strong></p>
                {skipped.length > 0 && <p className="text-xs text-amber-600 mt-1">⚠️ Sin teléfono: {skipped.join(', ')}</p>}
                {failed.length > 0 && <p className="text-xs text-red-600 mt-1">❌ Error: {failed.join(', ')}</p>}
              </div>,
              { duration: 6000 }
            );
          } else if (skipped.length > 0) {
            toast.warning(
              <div>
                <p className="font-bold">{idsToPublish.length} turnos publicados</p>
                <p className="text-xs mt-1">⚠️ Sin número de teléfono: <strong>{skipped.join(', ')}</strong></p>
              </div>,
              { duration: 8000 }
            );
          } else {
            toast.success(`${idsToPublish.length} turnos publicados con éxito (sin cambios para notificar)`);
          }
        }
        router.refresh();
      } else {
        toast.error(res.error || 'Error al publicar');
      }
    });
  };

  const handleValidateVisible = () => {
    const personnelIds = new Set(filteredPersonnel.map(p => p.id));
    const dateStrings = new Set(days.map(d => format(d, 'yyyy-MM-dd')));

    const idsToValidate = assignments
      .filter(a => personnelIds.has(a.personnel_id) && dateStrings.has(a.date) && !a.is_validated)
      .map(a => a.id);

    if (idsToValidate.length === 0) {
      toast.info('No hay turnos pendientes de validación en esta vista');
      return;
    }

    if (!confirm(`¿Validar los ${idsToValidate.length} turnos visibles?`)) return;

    startTransition(async () => {
      // Chunking to avoid "URI too long" / payload size issues
      const CHUNK_SIZE = 200;
      let successCount = 0;
      let hasError = false;

      for (let i = 0; i < idsToValidate.length; i += CHUNK_SIZE) {
        const chunk = idsToValidate.slice(i, i + CHUNK_SIZE);
        const res = await validateAssignments(chunk);
        if (res.success) {
          successCount += chunk.length;
        } else {
          toast.error(res.error || `Error en lote ${Math.floor(i/CHUNK_SIZE) + 1}`);
          hasError = true;
          break;
        }
      }

      if (!hasError) {
        toast.success(`${successCount} turnos validados correctamente`);
        router.refresh();
      }
    });
  };

  const handleSendTodayNotifications = async () => {
    if (isTodayNotifSent || isSendingTodayNotif) return;
    setIsSendingTodayNotif(true);
    try {
      // Step 1: Preview — show who will receive messages
      const preview = await (previewTodayChangeNotifications as any)() as {
        success: boolean; error?: string;
        workers: Array<{ name: string; date: string; shift: string; alreadyNotified: boolean }>;
      };

      if (!preview.success) {
        toast.error(preview.error || 'Error al obtener previsualización');
        return;
      }

      const pending = preview.workers.filter((w: any) => !w.alreadyNotified);
      const alreadySent = preview.workers.filter((w: any) => w.alreadyNotified);

      if (pending.length === 0) {
        toast.info(
          alreadySent.length > 0
            ? `Todos los cambios de hoy ya fueron notificados (${alreadySent.length} persona${alreadySent.length > 1 ? 's' : ''}).`
            : 'No se encontraron cambios manuales publicados hoy.',
          { duration: 6000 }
        );
        setIsTodayNotifSent(true);
        return;
      }

      // Step 2: Show confirmation with names
      const lines = pending.map((w: any) => `• ${w.name} — ${w.shift} (${w.date})`).join('\n');
      const alreadyLine = alreadySent.length > 0
        ? `\n\n(${alreadySent.length} persona${alreadySent.length > 1 ? 's' : ''} ya recibió notificación y NO se le reenviará.)`
        : '';
      const confirmed = confirm(
        `Se enviará WhatsApp a ${pending.length} persona${pending.length > 1 ? 's' : ''}:\n\n${lines}${alreadyLine}\n\n¿Confirmar envío?`
      );
      if (!confirmed) return;

      // Step 3: Send
      const res = await sendTodayChangeNotifications() as any;
      if (res.success) {
        setIsTodayNotifSent(true);
        if (res.notifiedWorkers && res.notifiedWorkers.length > 0) {
          toast.success(
            <div>
              <p className="font-bold">✅ Notificaciones enviadas</p>
              <p className="text-xs text-slate-500 mt-1">
                WhatsApp enviado a: <strong>{res.notifiedWorkers.join(', ')}</strong>
              </p>
            </div>,
            { duration: 8000 }
          );
        } else {
          toast.info(`No se encontraron cambios manuales sin notificar hoy.`);
          setIsTodayNotifSent(true);
        }
      } else {
        toast.error(res.error || 'Error al enviar notificaciones');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error inesperado');
    } finally {
      setIsSendingTodayNotif(false);
    }
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
            {filteredPersonnelForSelect.map(p => (
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
           <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 pr-1"
            onClick={prevMonth}
           >
              <ChevronLeft className="h-4 w-4" />
           </Button>
           
           <Input 
            type="month"
            className="h-8 w-[140px] text-xs border-none bg-secondary/30 focus-visible:ring-0"
            value={format(monthDate, 'yyyy-MM')}
            onChange={(e) => {
              const val = e.target.value;
              if (val) goToMonth(new Date(val + '-01T00:00:00'));
            }}
           />

           <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 pl-1"
            onClick={nextMonth}
           >
              <ChevronRight className="h-4 w-4" />
           </Button>
        </div>

        {/* AI Test Controls */}
        <div className="flex items-center gap-2 border-l pl-3 ml-auto border-slate-200">
          {/* Modal del Simulador F8 (Ahora oculto el botón de trigger para limpiar UI) */}
          <Dialog open={isStepSimOpen} onOpenChange={setIsStepSimOpen}>
            <DialogContent className="max-w-md bg-white">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-blue-600" />
                  Simulador 4x4 (Depuración F8)
                </DialogTitle>
              </DialogHeader>

              {/* Rango de Auditoría */}
              <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase text-slate-500 font-bold">Desde</Label>
                  <Input 
                    type="date" 
                    className="h-8 text-xs" 
                    value={planningRange.from} 
                    onChange={(e) => setPlanningRange(prev => ({ ...prev, from: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase text-slate-500 font-bold">Hasta</Label>
                  <Input 
                    type="date" 
                    className="h-8 text-xs" 
                    value={planningRange.to} 
                    onChange={(e) => setPlanningRange(prev => ({ ...prev, to: e.target.value }))}
                  />
                </div>
              </div>
              
              <div 
                className="bg-slate-900 text-green-400 p-4 rounded-md font-mono text-sm h-64 overflow-y-auto mb-4"
                ref={(el) => {
                  if (el) el.scrollTop = el.scrollHeight;
                }}
              >
                {simLogs.map((log, i) => (
                  <div key={i} className={(log?.startsWith?.('->') || log?.includes?.('TRABAJA')) ? 'text-yellow-300 ml-4 mb-2' : 'mb-1'}>
                    {log}
                  </div>
                ))}
                {currentSimDate && (
                  <div className="animate-pulse text-white mt-2">
                    _ Esperando F8...
                  </div>
                )}
              </div>

              <div className="flex justify-between gap-3">
                <Button variant="ghost" onClick={() => setIsStepSimOpen(false)}>
                  Cancelar
                </Button>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      navigator.clipboard.writeText(simLogs.join('\n'));
                      toast.success("Logs copiados al portapapeles");
                    }}
                    className="border-slate-300 text-slate-600"
                  >
                    COPIAR LOGS
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsStepMode(!isStepMode)}
                    className={isStepMode ? "bg-amber-500/20 border-amber-500 text-amber-500" : ""}
                  >
                    {isStepMode ? "MODO MANUAL (F8 ON)" : "MODO AUTOMÁTICO"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAudit}
                    disabled={auditing}
                  >
                    {auditing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        AUDITANDO...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        AUDITAR IA REAL
                      </>
                    )}
                  </Button>
                  {isStepMode && pendingLogs.length > 0 && (
                    <Button
                      size="sm"
                      onClick={nextStep}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold animate-pulse"
                    >
                      SIGUIENTE PASO (F8) →
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-1 border-l pl-3 ml-auto border-slate-200">
            <Button 
              variant="default" 
              size="sm" 
              className="h-9 bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 shadow-sm"
              onClick={() => {
                const isCurrentMonth = format(new Date(), 'yyyy-MM') === format(monthDate, 'yyyy-MM');
                setPlanningRange({
                  from: isCurrentMonth ? format(new Date(), 'yyyy-MM-dd') : format(days[0], 'yyyy-MM-dd'),
                  to: format(days[days.length - 1], 'yyyy-MM-dd')
                });
                setAiActionMode('needs');
                setIsAiConfigOpen(true);
              }}
              disabled={isPending}
            >
              <Calendar className="h-4 w-4 mr-2" />
              Necesidades
            </Button>
            
            <Button 
              variant="default" 
              size="sm" 
              className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-4 shadow-sm"
              onClick={() => {
                const isCurrentMonth = format(new Date(), 'yyyy-MM') === format(monthDate, 'yyyy-MM');
                setPlanningRange({
                  from: isCurrentMonth ? format(new Date(), 'yyyy-MM-dd') : format(days[0], 'yyyy-MM-dd'),
                  to: format(days[days.length - 1], 'yyyy-MM-dd')
                });
                setAiActionMode('scheduling');
                setIsAiConfigOpen(true);
              }}
              disabled={isPending || aiStep === 'scheduling'}
            >
              {isPending && aiStep !== 'completed' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
              Asistente IA
            </Button>

            <Button 
              variant="outline" 
              size="sm" 
              className="h-9 border-orange-500 bg-orange-50/30 text-orange-700 hover:bg-orange-50 text-xs font-bold uppercase shadow-sm px-4"
              onClick={handleAudit}
            >
              <FileText className="h-4 w-4 mr-2 text-orange-500" />
              Reporte Mensual
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-9 border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold shadow-sm px-3"
              onClick={async () => {
                const { generateRosterPDF } = await import('./generate-roster-pdf');
                const monthLabelStr = format(monthDate, "MMMM yyyy", { locale: es });
                generateRosterPDF({
                  personnel: filteredPersonnel,
                  assignments,
                  shifts,
                  areas,
                  positions,
                  leaves,
                  days,
                  monthLabel: monthLabelStr.charAt(0).toUpperCase() + monthLabelStr.slice(1),
                  areaFilter: areaFilter !== 'all' ? areaFilter : undefined,
                  positionFilter: positionFilter || undefined,
                });
              }}
              title="Descargar roster mensual en PDF"
            >
              <Download className="h-4 w-4 mr-1.5 text-slate-500" />
              PDF
            </Button>

            <div className="flex items-center gap-1 border-l pl-3 ml-1 border-slate-200">
               <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-xs px-2"
                  onClick={handleValidateVisible}
                  disabled={isPending}
                  title="Validar todos los turnos visibles en la grilla"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-indigo-600" />
                  Validar Todo
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="inline-flex items-center justify-center rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 h-8 px-3 ml-1"
                    disabled={isPending}
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                    Publicar
                    <ChevronDown className="h-3 w-3 ml-1 opacity-60" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => handlePublishRange(false)} className="cursor-pointer">
                      <Sparkles className="h-4 w-4 mr-2 text-emerald-600" />
                      <div>
                        <p className="font-medium">Publicar y Notificar</p>
                        <p className="text-xs text-muted-foreground">Publica y envía WhatsApp</p>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handlePublishRange(true)} className="cursor-pointer">
                      <MessageCircleOff className="h-4 w-4 mr-2 text-slate-500" />
                      <div>
                        <p className="font-medium">Solo Publicar</p>
                        <p className="text-xs text-muted-foreground">Sin enviar WhatsApp</p>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {/* One-shot button: send today's change notifications retroactively */}
                {!isTodayNotifSent && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs ml-1 font-semibold shadow-sm animate-pulse"
                    onClick={handleSendTodayNotifications}
                    disabled={isSendingTodayNotif}
                    title="Reenviar notificaciones WhatsApp de cambios realizados hoy (uso único)"
                  >
                    {isSendingTodayNotif
                      ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      : <Send className="h-3.5 w-3.5 mr-1 text-amber-600" />
                    }
                    {isSendingTodayNotif ? 'Enviando...' : 'Notificar Hoy'}
                  </Button>
                )}
            </div>

            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 text-red-500 border-red-200 hover:bg-red-50 text-xs ml-2"
              onClick={handleClearAI}
              disabled={isPending}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Limpiar
            </Button>
          </div>
        )}

        {readOnly && (
          <div className="ml-auto flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="h-9 border-orange-500 bg-orange-50/30 text-orange-700 hover:bg-orange-50 text-xs font-bold uppercase shadow-sm px-4"
              onClick={handleAudit}
            >
              <FileText className="h-4 w-4 mr-2 text-orange-500" />
              Reporte Mensual
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold shadow-sm px-3"
              onClick={async () => {
                const { generateRosterPDF } = await import('./generate-roster-pdf');
                const monthLabelStr = format(monthDate, "MMMM yyyy", { locale: es });
                generateRosterPDF({
                  personnel: filteredPersonnel,
                  assignments,
                  shifts,
                  areas,
                  positions,
                  leaves,
                  days,
                  monthLabel: monthLabelStr.charAt(0).toUpperCase() + monthLabelStr.slice(1),
                  areaFilter: areaFilter !== 'all' ? areaFilter : undefined,
                  positionFilter: positionFilter || undefined,
                });
              }}
              title="Descargar roster mensual en PDF"
            >
              <Download className="h-4 w-4 mr-1.5 text-slate-500" />
              PDF
            </Button>
            <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-200 font-bold uppercase text-[9px] px-2 py-1">
              Modo Solo Lectura
            </Badge>
          </div>
        )}
      </div>

      {/* Visual Management Legend for Operador Aeropuerto */}
      {(positionFilter?.toUpperCase().includes('AEROPUERTO') || filteredPersonnel.some(p => (positionsMap[p.main_position]?.name || '').toUpperCase().includes('AEROPUERTO'))) && (
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl text-xs flex-wrap shadow-sm">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-1">Gestión Visual Aeropuerto (Borrador):</span>
          <span className="flex items-center gap-1.5 font-bold text-amber-950 bg-amber-100/90 border border-amber-400 px-2 py-0.5 rounded-lg text-[10px] shadow-xs">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0 shadow-xs" /> AM 04 (Madrugada)
          </span>
          <span className="flex items-center gap-1.5 font-bold text-sky-950 bg-sky-100/90 border border-sky-400 px-2 py-0.5 rounded-lg text-[10px] shadow-xs">
            <div className="w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0 shadow-xs" /> AM 07 (Mañana)
          </span>
          <span className="flex items-center gap-1.5 font-bold text-purple-950 bg-purple-100/90 border border-purple-400 px-2 py-0.5 rounded-lg text-[10px] shadow-xs">
            <div className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0 shadow-xs" /> PM 13:30 (Tarde)
          </span>
          <span className="flex items-center gap-1.5 font-bold text-white bg-slate-800 border border-slate-950 px-2 py-0.5 rounded-lg text-[10px] shadow-xs">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0 shadow-xs" /> NS 22 (Noche)
          </span>
          <span className="flex items-center gap-1.5 font-bold text-emerald-950 bg-emerald-100/90 border border-emerald-400 px-2 py-0.5 rounded-lg text-[10px] shadow-xs">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 shadow-xs" /> AM 08 / Intermedio
          </span>
          <span className="flex items-center gap-1.5 font-bold text-rose-950 bg-rose-100/90 border border-rose-400 px-2 py-0.5 rounded-lg text-[10px] shadow-xs">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0 shadow-xs" /> AM 05 (DHL)
          </span>
        </div>
      )}

      {/* Roster Grid Wrapper */}
      <div className="flex-1 overflow-hidden border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 shadow-md">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-320px)]">
          <table className="w-full border-collapse table-fixed min-w-[2000px]">
            <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-900 shadow-sm">
              <tr>
                <th className="sticky left-0 z-30 w-[240px] p-3 text-left font-semibold text-slate-600 dark:text-slate-300 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                   <div className="flex items-center gap-2">
                     <input 
                       type="checkbox" 
                       className="h-3.5 w-3.5 rounded border-slate-300"
                       onChange={handleToggleAll}
                       checked={filteredPersonnel.length > 0 && filteredPersonnel.every(p => days.every(day => {
                         const d = format(day, 'yyyy-MM-dd');
                         if ((p.termination_date && d > p.termination_date) || (p.hire_date && d < p.hire_date)) return true;
                         return selectedCells.some(c => c.personId === p.id && c.dateStr === d);
                       }))}
                     />
                     Trabajador
                   </div>
                </th>
                {days.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  return (
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
                        <input 
                          type="checkbox" 
                          className="h-3 w-3 mt-1 rounded border-slate-300"
                          onChange={() => handleToggleColumn(dateStr)}
                          checked={filteredPersonnel.length > 0 && filteredPersonnel.every(p => {
                            if ((p.termination_date && dateStr > p.termination_date) || (p.hire_date && dateStr < p.hire_date)) return true;
                            return selectedCells.some(c => c.personId === p.id && c.dateStr === dateStr);
                          })}
                        />
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <TooltipProvider delay={400}>
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
                  const dateReqs = requirementsByDate[dateStr] || [];
                  const dailyReqs = dateReqs.filter(r => {
                    if (areaFilter && areaFilter !== "none") {
                      if (r.area_id !== areaFilter) return false;
                    }
                    
                    if (positionFilter && positionFilter !== "none") {
                      const reqName = r.position?.name?.toUpperCase() || "";
                      if (positionFilter.toUpperCase() !== reqName) return false;
                    }
                    return true;
                  });

                  const dailyReqTotal = dailyReqs.reduce((sum, r) => sum + r.required_count, 0);

                  // Filter assignments based on shown positions
                  const dateAssignments = assignmentsByDate[dateStr] || [];
                  const dailyAssignments = dateAssignments.filter(a => {
                    if (positionFilter && positionFilter !== "none") {
                      const assignPosName = positionsMap[a.position_id]?.name?.toUpperCase() || "";
                      return positionFilter.toUpperCase() === assignPosName;
                    }
                    return true;
                  }).length;

                  const isUndercovered = dailyAssignments < dailyReqTotal;
                  
                  // Detail for tooltip/audit
                  const shiftBreakdown = dailyReqs.map(r => {
                    const shift = shiftsMap[r.shift_id];
                    const count = dateAssignments.filter(a => {
                      if (a.shift_id !== r.shift_id) return false;
                      if (!positionFilter) return true;
                      const pName = positionsMap[a.position_id]?.name?.toUpperCase() || "";
                      return pName === positionFilter.toUpperCase();
                    }).length;
                    return `${shift?.name || 'Turno'}: ${count}/${r.required_count}`;
                  }).join(' | ');

                  return (
                    <td key={`coverage-${dateStr}`} 
                        title={shiftBreakdown}
                        onClick={() => setCoverageDialog({ dateStr, day })}
                        className={cn(
                      "p-2 text-center border-r border-slate-200 dark:border-slate-800 transition-colors cursor-pointer hover:brightness-95 active:scale-95",
                      isUndercovered 
                        ? "bg-red-500/10 dark:bg-red-900/40 border-red-200 dark:border-red-900 shadow-inner" 
                        : "bg-slate-50/80 dark:bg-slate-900",
                      isToday(day) && "ring-2 ring-inset ring-orange-400/30"
                    )}>
                      <div className="flex flex-col items-center">
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
                <PersonnelRow 
                  key={person.id}
                  person={person}
                  days={days}
                  assignmentsMap={assignmentsMap}
                  shiftsMap={shiftsMap}
                  areasMap={areasMap}
                  positionsMap={positionsMap}
                  leavesMap={leavesMap}
                  positions={positions}
                  selectedCells={selectedCells}
                  draggingAssignment={draggingAssignment}
                  handleToggleRow={handleToggleRow}
                  handleCellClick={handleCellClick}
                  handleDragOver={handleDragOver}
                  handleDrop={handleDrop}
                  handleDragStart={handleDragStart}
                />
              ))}
            </tbody>
            </TooltipProvider>
          </table>
        </div>
      </div>

      {/* Assignment Dialog */}
      <Dialog open={isAssignmentDialogOpen} onOpenChange={setIsAssignmentDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-orange-600" />
              {selectedCells.length > 1 ? (
                <span>Asignar {selectedCells.length} espacios seleccionados</span>
              ) : (
                selectedCell && format(selectedCell.date, 'PPP', { locale: es })
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
             <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 relative">
                   <UserIcon className="h-5 w-5" />
                   {selectedCell?.person.address && (
                     <div className="absolute -top-1 -right-1 bg-white dark:bg-slate-900 rounded-full p-0.5 shadow-sm border border-orange-100">
                        <MapPin className="h-2.5 w-2.5 text-indigo-500" />
                     </div>
                   )}
                </div>
                <div className="flex-1 min-w-0">
                   <p className="font-semibold truncate">{selectedCell?.person.first_name} {selectedCell?.person.last_name_father}</p>
                   <div className="flex flex-col">
                     <p className="text-[10px] text-muted-foreground uppercase font-bold">{selectedCell?.person.rotation_pattern || 'Asignación Manual'}</p>
                     {selectedCell?.person.address && (
                       <p className="text-[10px] text-indigo-600 font-medium truncate mt-0.5 flex items-center gap-1">
                         <MapPin className="h-3 w-3" />
                         {(() => {
                           const addr = selectedCell.person.address;
                           if (typeof addr === 'string') return addr;
                           const parts = [addr.street, addr.city, addr.region || addr.commune].filter(Boolean);
                           return parts.length > 0 ? parts.join(', ') : "Dirección incompleta";
                         })()}
                       </p>
                     )}
                   </div>
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

             {selectedCells.length === 1 && selectedCell && assignments.find(a => a.personnel_id === selectedCell.person.id && a.date === format(selectedCell.date, 'yyyy-MM-dd')) && (
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
            <Button variant="outline" onClick={() => {
              setIsAssignmentDialogOpen(false);
              setSelectedCell(null);
              setSelectedCells([]);
            }}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              form="assign-form" 
              disabled={isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Guardar {selectedCells.length > 1 ? `(${selectedCells.length} celdas)` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Selection Floating Bar */}
      {selectedCells.length > 0 && !selectedCell && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-6">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Selección</span>
              <span className="text-lg font-black">{selectedCells.length} espacios marcados</span>
            </div>
            <div className="h-10 w-[1px] bg-slate-700" />
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                className="text-white hover:bg-white/10"
                onClick={() => {
                  setSelectedCells([]);
                }}
              >
                Limpiar
              </Button>
              <Button 
                variant="outline"
                className="text-red-400 border-red-500/50 hover:bg-red-500/10 hover:text-red-300 gap-2"
                onClick={handleBulkDelete}
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </Button>
              <Button 
                variant="outline"
                className="text-indigo-400 border-indigo-500/50 hover:bg-indigo-50/10 hover:text-indigo-300 gap-2"
                onClick={handleValidateSelection}
              >
                <CheckCircle2 className="h-4 w-4" />
                Validar
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-emerald-500/50 text-emerald-400 hover:bg-emerald-50/10 hover:text-emerald-300 h-9 px-4 gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  Publicar
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => handlePublishSelection(false)} className="cursor-pointer">
                    <Sparkles className="h-4 w-4 mr-2 text-emerald-600" />
                    <div>
                      <p className="font-medium">Publicar y Notificar</p>
                      <p className="text-xs text-muted-foreground">Publica y envía WhatsApp</p>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handlePublishSelection(true)} className="cursor-pointer">
                    <MessageCircleOff className="h-4 w-4 mr-2 text-slate-500" />
                    <div>
                      <p className="font-medium">Solo Publicar</p>
                      <p className="text-xs text-muted-foreground">Sin enviar WhatsApp</p>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button 
                variant="outline"
                className="text-slate-400 border-slate-500/50 hover:bg-slate-50/10 hover:text-slate-300 gap-2"
                onClick={handleUnpublishSelection}
              >
                <EyeOff className="h-4 w-4" />
                Despublicar
              </Button>
              <Button 
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 shadow-[0_0_15px_rgba(249,115,22,0.4)]"
                onClick={() => {
                  if (selectedCells.length > 0) {
                    const last = selectedCells[selectedCells.length - 1];
                    const person = personnel.find(p => p.id === last.personId);
                    if (person) {
                      setSelectedCell({ person, date: new Date(last.dateStr + 'T00:00:00') });
                      setIsAssignmentDialogOpen(true);
                    }
                  }
                }}
              >
                Asignar Turno
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* AI Assistant Range Config Dialog */}
      <Dialog open={isAiConfigOpen} onOpenChange={setIsAiConfigOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
              {aiActionMode === 'scheduling' && <Sparkles className="h-5 w-5 text-emerald-600" />}
              {aiActionMode === 'needs' && <Calendar className="h-5 w-5 text-blue-600" />}
              {aiActionMode === 'clear' && <Trash2 className="h-5 w-5 text-red-600" />}
              {aiActionMode === 'scheduling' ? 'Asistente de Planificación IA' : 
               aiActionMode === 'needs' ? 'Generar Necesidades' : 'Limpiar Periodo'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 space-y-6">
            <div className={cn(
              "p-4 rounded-xl border flex items-start gap-3",
              aiActionMode === 'scheduling' ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100" :
              aiActionMode === 'needs' ? "bg-blue-50 dark:bg-blue-950/20 border-blue-100" :
              "bg-red-50 dark:bg-red-950/20 border-red-100"
            )}>
              <Info className={cn(
                "h-5 w-5 shrink-0 mt-0.5",
                aiActionMode === 'scheduling' ? "text-emerald-500" :
                aiActionMode === 'needs' ? "text-blue-500" : "text-red-500"
              )} />
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {aiActionMode === 'scheduling' ? 'El motor de IA analizará la demanda y las restricciones legales para generar turnos óptimos.' : 
                 aiActionMode === 'needs' ? 'Se crearán los requerimientos de personal basados en las plantillas y demanda histórica.' : 
                 'Se eliminarán de forma permanente los turnos autogenerados en este rango. Los manuales serán conservados.'}
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Desde</Label>
                <Input 
                  type="date" 
                  value={planningRange.from}
                  onChange={(e) => setPlanningRange(prev => ({ ...prev, from: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Hasta</Label>
                <Input 
                  type="date"
                  value={planningRange.to}
                  onChange={(e) => setPlanningRange(prev => ({ ...prev, to: e.target.value }))}
                />
              </div>
            </div>

            {aiActionMode === 'clear' && (
              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Label className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Opciones de Limpieza</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input 
                      type="checkbox" 
                      id="inc-validated" 
                      checked={clearOptions.includeValidated}
                      onChange={(e) => setClearOptions(prev => ({ ...prev, includeValidated: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-600"
                    />
                    <label htmlFor="inc-validated" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Incluir turnos validados (aceptados)
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input 
                      type="checkbox" 
                      id="inc-published" 
                      checked={clearOptions.includePublished}
                      onChange={(e) => setClearOptions(prev => ({ ...prev, includePublished: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-600"
                    />
                    <label htmlFor="inc-published" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Incluir turnos publicados (visibles al trabajador)
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input 
                      type="checkbox" 
                      id="inc-manual" 
                      checked={clearOptions.includeManual}
                      onChange={(e) => setClearOptions(prev => ({ ...prev, includeManual: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-600"
                    />
                    <label htmlFor="inc-manual" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Incluir turnos creados manualmente
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAiConfigOpen(false)}>Cancelar</Button>
            <Button 
              className={cn(
                "font-bold gap-2 shadow-lg dark:shadow-none",
                aiActionMode === 'scheduling' ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200" :
                aiActionMode === 'needs' ? "bg-blue-600 hover:bg-blue-700 shadow-blue-200" :
                "bg-red-600 hover:bg-red-700 shadow-red-200"
              )}
              onClick={() => handleRunAI()}
            >
              {aiActionMode === 'scheduling' ? <Zap className="h-4 w-4" /> : 
               aiActionMode === 'needs' ? <Plus className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
              {aiActionMode === 'scheduling' ? 'Iniciar IA' : 
               aiActionMode === 'needs' ? 'Generar' : 'Confirmar Borrado'}
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
             <p className="text-orange-100/80 text-sm">
                {planningRange.from && planningRange.to 
                  ? `Generando Roster desde ${format(parseISO(planningRange.from), 'dd-MM-yyyy')} hasta ${format(parseISO(planningRange.to), 'dd-MM-yyyy')}`
                  : 'Optimizando la distribución de turnos según demanda y normativas legales.'}
             </p>
          </div>

          <div className="p-8 space-y-6">
            <div className="space-y-4">

              {aiStep !== 'completed' && aiStep !== 'error' && (
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                    <div className="flex items-center gap-2">
                      <span>Progreso del cálculo</span>
                      <span className="bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded flex items-center gap-1 font-mono">
                        <Clock className="h-3 w-3" />
                        {Math.floor(elapsedSeconds / 60).toString().padStart(2, '0')}:
                        {(elapsedSeconds % 60).toString().padStart(2, '0')}
                      </span>
                    </div>
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
                    <div className="grid grid-cols-3 gap-4 mt-1">
                       <div>
                         <p className="text-[10px] text-emerald-600/70 uppercase font-black uppercase tracking-wider">Cobertura</p>
                         <p className="text-2xl font-black text-emerald-700">{aiStats.coverage}%</p>
                       </div>
                       <div>
                         <p className="text-[10px] text-emerald-600/70 uppercase font-black uppercase tracking-wider">Turnos</p>
                         <p className="text-2xl font-black text-emerald-700">{aiStats.count}</p>
                       </div>
                       <div>
                         <p className="text-[10px] text-emerald-600/70 uppercase font-black uppercase tracking-wider">Tiempo</p>
                         <p className="text-2xl font-black text-emerald-700">
                           {aiStats.executionTime ? (aiStats.executionTime / 1000).toFixed(1) : '0'}s
                         </p>
                       </div>
                    </div>

                    {/* Diagnostic Logs Expansion */}
                    {simLogs && simLogs.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-emerald-200 dark:border-emerald-800">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full text-[10px] h-7 gap-2 bg-white dark:bg-slate-900 border-emerald-200 text-emerald-700"
                          onClick={() => setDiagnosticLogs(diagnosticLogs ? null : simLogs)}
                        >
                          <Terminal className="h-3 w-3" />
                          {diagnosticLogs ? 'Ocultar Diagnóstico' : '¿Por qué dio 0%? Ver Diagnóstico'}
                        </Button>
                        
                        {diagnosticLogs && (
                          <div className="mt-2 p-3 bg-slate-950 text-emerald-400 font-mono text-[9px] rounded-lg border border-slate-800 max-h-40 overflow-y-auto space-y-1">
                            {diagnosticLogs.map((log, i) => (
                              <div key={i} className="flex gap-2">
                                <span className="text-slate-600 select-none">{i+1}.</span>
                                <span>{log}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
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

      {/* Diagnostic Logs Modal */}
      <Dialog open={!!diagnosticLogs} onOpenChange={() => setDiagnosticLogs(null)}>
        <DialogContent className="sm:max-w-[800px] max-h-[85vh] flex flex-col p-0 overflow-hidden shadow-2xl border-orange-100 dark:border-orange-950">
          <div className="bg-slate-900 dark:bg-black p-6 text-white flex justify-between items-center shrink-0">
             <div className="flex items-center gap-3">
                <Search className="h-5 w-5 text-orange-400" />
                <h2 className="text-lg font-bold tracking-tight">Auditoría de Reglas e IA (20-21 Abril)</h2>
             </div>
             <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  if (diagnosticLogs) {
                    navigator.clipboard.writeText(diagnosticLogs.join('\n'));
                    toast.success('Auditoría copiada al portapapeles');
                  }
                }} 
                className="text-[10px] uppercase font-bold text-slate-400 hover:text-white hover:bg-white/10"
             >
                Copiar Todo
             </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-8 bg-slate-50 dark:bg-slate-950 font-mono text-[11px] leading-relaxed select-text">
             {diagnosticLogs?.map((log, i) => (
               <div key={i} className={cn(
                 "py-1 border-b border-slate-100 dark:border-slate-900 last:border-0",
                 log.includes('---') ? "text-slate-900 dark:text-white font-black mt-6 bg-slate-200/50 dark:bg-slate-800/50 p-2 rounded flex items-center gap-2 first:mt-0" :
                 log.includes('Turno:') ? "text-blue-600 dark:text-blue-400 font-bold mt-4 border-l-4 border-blue-500 pl-3" :
                 log.includes('√') ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/5 px-2 py-0.5 rounded" :
                 log.includes('×') ? "text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-900/5 px-2 py-0.5 rounded" : 
                 "text-slate-500 pl-6"
               )}>
                 {log}
               </div>
             ))}
          </div>

          <DialogFooter className="p-4 bg-white dark:bg-slate-900 border-t flex justify-end shrink-0">
             <Button onClick={() => setDiagnosticLogs(null)} className="bg-orange-600 hover:bg-orange-700 text-white font-bold h-10 px-10 shadow-lg shadow-orange-200 dark:shadow-none">
                Cerrar Auditoría
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Blue Express Configurator */}
      <BlueConfigurator
        isOpen={isBlueConfigOpen}
        onClose={() => setIsBlueConfigOpen(false)}
        personnel={personnel}
        assignments={assignments}
        shifts={shifts}
        positions={positions}
        currentMonth={currentMonth}
      />
      {/* Reason for Change Dialog (Auditing) */}
      <Dialog 
        open={reasonDialogOpen.open} 
        onOpenChange={(open) => !open && setReasonDialogOpen({ open: false, assignment: null, newDate: '' })}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Justificar Cambio en Turno Validado
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
             <p className="text-sm text-muted-foreground">
               Estás moviendo un turno que ya ha sido validado. Este cambio se registrará en las estadísticas de auditoría.
             </p>
             <div className="space-y-2">
               <Label>Motivo (Opcional)</Label>
               <textarea 
                 className="w-full min-h-[100px] p-3 rounded-md border text-sm"
                 placeholder="Ej: Licencia médica, Error en planificación inicial..."
                 value={pushedReason}
                 onChange={(e) => setPushedReason(e.target.value)}
               />
             </div>
          </div>
          <DialogFooter>
             <Button variant="ghost" onClick={() => setReasonDialogOpen({ open: false, assignment: null, newDate: '' })}>
               Cancelar
             </Button>
             <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleConfirmMoveWithReason}>
               Confirmar Movimiento
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Audit 4x4 Dialog */}
      <Dialog open={isAudit4x4Open} onOpenChange={setIsAudit4x4Open}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-700">
              <Zap className="h-6 w-6" /> Auditoría de Regla 4x4 (Mayo 2026)
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Este reporte analiza el historial de cada trabajador y detecta si se está cumpliendo la ley de espejo: 
              <span className="font-bold text-slate-800 ml-1">Día Actual - 4 = Debe ser Descanso.</span>
            </p>

            {audit4x4Data.length > 0 && (
              <div className="border rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left font-bold text-slate-600">Día</th>
                      <th className="px-4 py-2 text-left font-bold text-slate-600">Cálculo Espejo</th>
                      <th className="px-4 py-2 text-left font-bold text-slate-600">Estado -4 días</th>
                      <th className="px-4 py-2 text-center font-bold text-slate-600">Disponibilidad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {audit4x4Data.map((item, idx) => (
                      <tr key={idx} className={cn(
                        "hover:bg-slate-50/50 transition-colors",
                        !item.canAssign && "bg-red-50/30"
                      )}>
                        <td className="px-4 py-3 font-black text-slate-900">{item.dayNum} Mayo</td>
                        <td className="px-4 py-3 font-mono text-indigo-600 font-bold">{item.explanation}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                            item.mirrorStatus !== 'VACÍO' ? "bg-amber-100 text-amber-700 border border-amber-200" : "bg-slate-100 text-slate-500 border border-slate-200"
                          )}>
                            {item.mirrorStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {item.canAssign ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                              <CheckCircle2 className="h-4 w-4" /> TRABAJA
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-600 font-bold">
                              <X className="h-4 w-4" /> DESCANSA
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button onClick={() => setIsAudit4x4Open(false)} className="bg-indigo-600 hover:bg-indigo-700 w-full">
              Entendido, cerrar reporte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isAuditSummaryOpen} onOpenChange={(open) => setIsAuditSummaryOpen(open)}>
        <DialogContent 
          className="max-h-[90vh] flex flex-col p-0 overflow-hidden !max-w-[95vw] shadow-2xl border-none"
          style={{ width: '95vw', maxWidth: '95vw' }}
        >
          <DialogHeader className="p-6 pb-0 bg-white border-b border-slate-50">
            <DialogTitle className="flex items-center justify-between gap-2 text-2xl font-black">
              <div className="flex items-center gap-2">
                <Sparkles className="h-7 w-7 text-emerald-500 fill-emerald-500/20" />
                Resumen Mensual de Auditoría - {format(monthDate, 'MMMM yyyy', { locale: es }).toUpperCase()}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs font-mono px-2 py-1">V.2.5.PRO</Badge>
                <Button variant="ghost" size="icon" onClick={() => setIsAuditSummaryOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </DialogTitle>
            <p className="text-slate-500 text-sm mt-1">
              Mirada global de cumplimiento: Días trabajados por semana y Domingos Libres (Art. 38)
            </p>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto p-6 pt-4">
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <table className="w-full text-sm border-collapse table-fixed">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="sticky left-0 bg-slate-50 px-4 py-4 text-left font-bold text-slate-800 z-10 border-r border-slate-200 w-[250px]">Trabajador</th>
                    <th className="px-2 py-4 text-center font-bold text-slate-600 w-[80px]">Patrón</th>
                    {(() => {
                      const allWeeks = new Set<string>();
                      auditSummary?.forEach(row => {
                        if (row.weekCounts) {
                          Object.keys(row.weekCounts).forEach(w => allWeeks.add(w));
                        }
                      });
                      const sortedWeeks = Array.from(allWeeks).sort((a, b) => {
                        const [d1, m1] = a.split('/').map(Number);
                        const [d2, m2] = b.split('/').map(Number);
                        return (m1 * 100 + d1) - (m2 * 100 + d2);
                      });
                      
                      return sortedWeeks.map(w => (
                        <th key={w} className="px-2 py-4 text-center font-bold text-slate-700 bg-slate-50/50">Sem {w}</th>
                      ));
                    })()}
                    <th className="sticky right-0 px-4 py-4 text-center font-bold text-emerald-700 bg-emerald-50 z-10 border-l border-slate-200 w-[120px]">Dom. Libres</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditSummary?.map((row, idx) => {
                    const allWeeksSet = new Set<string>();
                    auditSummary?.forEach(r => {
                      if (r.weekCounts) Object.keys(r.weekCounts).forEach(w => allWeeksSet.add(w));
                    });
                    const sortedWeeks = Array.from(allWeeksSet).sort((a, b) => {
                      const [d1, m1] = a.split('/').map(Number);
                      const [d2, m2] = b.split('/').map(Number);
                      return (m1 * 100 + d1) - (m2 * 100 + d2);
                    });

                    return (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="sticky left-0 bg-white group-hover:bg-slate-50 px-4 py-3 font-bold text-slate-900 border-r border-slate-100 z-10 truncate">{row.personName}</td>
                        <td className="px-2 py-3 text-center text-[9px] text-slate-400 font-mono uppercase">{row.pattern}</td>
                        {sortedWeeks.map(w => {
                          const count = row.weekCounts?.[w] ?? 0;
                          const isSevenBySeven = (row.pattern || '').toUpperCase().includes('7X7');
                          const isRed = isSevenBySeven ? count > 7 : count > 5;
                          const isGreen = isSevenBySeven ? (count > 0 && count <= 7) : (count === 5);
                          const isAmber = !isRed && !isGreen && count > 0;
                          const isGray = count === 0;

                          return (
                            <td key={w} className="px-2 py-3 text-center">
                              <div className={cn(
                                "inline-flex items-center justify-center w-8 h-8 rounded-full text-[11px] font-black shadow-sm border-2 transition-all",
                                isRed ? "bg-red-600 border-red-300 text-white animate-pulse" :
                                isGreen ? "bg-emerald-500 border-emerald-200 text-white" :
                                isGray ? "bg-slate-50 border-slate-100 text-slate-300" :
                                "bg-amber-400 border-amber-200 text-amber-900"
                              )}>
                                {count}
                              </div>
                            </td>
                          );
                        })}
                        <td className="sticky right-0 px-4 py-3 text-center bg-emerald-50 group-hover:bg-emerald-100/50 z-10 border-l border-slate-100">
                          <span className={cn(
                            "text-base font-black",
                            row.sundaysOff >= 2 ? "text-emerald-600" : "text-amber-600"
                          )}>
                            {row.sundaysOff}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter className="p-6 bg-slate-50 border-t border-slate-200">
            <Button onClick={() => window.location.reload()} className="bg-slate-900 hover:bg-slate-800 text-white h-12 px-10 text-lg font-bold shadow-lg shadow-slate-200">
              Actualizar Grilla y Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Coverage Detail Dialog */}
      {coverageDialog && (() => {
        const { dateStr, day } = coverageDialog;
        const dateReqs = (requirementsByDate[dateStr] || []).filter((r: any) => {
          if (areaFilter && areaFilter !== 'none') {
            if (r.area_id !== areaFilter) return false;
          }
          if (positionFilter && positionFilter !== 'none') {
            const reqName = r.position?.name?.toUpperCase() || '';
            if (positionFilter.toUpperCase() !== reqName) return false;
          }
          return true;
        });
        const dateAsgns = assignmentsByDate[dateStr] || [];
        dateReqs.sort((a: any, b: any) => {
          const startA = a.shift?.start_time || shiftsMap[a.shift_id]?.start_time || '';
          const startB = b.shift?.start_time || shiftsMap[b.shift_id]?.start_time || '';
          return startA.localeCompare(startB);
        });

        return (
          <Dialog open onOpenChange={() => setCoverageDialog(null)}>
            <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl gap-0">
              {/* Header */}
              <div className="px-6 pt-5 pb-4 bg-slate-900 text-white">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Cobertura del día</p>
                <DialogTitle className="text-lg font-black tracking-tight capitalize text-white">
                  {format(day, "EEEE d 'de' MMMM", { locale: es })}
                </DialogTitle>
                {(positionFilter || areaFilter) && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {positionFilter && (
                      <span className="flex items-center gap-1 text-[10px] font-black bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full uppercase tracking-wide">
                        <Briefcase className="h-2.5 w-2.5" />{positionFilter}
                      </span>
                    )}
                    {areaFilter && (
                      <span className="flex items-center gap-1 text-[10px] font-black bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full uppercase tracking-wide">
                        <MapPin className="h-2.5 w-2.5" />{areasMap[areaFilter]?.name || areaFilter}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="overflow-y-auto max-h-[60vh] divide-y divide-slate-100">
                {dateReqs.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Sin requerimientos</p>
                    <p className="text-xs text-slate-300 mt-1">No hay necesidades definidas para este día</p>
                  </div>
                ) : dateReqs.map((req: any, i: number) => {
                  const shift = shiftsMap[req.shift_id];
                  const position = positionsMap[req.position_id];
                  const area = areasMap[req.area_id];
                  const assigned = dateAsgns.filter((a: any) =>
                    a.shift_id === req.shift_id &&
                    (!req.position_id || a.position_id === req.position_id)
                  );
                  const assignedWorkers = assigned
                    .map((a: any) => personnel.find((p: Personnel) => p.id === a.personnel_id))
                    .filter(Boolean) as Personnel[];
                  const isFull = assigned.length >= req.required_count;
                  const vacancies = Math.max(0, req.required_count - assigned.length);

                  return (
                    <div key={i} className="px-5 py-4 space-y-3">
                      {/* Shift header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "h-8 w-8 rounded-lg flex items-center justify-center",
                            isFull ? "bg-emerald-100" : "bg-red-100"
                          )}>
                            <Clock className={cn("h-4 w-4", isFull ? "text-emerald-600" : "text-red-500")} />
                          </div>
                          <div>
                            <p className={cn("text-sm font-black uppercase tracking-tight leading-none", isFull ? "text-emerald-700" : "text-red-600")}>
                              {shift?.name || 'Turno'}
                            </p>
                            <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                              {shift?.start_time?.substring(0, 5)}–{shift?.end_time?.substring(0, 5)}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className={cn(
                          "text-xs font-black px-2.5 py-1",
                          isFull
                            ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                            : "border-red-200 text-red-600 bg-red-50"
                        )}>
                          {assigned.length} / {req.required_count}
                        </Badge>
                      </div>

                      {/* Area + Cargo */}
                      <div className="flex gap-3">
                        <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                          <MapPin className="h-2.5 w-2.5" />{area?.name || 'Sin área'}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                          <Briefcase className="h-2.5 w-2.5" />{position?.name || 'Sin cargo'}
                        </span>
                      </div>

                      {/* Workers list */}
                      <div className="space-y-1.5">
                        {assignedWorkers.map((worker: Personnel) => (
                          <div key={worker.id} className="flex items-center gap-2.5 py-1 px-2 rounded-lg bg-slate-50">
                            <div className="h-6 w-6 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                              <UserIcon className="h-3.5 w-3.5 text-orange-600" />
                            </div>
                            <span className="text-xs font-semibold text-slate-700">
                              {worker.first_name} {worker.last_name_father}
                            </span>
                            <span className="ml-auto text-[9px] font-black text-emerald-600 uppercase tracking-wide flex items-center gap-0.5">
                              <Check className="h-2.5 w-2.5" />Asignado
                            </span>
                          </div>
                        ))}
                        {Array.from({ length: vacancies }).map((_, j) => (
                          <div key={`vacant-${j}`} className="flex items-center gap-2.5 py-1 px-2 rounded-lg border border-dashed border-slate-200">
                            <div className="h-6 w-6 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center shrink-0">
                              <UserIcon className="h-3.5 w-3.5 text-slate-300" />
                            </div>
                            <span className="text-xs text-slate-300 italic font-medium">Vacante</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {dateReqs.reduce((s: number, r: any) => s + r.required_count, 0)} requeridos en total
                </span>
                <Button
                  variant="outline"
                  className="h-8 text-xs font-bold"
                  onClick={() => setCoverageDialog(null)}
                >
                  Cerrar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

    </div>
  );
}

// --- MEMOIZED COMPONENTS FOR PERFORMANCE ---

const PersonnelRow = memo(({ 
  person, 
  days, 
  assignmentsMap, 
  shiftsMap, 
  areasMap, 
  positionsMap, 
  leavesMap, 
  positions, 
  selectedCells, 
  draggingAssignment, 
  handleToggleRow, 
  handleCellClick, 
  handleDragOver, 
  handleDrop,
  handleDragStart
}: any) => {
  return (
    <tr key={person.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors border-b border-slate-100 dark:border-slate-800">
      <td className="sticky left-0 z-30 bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800 p-3 w-[240px] shadow-[4px_0_10px_-2px_rgba(0,0,0,0.1)]">
        <div className="flex items-center gap-2">
          <input 
            type="checkbox" 
            className="h-3.5 w-3.5 rounded border-slate-300"
            onChange={() => handleToggleRow(person.id)}
            checked={days.every((day: any) => {
              const d = format(day, 'yyyy-MM-dd');
              if ((person.termination_date && d > person.termination_date) || (person.hire_date && d < person.hire_date)) return true;
              return selectedCells.some((c: any) => c.personId === person.id && c.dateStr === d);
            })}
          />
          <div className="h-7 w-7 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400 relative">
             <UserIcon className="h-4 w-4" />
             {person.address && (
                <div className="absolute -top-1 -right-1 bg-white dark:bg-slate-900 rounded-full p-0.5 shadow-sm border border-orange-100">
                  <MapPin className="h-2 w-2 text-indigo-500" />
                </div>
             )}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span 
                className="text-sm font-semibold truncate max-w-[140px]"
                title={(() => {
                  const addr = person.address;
                  if (!addr) return `${person.first_name} ${person.last_name_father}`;
                  if (typeof addr === 'string') return `${person.first_name} ${person.last_name_father}\nDirección: ${addr}`;
                  const parts = [addr.street, addr.city, addr.region || addr.commune].filter(Boolean);
                  return `${person.first_name} ${person.last_name_father}\nDirección: ${parts.length > 0 ? parts.join(', ') : "Incompleta"}`;
                })()}
              >
                {person.first_name} {person.last_name_father}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-orange-600 font-bold uppercase truncate max-w-[160px]">
                 {positions.find((pos: any) => pos.id === person.main_position)?.name || 'Sin Cargo'}
              </span>
              <span className="text-[9px] text-muted-foreground uppercase">
                 {person.rotation_pattern || 'Estándar'}
              </span>
            </div>
          </div>
        </div>
      </td>
      {days.map((day: any) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const assignment = assignmentsMap[person.id]?.[dateStr];
        const shift = assignment ? shiftsMap[assignment.shift_id] : null;
        const area = assignment ? areasMap[assignment.area_id] : null;
        const positionName = assignment ? positionsMap[assignment.position_id]?.name : null;
        const personLeaves = leavesMap[person.id] || [];
        const leave = personLeaves.find((l: any) => 
          dateStr >= l.start_date && 
          dateStr <= l.end_date
        );
        const isAirport = (positionsMap[person.main_position]?.name || '').toUpperCase().includes('AEROPUERTO');
        
        const getAirportDraftShiftColor = (shiftName: string, startTime: string) => {
          const sName = (shiftName || '').toUpperCase();
          const sStart = startTime || '';

          // AM 04 (04:00) / AM 03:30 / AM 03 -> Naranja / Ámbar vibrante
          if (sName.includes('AM 04') || sName.includes('AM 03') || sStart.startsWith('04:') || sStart.startsWith('03:')) {
            return "bg-amber-100/95 border-amber-400 text-amber-950 dark:bg-amber-950/60 dark:border-amber-500 dark:text-amber-200 font-black shadow-sm ring-1 ring-amber-400/40";
          }

          // AM 07 (07:00) -> Azul Cielo / Cyan
          if (sName.includes('AM 07') || sStart.startsWith('07:')) {
            return "bg-sky-100/95 border-sky-400 text-sky-950 dark:bg-sky-950/60 dark:border-sky-500 dark:text-sky-200 font-black shadow-sm ring-1 ring-sky-400/40";
          }

          // PM 13:30 (13:30) / Tarde -> Violeta / Púrpura
          if (sName.includes('PM 13') || sName.includes('13:30') || sStart.startsWith('13:')) {
            return "bg-purple-100/95 border-purple-400 text-purple-950 dark:bg-purple-950/60 dark:border-purple-500 dark:text-purple-200 font-black shadow-sm ring-1 ring-purple-400/40";
          }

          // NS 22 (22:00) / AM 00 -> Noche / Dark Slate
          if (sName.includes('NS 22') || sName.includes('22:00') || sName.includes('AM 00') || sStart.startsWith('22:') || sStart.startsWith('00:')) {
            return "bg-slate-800 border-slate-950 text-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100 font-black shadow-sm";
          }

          // AM 08 / AM 08:30 / AM 10 / AM 11 -> Verde / Esmeralda
          if (sName.includes('AM 08') || sName.includes('AM 10') || sName.includes('AM 11') || sStart.startsWith('08:') || sStart.startsWith('10:') || sStart.startsWith('11:')) {
            return "bg-emerald-100/95 border-emerald-400 text-emerald-950 dark:bg-emerald-950/60 dark:border-emerald-500 dark:text-emerald-200 font-black shadow-sm ring-1 ring-emerald-400/40";
          }

          // AM 05 -> Rosa / Fucsia
          if (sName.includes('AM 05') || sStart.startsWith('05:')) {
            return "bg-rose-100/95 border-rose-400 text-rose-950 dark:bg-rose-950/60 dark:border-rose-500 dark:text-rose-200 font-black shadow-sm ring-1 ring-rose-400/40";
          }

          return "bg-indigo-100/95 border-indigo-400 text-indigo-950 dark:bg-indigo-950/60 dark:border-indigo-500 dark:text-indigo-200 font-black shadow-sm";
        };

        const getLeaveLabel = (type: string) => {
          switch(type) {
            case 'vacation': return 'VAC';
            case 'sick': return 'LM';
            case 'personal': return 'ADM';
            case 'maternity': return 'MAT';
            case 'free_request': return 'SL';
            default: return 'ABS';
          }
        };
        const getLeaveColor = (type: string) => {
          switch(type) {
            case 'vacation': return 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 text-emerald-600';
            case 'sick': return 'bg-red-50 dark:bg-red-900/20 border-red-100 text-red-600';
            case 'personal': return 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 text-amber-600';
            case 'maternity': return 'bg-purple-50 dark:bg-purple-900/20 border-purple-100 text-purple-600';
            case 'free_request': return 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 text-blue-600';
            default: return 'bg-slate-50 dark:bg-slate-900/20 border-slate-100 text-slate-600';
          }
        };

        const isTerminated = person.termination_date && dateStr > person.termination_date;
        const isPreHire = person.hire_date && dateStr < person.hire_date;
        const isBlocked = isTerminated || isPreHire;
        
        const isBirthday = person.birth_date && (() => {
          try {
            const bDate = parseISO(person.birth_date);
            return format(bDate, 'MM-dd') === format(day, 'MM-dd');
          } catch (e) {
            return false;
          }
        })();

        return (
          <td 
            key={`${person.id}-${dateStr}`}
            onClick={() => !isBlocked && handleCellClick(person, day)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, person.id, dateStr)}
            className={cn(
              "p-1 text-center border-b border-slate-50 dark:border-slate-900 cursor-pointer h-14 relative group transition-all",
              isSunday(day) && "bg-slate-50/30 dark:bg-slate-900/10",
              isToday(day) && "bg-orange-50/40 dark:bg-orange-900/20 shadow-[inset_0_0_0_1px_rgba(249,115,22,0.1)]",
              isBlocked && "bg-slate-100 dark:bg-slate-900/80 cursor-not-allowed opacity-50 repeating-bg-stripe",
              isBirthday && !isBlocked && "bg-rose-50/60 dark:bg-rose-900/20 ring-1 ring-rose-200 dark:ring-rose-800 inset-0",
              draggingAssignment?.personnel_id === person.id && draggingAssignment?.date !== dateStr && "bg-indigo-50/50 dark:bg-indigo-900/20 ring-2 ring-indigo-300 ring-inset",
              selectedCells.some((c: any) => c.personId === person.id && c.dateStr === dateStr)
                ? "bg-orange-100/50 dark:bg-orange-900/30 ring-2 ring-orange-500 ring-inset z-10" 
                : "hover:ring-2 hover:ring-orange-500/20"
            )}
          >
            {/* Birthday Indicator */}
            {isBirthday && !isBlocked && (
              <div className="absolute top-1 left-1 z-20 animate-bounce pointer-events-none">
                <Cake className="h-3 w-3 text-rose-500" />
              </div>
            )}
            
            {/* Multi-select checkbox indicator */}
            {!isBlocked && (
              <div className={cn(
                "absolute top-1 right-1 h-3 w-3 rounded-full border border-orange-300 dark:border-orange-700 transition-all z-20",
                selectedCells.some((c: any) => c.personId === person.id && c.dateStr === dateStr)
                  ? "bg-orange-500 border-orange-500 scale-110 shadow-sm"
                  : "bg-white/50 opacity-0 group-hover:opacity-100"
              )}>
                {selectedCells.some((c: any) => c.personId === person.id && c.dateStr === dateStr) && (
                  <CheckCircle2 className="h-full w-full text-white p-0.5" />
                )}
              </div>
            )}

            <div className="relative z-10">
              {leave ? (
                <Badge 
                  variant="outline" 
                  className={cn("text-[9px] font-bold px-1 py-0 border", getLeaveColor(leave.type))}
                >
                  {getLeaveLabel(leave.type)}
                </Badge>
              ) : shift ? (
                <Tooltip>
                  <TooltipTrigger>
                    {(() => {
                      const isDraft = !assignment?.is_published && !assignment?.is_validated;
                      return (
                        <div 
                          draggable={!isBlocked && assignment?.status !== 'cancelled'}
                          onDragStart={(e) => handleDragStart(e, assignment)}
                          className={cn(
                            "flex flex-col items-center justify-center rounded-lg p-1 border shadow-sm transition-all cursor-grab active:cursor-grabbing",
                            assignment?.status === 'confirmed' || assignment?.is_confirmed
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 font-bold" 
                              : assignment?.is_published
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 font-bold"
                              : assignment?.is_validated
                              ? "bg-blue-500/10 border-blue-500/30 text-blue-700 font-bold"
                              : isAirport
                              ? getAirportDraftShiftColor(shift.name, shift.start_time)
                              : "bg-blue-500/10 border-blue-500/30 text-blue-700",
                            assignment?.is_extra && "ring-2 ring-amber-400 ring-offset-1 ring-offset-white ring-inset",
                            assignment?.status === 'cancelled' && "opacity-40 grayscale",
                            isAirport && !isDraft && "border-indigo-400 border-dashed"
                          )}
                        >
                          <span className="text-[10px] font-black leading-tight uppercase">{shift.name}</span>
                          <div className="flex items-center gap-0.5 mt-0.5">
                            {assignment?.is_published ? (
                              <Sparkles className="h-2 w-2 text-emerald-500" />
                            ) : (
                              <div className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                isAirport && isDraft ? "bg-slate-500" : "bg-slate-300"
                              )} />
                            )}
                            <span className="text-[8px] opacity-80 font-bold">
                              {shift.start_time.substring(0, 5)}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    sideOffset={6}
                    className="p-0 overflow-hidden rounded-xl border border-slate-200 shadow-xl bg-white text-slate-900 min-w-[210px] max-w-[260px]"
                  >
                    {/* Header: trabajador */}
                    <div className="px-3 pt-2.5 pb-2 border-b border-slate-100 bg-slate-50">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">Trabajador</p>
                      <p className="text-xs font-bold text-slate-800 leading-tight">{person.first_name} {person.last_name_father}</p>
                    </div>
                    {/* Cuerpo: turno, área, cargo */}
                    <div className="px-3 py-2.5 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                        <span className="text-[11px] font-bold text-slate-700">
                          {shift.name} · {shift.start_time.substring(0, 5)}–{shift.end_time.substring(0, 5)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3 w-3 text-indigo-400 shrink-0" />
                        <span className="text-[11px] font-bold text-indigo-700">{area?.name || 'Sin área'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-3 w-3 text-orange-400 shrink-0" />
                        <span className="text-[11px] font-bold text-orange-700">{positionName || 'Sin cargo'}</span>
                      </div>
                    </div>
                    {/* Footer: estado */}
                    <div className="px-3 pb-2.5 pt-0 flex items-center gap-1.5 border-t border-slate-50">
                      {assignment?.is_published ? (
                        <span className="flex items-center gap-1 text-[9px] font-black text-emerald-600 uppercase tracking-wide">
                          <Sparkles className="h-2.5 w-2.5" />Publicado
                        </span>
                      ) : assignment?.is_validated ? (
                        <span className="flex items-center gap-1 text-[9px] font-black text-blue-600 uppercase tracking-wide">
                          <CheckCircle2 className="h-2.5 w-2.5" />Validado
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[9px] font-black text-slate-400 uppercase tracking-wide">
                          <div className="h-1.5 w-1.5 rounded-full bg-slate-300" />Pendiente
                        </span>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <span className="text-[9px] font-bold text-slate-300/40">OFF</span>
              )}
            </div>
          </td>
        );
      })}
    </tr>
  );
});

PersonnelRow.displayName = 'PersonnelRow';


