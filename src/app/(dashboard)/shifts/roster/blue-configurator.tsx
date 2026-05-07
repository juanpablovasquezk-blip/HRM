'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Truck, Save, Sparkles, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { format, subDays, parseISO, startOfWeek, endOfWeek, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { bulkUpdateBlueRotations } from '@/app/(dashboard)/shifts/actions';

// ─── Block Definitions ─────────────────────────────────────────────────────────

const BLUE_DIA_BLOCKS = {
  'Secuencia 1': {
    days: ['PM 12', 'PM 12', 'PM 12', 'PM 12', 'PM 12', '', ''],
    next: 'Secuencia 2',
    suffix: '-1',
    fingerprint: { thu: true, fri: true, sat: false, sun: false },
  },
  'Secuencia 2': {
    days: ['', '', 'AM 08', 'AM 08', 'AM 08', 'AM 08', 'AM 08'],
    next: 'Secuencia 3',
    suffix: '-2',
    fingerprint: { thu: true, fri: true, sat: true, sun: true },
  },
  'Secuencia 3': {
    days: ['AM 08', 'AM 08', '', '', 'AM 00', 'AM 08', 'AM 08'],
    next: 'Secuencia 1',
    suffix: '-3',
    fingerprint: { thu: false, fri: true, sat: true, sun: true }, // Different shift (AM 00 on Fri)
  },
};

const BLUE_NOCHE_BLOCKS = {
  'Secuencia 1': {
    days: ['AM 00', 'AM 00', 'AM 00', 'AM 00', 'AM 00', '', ''],
    next: 'Secuencia 2',
    suffix: '-1',
    fingerprint: { thu: true, fri: true, sat: false, sun: false },
  },
  'Secuencia 2': {
    days: ['', '', 'AM 00', 'AM 00', 'AM 00', 'AM 00', 'AM 00'],
    next: 'Secuencia 3',
    suffix: '-2',
    fingerprint: { thu: true, fri: true, sat: true, sun: true },
  },
  'Secuencia 3': {
    days: ['AM 00', 'AM 00', '', '', '', 'AM 00', 'AM 00'],
    next: 'Secuencia 1',
    suffix: '-3',
    fingerprint: { thu: false, fri: false, sat: true, sun: true },
  },
};

const DAY_HEADERS = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];

// ─── Types ──────────────────────────────────────────────────────────────────────

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
}

interface Assignment {
  id: string;
  personnel_id: string;
  date: string;
  shift_id: string;
  area_id: string;
  position_id: string;
  is_manual: boolean;
}

interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
}

interface Position {
  id: string;
  name: string;
  area_id: string;
}

interface BlueConfiguratorProps {
  isOpen: boolean;
  onClose: () => void;
  personnel: Personnel[];
  assignments: Assignment[];
  shifts: Shift[];
  positions: Position[];
  currentMonth: string;
}

// ─── Helper: Detect sequence from last 4 days ──────────────────────────────────

function detectSequence(
  person: Personnel,
  assignments: Assignment[],
  shifts: Shift[],
  targetMonday: Date
): { detected: string | null; reason: string } {
  try {
    if (isNaN(targetMonday.getTime())) {
      return { detected: null, reason: 'Fecha inválida' };
    }

    // Look at the 4 days BEFORE this Monday (Thu-Sun of the previous block)
    const prevThursday = subDays(targetMonday, 4);
    const prevFriday = subDays(targetMonday, 3);
    const prevSaturday = subDays(targetMonday, 2);
    const prevSunday = subDays(targetMonday, 1);

    const checkDates = [
      { key: 'thu', date: format(prevThursday, 'yyyy-MM-dd') },
      { key: 'fri', date: format(prevFriday, 'yyyy-MM-dd') },
      { key: 'sat', date: format(prevSaturday, 'yyyy-MM-dd') },
      { key: 'sun', date: format(prevSunday, 'yyyy-MM-dd') },
    ];

  const personAssignments = assignments.filter(a => a.personnel_id === person.id);
  const worked: Record<string, boolean> = {};

  for (const { key, date } of checkDates) {
    worked[key] = personAssignments.some(a => a.date === date);
  }

  // Fingerprint matching
  const isBlueNoche = (person.rotation_pattern || '').toUpperCase().includes('NOCHE');

  if (isBlueNoche) {
    // NOCHE fingerprints
    if (worked.thu && worked.fri && !worked.sat && !worked.sun) {
      return { detected: 'Secuencia 1', reason: 'J✅ V✅ S❌ D❌ → Sec.1' };
    }
    if (worked.thu && worked.fri && worked.sat && worked.sun) {
      return { detected: 'Secuencia 2', reason: 'J✅ V✅ S✅ D✅ → Sec.2' };
    }
    if (!worked.thu && !worked.fri && worked.sat && worked.sun) {
      return { detected: 'Secuencia 3', reason: 'J❌ V❌ S✅ D✅ → Sec.3' };
    }
  } else {
    // DIA fingerprints
    if (worked.thu && worked.fri && !worked.sat && !worked.sun) {
      return { detected: 'Secuencia 1', reason: 'J✅ V✅ S❌ D❌ → Sec.1 (A)' };
    }
    if (!worked.thu && worked.fri && worked.sat && worked.sun) {
      // Block B (Mon-Tue, Fri-Sun) rests Wed-Thu
      return { detected: 'Secuencia 3', reason: 'J❌ V✅ S✅ D✅ → Sec.3 (B)' };
    }
    if (worked.thu && worked.fri && worked.sat && worked.sun) {
      // Block C (Wed-Sun) works Wed-Sun
      return { detected: 'Secuencia 2', reason: 'J✅ V✅ S✅ D✅ → Sec.2 (C)' };
    }
  }

  return { detected: null, reason: 'Sin datos previos' };
  } catch (e) {
    return { detected: null, reason: 'Error de detección' };
  }
}

function getNextSequence(currentSeq: string, blocks: typeof BLUE_DIA_BLOCKS): string {
  const block = blocks[currentSeq as keyof typeof blocks];
  return block?.next || 'Secuencia 1';
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function BlueConfigurator({
  isOpen,
  onClose,
  personnel,
  assignments,
  shifts,
  positions,
  currentMonth,
}: BlueConfiguratorProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Compute available Mondays from the current month grid
  const availableMondays = useMemo(() => {
    const parts = currentMonth.split('-');
    const monthStart = new Date(+parts[0], +parts[1] - 1, 1);
    const monthEnd = new Date(+parts[0], +parts[1], 0); // last day of month
    const mondays: Date[] = [];
    
    // Find all Mondays within the month grid
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    
    let cursor = gridStart;
    while (cursor <= gridEnd) {
      if (cursor.getDay() === 1) { // Monday
        mondays.push(new Date(cursor));
      }
      cursor = new Date(cursor.getTime() + 86400000); // +1 day
    }
    return mondays;
  }, [currentMonth]);

  const [targetMonday, setTargetMonday] = useState<Date>(() => {
    // Default: find the next upcoming Monday from today, or fallback to first
    const today = new Date();
    const upcoming = availableMondays.find(m => m >= today);
    return upcoming || availableMondays[availableMondays.length - 1] || new Date();
  });

  // Filter blue personnel
  const bluePersonnel = useMemo(() => {
    return personnel.filter(p => {
      const pattern = (p.rotation_pattern || '').toUpperCase();
      const posName = positions.find(pos => pos.id === p.main_position)?.name?.toUpperCase() || '';
      return pattern.includes('BLUE') || posName.includes('CONDUCTOR');
    });
  }, [personnel, positions]);

  // Split into DIA and NOCHE
  const { diaPersonnel, nochePersonnel } = useMemo(() => {
    const dia: Personnel[] = [];
    const noche: Personnel[] = [];
    for (const p of bluePersonnel) {
      const pattern = (p.rotation_pattern || '').toUpperCase();
      if (pattern.includes('NOCHE')) {
        noche.push(p);
      } else {
        dia.push(p);
      }
    }
    return { diaPersonnel: dia, nochePersonnel: noche };
  }, [bluePersonnel]);

  // Auto-detect and compute suggested sequences based on targetMonday
  const detectedSequences = useMemo(() => {
    const result: Record<string, { detected: string | null; reason: string; suggested: string }> = {};
    for (const p of bluePersonnel) {
      const isNoche = (p.rotation_pattern || '').toUpperCase().includes('NOCHE');
      const blocks = isNoche ? BLUE_NOCHE_BLOCKS : BLUE_DIA_BLOCKS;
      const { detected, reason } = detectSequence(p, assignments, shifts, targetMonday);

      let suggested = 'Secuencia 1';
      if (detected) {
        suggested = getNextSequence(detected, blocks);
      } else {
        const pattern = p.rotation_pattern || '';
        if (pattern.includes('-1')) suggested = 'Secuencia 1';
        else if (pattern.includes('-2')) suggested = 'Secuencia 2';
        else if (pattern.includes('-3')) suggested = 'Secuencia 3';
      }
      result[p.id] = { detected, reason, suggested };
    }
    return result;
  }, [bluePersonnel, assignments, shifts, targetMonday]);

  const [selectedSequences, setSelectedSequences] = useState<Record<string, string>>({});

  // Sync suggestions into selected when detectedSequences change
  useMemo(() => {
    const newSel: Record<string, string> = {};
    for (const [id, info] of Object.entries(detectedSequences)) {
      newSel[id] = selectedSequences[id] || info.suggested;
    }
    setSelectedSequences(newSel);
  }, [detectedSequences]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = bluePersonnel.map(p => {
        const isNoche = (p.rotation_pattern || '').toUpperCase().includes('NOCHE');
        const prefix = isNoche ? 'BLUE_NOCHE' : 'BLUE_DIA';
        const seq = selectedSequences[p.id] || 'Secuencia 1';
        const blocks = isNoche ? BLUE_NOCHE_BLOCKS : BLUE_DIA_BLOCKS;
        const suffix = blocks[seq as keyof typeof blocks]?.suffix || '-1';
        return { id: p.id, pattern: `${prefix}${suffix}` };
      });

      const res = await bulkUpdateBlueRotations(updates);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`${updates.length} rotaciones Blue actualizadas`);
        router.refresh();
        onClose();
      }
    } catch (e) {
      toast.error('Error guardando rotaciones');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="!max-w-[95vw] w-[1200px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Truck className="h-5 w-5 text-blue-600" />
            Configurador de Bloques Blue Express
          </DialogTitle>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-sm text-slate-500">Semana que inicia el:</span>
            <select
              className="h-9 rounded-md border border-blue-300 bg-white px-3 py-1 text-sm font-semibold text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={format(targetMonday, 'yyyy-MM-dd')}
              onChange={(e) => setTargetMonday(new Date(e.target.value + 'T00:00:00'))}
            >
              {availableMondays.map(m => (
                <option key={m.toISOString()} value={format(m, 'yyyy-MM-dd')}>
                  Lunes {format(m, 'dd MMMM yyyy', { locale: es })}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-400">
              Lee J{format(subDays(targetMonday, 4), 'dd')}-V{format(subDays(targetMonday, 3), 'dd')}-S{format(subDays(targetMonday, 2), 'dd')}-D{format(subDays(targetMonday, 1), 'dd')} para detectar secuencia
            </span>
          </div>
        </DialogHeader>

        {/* ─── Reference Tables (FIXED) ─────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-amber-400"></span>
              CONDUCTORES DÍA
            </h3>
            <ReferenceTable blocks={BLUE_DIA_BLOCKS} variant="dia" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-indigo-500"></span>
              CONDUCTORES NOCHE
            </h3>
            <ReferenceTable blocks={BLUE_NOCHE_BLOCKS} variant="noche" />
          </div>
        </div>

        {/* ─── Personnel Assignment (SCROLLABLE) ───────────── */}
        <div className="mt-4 flex-1 overflow-y-auto min-h-0 space-y-6 border-t border-slate-200 pt-4">
          {diaPersonnel.length > 0 && (
            <PersonnelSection
              title="Conductores / Ayudantes DÍA"
              variant="dia"
              people={diaPersonnel}
              positions={positions}
              blocks={BLUE_DIA_BLOCKS}
              detectedSequences={detectedSequences}
              selectedSequences={selectedSequences}
              onSequenceChange={(id, seq) =>
                setSelectedSequences(prev => ({ ...prev, [id]: seq }))
              }
            />
          )}
          {nochePersonnel.length > 0 && (
            <PersonnelSection
              title="Conductores / Ayudantes NOCHE"
              variant="noche"
              people={nochePersonnel}
              positions={positions}
              blocks={BLUE_NOCHE_BLOCKS}
              detectedSequences={detectedSequences}
              selectedSequences={selectedSequences}
              onSequenceChange={(id, seq) =>
                setSelectedSequences(prev => ({ ...prev, [id]: seq }))
              }
            />
          )}
        </div>

        <DialogFooter className="mt-6 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Aplicar Secuencias ({bluePersonnel.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reference Table ────────────────────────────────────────────────────────────

function ReferenceTable({
  blocks,
  variant,
}: {
  blocks: typeof BLUE_DIA_BLOCKS;
  variant: 'dia' | 'noche';
}) {
  const bgWork = variant === 'dia' ? 'bg-amber-50 text-amber-800' : 'bg-indigo-50 text-indigo-800';
  const bgOff = 'bg-slate-100 text-slate-400';

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-50">
            <th className="px-2 py-1.5 text-left font-semibold text-slate-500 border-b border-r border-slate-200 w-[90px]"></th>
            {DAY_HEADERS.map(d => (
              <th key={d} className="px-1.5 py-1.5 text-center font-semibold text-slate-500 border-b border-slate-200 whitespace-nowrap">
                {d.substring(0, 3)}
              </th>
            ))}
            <th className="px-2 py-1.5 text-center font-semibold text-slate-500 border-b border-l border-slate-200 whitespace-nowrap">
              SIG.
            </th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(blocks).map(([name, block]) => (
            <tr key={name} className="border-b last:border-b-0 border-slate-100">
              <td className="px-2 py-1.5 font-bold text-slate-600 border-r border-slate-200 whitespace-nowrap">
                {name.replace('Secuencia ', 'SEC ')}
              </td>
              {block.days.map((shift, i) => (
                <td
                  key={i}
                  className={`px-1 py-1.5 text-center font-semibold border-slate-100 ${
                    shift ? bgWork : bgOff
                  }`}
                >
                  {shift || '—'}
                </td>
              ))}
              <td className="px-2 py-1.5 text-center border-l border-slate-200">
                <Badge variant="outline" className="text-[10px] font-bold">
                  {block.next.replace('Secuencia ', 'SEC ')}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Personnel Section ──────────────────────────────────────────────────────────

function PersonnelSection({
  title,
  variant,
  people,
  positions,
  blocks,
  detectedSequences,
  selectedSequences,
  onSequenceChange,
}: {
  title: string;
  variant: 'dia' | 'noche';
  people: Personnel[];
  positions: Position[];
  blocks: typeof BLUE_DIA_BLOCKS;
  detectedSequences: Record<string, { detected: string | null; reason: string; suggested: string }>;
  selectedSequences: Record<string, string>;
  onSequenceChange: (id: string, seq: string) => void;
}) {
  const accentBorder = variant === 'dia' ? 'border-l-amber-400' : 'border-l-indigo-500';

  return (
    <div>
      <h4 className="text-sm font-bold text-slate-600 mb-2">{title}</h4>
      <div className="rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs">
              <th className="px-3 py-2 text-left font-semibold text-slate-500">Nombre</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500">Cargo</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-500">Patrón Actual</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-500">Detección IA</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-500 bg-blue-50">
                Secuencia a Asignar
              </th>
            </tr>
          </thead>
          <tbody>
            {people.map(person => {
              const info = detectedSequences[person.id];
              const detected = info?.detected;
              const reason = info?.reason || 'Sin datos';
              const nextSeq = info?.suggested || 'Secuencia 1';
              const posName = positions.find(pos => pos.id === person.main_position)?.name || '—';
              const currentPattern = person.rotation_pattern || '—';
              const selected = selectedSequences[person.id] || 'Secuencia 1';

              return (
                <tr key={person.id} className={`border-b border-slate-100 last:border-b-0 border-l-4 ${accentBorder} hover:bg-slate-50/50 transition-colors`}>
                  <td className="px-3 py-2 font-medium text-slate-700">
                    {person.first_name} {person.last_name_father}
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{posName}</td>
                  <td className="px-3 py-2 text-center">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {currentPattern}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {detected ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Prev: {detected}
                        </Badge>
                        <span className="text-[10px] text-slate-400">{reason}</span>
                        <span className="text-[10px] font-bold text-blue-600">→ Siguiente: {nextSeq}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-0.5">
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          {reason}
                        </Badge>
                        <span className="text-[10px] text-slate-400">Asigne manualmente</span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center bg-blue-50/30">
                    <select
                      className="h-8 w-full max-w-[140px] mx-auto rounded-md border border-blue-300 bg-white px-2 py-1 text-sm font-semibold text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={selected}
                      onChange={(e) => onSequenceChange(person.id, e.target.value)}
                    >
                      <option value="Secuencia 1">Secuencia 1</option>
                      <option value="Secuencia 2">Secuencia 2</option>
                      <option value="Secuencia 3">Secuencia 3</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
