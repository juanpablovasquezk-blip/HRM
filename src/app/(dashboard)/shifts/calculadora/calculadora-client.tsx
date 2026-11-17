'use client';

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  Building2,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  HelpCircle,
  Info,
  Plus,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  buildSimulatedCurrentRows,
  buildSimulatedCurrentTemplates,
  calculateManualServiceStaffing,
  calculateOperationalStaffing,
  compareStaffingScenarios,
  DEFAULT_STAFFING_CONFIG,
  type LowerBoundsResult,
  type ManualServicePositionInput,
  type ShiftCatalogItem,
  type SimulatedCurrentRow,
  type WorkRegime,
} from './staffing-calculator';
import { MATRIX_DAYS_ORDER, type TemplateLike } from '../dotacion/matrix-utils';
import { resolveShiftDurationHours } from '../shift-duration';

interface AreaItem {
  id: string;
  name: string;
  positions?: Array<{ id: string; name: string }>;
}

interface CalculadoraClientProps {
  templates: TemplateLike[];
  areas: AreaItem[];
  shifts: ShiftCatalogItem[];
}

type CalculatorMode = 'current' | 'manual';

const DOMINANT_LABELS: Record<LowerBoundsResult['dominantConstraint'], string> = {
  peak_daily: 'Pico diario',
  hours_capacity: 'Capacidad horaria',
  regime_days: 'Días por régimen',
  sunday_rule: 'Descanso dominical',
  none: '—',
};

function clampPct(raw: string, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(45, n);
}

function makeUid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function CalculadoraClient({
  templates,
  areas,
  shifts,
}: CalculadoraClientProps) {
  const [mode, setMode] = useState<CalculatorMode>('current');

  // Shared labor & replacement parameters
  const [maxWeeklyHours, setMaxWeeklyHours] = useState<42 | 40>(42);
  const [regime, setRegime] = useState<WorkRegime>('5x2');
  const [enforceSundays, setEnforceSundays] = useState<boolean>(
    DEFAULT_STAFFING_CONFIG.enforceTwoFreeSundaysPerMonth
  );
  const [vacationPctStr, setVacationPctStr] = useState<string>(
    String(DEFAULT_STAFFING_CONFIG.vacationPct)
  );
  const [absenteeismPctStr, setAbsenteeismPctStr] = useState<string>(
    String(DEFAULT_STAFFING_CONFIG.absenteeismPct)
  );
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [showMethodology, setShowMethodology] = useState<boolean>(true);

  // Mode 1: Current Operation filters & temporary simulation state (in-memory only)
  const [filterAreaId, setFilterAreaId] = useState<string>('all');
  const [filterPositionName, setFilterPositionName] = useState<string>('all');
  const [isSimulatingCurrent, setIsSimulatingCurrent] = useState<boolean>(false);
  const [simRows, setSimRows] = useState<SimulatedCurrentRow[]>([]);

  // Deduplicate shifts catalog for dropdowns while preserving shift IDs for calculation
  const uniqueShifts = useMemo(() => {
    const seen = new Set<string>();
    return shifts.filter((s) => {
      const key = `${s.name}|${s.start_time}|${s.end_time}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [shifts]);

  const defaultShiftId = uniqueShifts[0]?.id || '';

  // Mode 2: Manual New Service simulation state (purely in-memory, zero DB writes)
  const [projectName, setProjectName] = useState<string>('Nuevo Servicio');
  const [manualPositions, setManualPositions] = useState<ManualServicePositionInput[]>(() => [
    {
      positionId: 'pos-1',
      positionName: 'Operador',
      shifts: defaultShiftId
        ? [
            {
              rowId: 'row-1',
              shiftId: defaultShiftId,
              counts: [1, 1, 1, 1, 1, 0, 0],
            },
          ]
        : [],
    },
  ]);

  const vacationPct = clampPct(vacationPctStr, DEFAULT_STAFFING_CONFIG.vacationPct);
  const absenteeismPct = clampPct(absenteeismPctStr, DEFAULT_STAFFING_CONFIG.absenteeismPct);

  const sharedConfig = useMemo(
    () => ({
      maxWeeklyHours,
      regime,
      enforceTwoFreeSundaysPerMonth: regime === '5x2' ? enforceSundays : false,
      vacationPct,
      absenteeismPct,
    }),
    [maxWeeklyHours, regime, enforceSundays, vacationPct, absenteeismPct]
  );

  // Mode 1 data
  const enrichedTemplates = useMemo(() => {
    const areaMap = new Map(areas.map((a) => [a.id, a]));
    const posMap = new Map<string, { id: string; name: string }>();
    for (const a of areas) {
      for (const p of a.positions || []) {
        posMap.set(p.id, p);
      }
    }

    return templates
      .map((tmpl) => ({
        ...tmpl,
        area: areaMap.get(tmpl.area_id) || tmpl.area || { name: 'Desconocido' },
        position: posMap.get(tmpl.position_id) || tmpl.position || { name: 'Desconocido' },
      }))
      .filter((tmpl) => {
        if (filterAreaId !== 'all' && tmpl.area_id !== filterAreaId) return false;
        if (filterPositionName !== 'all' && tmpl.position?.name !== filterPositionName) {
          return false;
        }
        return true;
      });
  }, [templates, areas, filterAreaId, filterPositionName]);

  const availablePositionNames = useMemo(() => {
    const names = new Set<string>();
    const areaFilterActive = filterAreaId !== 'all';
    for (const a of areas) {
      if (areaFilterActive && a.id !== filterAreaId) continue;
      for (const p of a.positions || []) {
        if (p.name) names.add(p.name);
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [areas, filterAreaId]);

  const currentReport = useMemo(
    () => calculateOperationalStaffing(enrichedTemplates, shifts, sharedConfig),
    [enrichedTemplates, shifts, sharedConfig]
  );

  const baseSimRows = useMemo(
    () => buildSimulatedCurrentRows(enrichedTemplates),
    [enrichedTemplates]
  );

  const simHasChanges = useMemo(() => {
    if (!isSimulatingCurrent) return false;
    if (simRows.length !== baseSimRows.length) return true;
    for (let i = 0; i < simRows.length; i++) {
      const a = simRows[i];
      const b = baseSimRows[i];
      if (
        a.areaId !== b.areaId ||
        a.positionId !== b.positionId ||
        a.shiftId !== b.shiftId ||
        a.counts.some((c, idx) => c !== b.counts[idx])
      ) {
        return true;
      }
    }
    return false;
  }, [isSimulatingCurrent, simRows, baseSimRows]);

  const simulatedCurrentTemplates = useMemo(
    () => (isSimulatingCurrent ? buildSimulatedCurrentTemplates(simRows) : []),
    [isSimulatingCurrent, simRows]
  );

  const simulatedCurrentReport = useMemo(
    () =>
      isSimulatingCurrent
        ? calculateOperationalStaffing(simulatedCurrentTemplates, shifts, sharedConfig)
        : null,
    [isSimulatingCurrent, simulatedCurrentTemplates, shifts, sharedConfig]
  );

  const scenarioComparison = useMemo(
    () =>
      isSimulatingCurrent && simulatedCurrentReport
        ? compareStaffingScenarios(currentReport, simulatedCurrentReport)
        : null,
    [isSimulatingCurrent, currentReport, simulatedCurrentReport]
  );

  const filterTemplatesFor = (areaId: string, posName: string) => {
    const areaMap = new Map(areas.map((a) => [a.id, a]));
    const posMap = new Map<string, { id: string; name: string }>();
    for (const a of areas) {
      for (const p of a.positions || []) {
        posMap.set(p.id, p);
      }
    }
    return templates
      .map((tmpl) => ({
        ...tmpl,
        area: areaMap.get(tmpl.area_id) || tmpl.area || { name: 'Desconocido' },
        position: posMap.get(tmpl.position_id) || tmpl.position || { name: 'Desconocido' },
      }))
      .filter((tmpl) => {
        if (areaId !== 'all' && tmpl.area_id !== areaId) return false;
        if (posName !== 'all' && tmpl.position?.name !== posName) return false;
        return true;
      });
  };

  const handleAreaFilterChange = (nextAreaId: string) => {
    if (
      isSimulatingCurrent &&
      simHasChanges &&
      !window.confirm(
        'Tienes modificaciones simuladas sin restaurar. Al cambiar de Área se reinicializará la simulación para evitar mezclar datos. ¿Continuar?'
      )
    ) {
      return;
    }
    setFilterAreaId(nextAreaId);
    setFilterPositionName('all');
    if (isSimulatingCurrent) {
      setSimRows(buildSimulatedCurrentRows(filterTemplatesFor(nextAreaId, 'all')));
    }
  };

  const handlePositionFilterChange = (nextPosName: string) => {
    if (
      isSimulatingCurrent &&
      simHasChanges &&
      !window.confirm(
        'Tienes modificaciones simuladas sin restaurar. Al cambiar de Cargo se reinicializará la simulación para evitar mezclar datos. ¿Continuar?'
      )
    ) {
      return;
    }
    setFilterPositionName(nextPosName);
    if (isSimulatingCurrent) {
      setSimRows(buildSimulatedCurrentRows(filterTemplatesFor(filterAreaId, nextPosName)));
    }
  };

  const handleStartCurrentSimulation = () => {
    setSimRows(baseSimRows);
    setIsSimulatingCurrent(true);
  };

  const handleRestoreCurrentSimulation = () => {
    setSimRows(baseSimRows);
  };

  const handleCloseCurrentSimulation = () => {
    if (
      simHasChanges &&
      !window.confirm('¿Deseas cerrar la simulación temporal y descartar los cambios en memoria?')
    ) {
      return;
    }
    setIsSimulatingCurrent(false);
    setSimRows([]);
  };

  const handleSimCellChange = (rowId: string, dayIdx: number, raw: string) => {
    const parsed = raw.trim() === '' ? 0 : Math.max(0, Math.floor(Number(raw) || 0));
    setSimRows((prev) =>
      prev.map((r) => {
        if (r.rowId !== rowId) return r;
        const nextCounts: [number, number, number, number, number, number, number] = [
          ...r.counts,
        ] as [number, number, number, number, number, number, number];
        nextCounts[dayIdx] = parsed;
        return { ...r, counts: nextCounts };
      })
    );
  };

  const handleSimShiftChange = (rowId: string, shiftId: string) => {
    setSimRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, shiftId } : r)));
  };

  const handleSimDeleteRow = (rowId: string) => {
    setSimRows((prev) => prev.filter((r) => r.rowId !== rowId));
  };

  const handleSimAddRow = (group: {
    areaId: string;
    areaName: string;
    positionId: string;
    positionName: string;
  }) => {
    if (!defaultShiftId) return;
    setSimRows((prev) => [
      ...prev,
      {
        rowId: makeUid('sim'),
        areaId: group.areaId,
        areaName: group.areaName,
        positionId: group.positionId,
        positionName: group.positionName,
        shiftId: defaultShiftId,
        counts: [1, 1, 1, 1, 1, 0, 0],
      },
    ]);
  };

  const manualReport = useMemo(
    () => calculateManualServiceStaffing(projectName, manualPositions, shifts, sharedConfig),
    [projectName, manualPositions, shifts, sharedConfig]
  );

  const activeReport = mode === 'current' ? currentReport : manualReport;
  const isPartial = activeReport.overall.blockedGroups > 0;
  const replacementFactor = 1 / (1 - Math.min(90, vacationPct + absenteeismPct) / 100);

  // Manual simulation handlers
  const handleAddPosition = () => {
    setManualPositions((prev) => [
      ...prev,
      {
        positionId: makeUid('pos'),
        positionName: `Cargo ${prev.length + 1}`,
        shifts: defaultShiftId
          ? [
              {
                rowId: makeUid('row'),
                shiftId: defaultShiftId,
                counts: [1, 1, 1, 1, 1, 0, 0],
              },
            ]
          : [],
      },
    ]);
  };

  const handleRemovePosition = (positionId: string) => {
    setManualPositions((prev) => prev.filter((p) => p.positionId !== positionId));
  };

  const handleRenamePosition = (positionId: string, name: string) => {
    setManualPositions((prev) =>
      prev.map((p) => (p.positionId === positionId ? { ...p, positionName: name } : p))
    );
  };

  const handleAddShiftRow = (positionId: string) => {
    if (!defaultShiftId) return;
    setManualPositions((prev) =>
      prev.map((p) => {
        if (p.positionId !== positionId) return p;
        return {
          ...p,
          shifts: [
            ...p.shifts,
            {
              rowId: makeUid('row'),
              shiftId: defaultShiftId,
              counts: [1, 1, 1, 1, 1, 0, 0],
            },
          ],
        };
      })
    );
  };

  const handleRemoveShiftRow = (positionId: string, rowId: string) => {
    setManualPositions((prev) =>
      prev.map((p) =>
        p.positionId === positionId
          ? { ...p, shifts: p.shifts.filter((r) => r.rowId !== rowId) }
          : p
      )
    );
  };

  const handleChangeShiftRowId = (positionId: string, rowId: string, shiftId: string) => {
    setManualPositions((prev) =>
      prev.map((p) =>
        p.positionId === positionId
          ? {
              ...p,
              shifts: p.shifts.map((r) => (r.rowId === rowId ? { ...r, shiftId } : r)),
            }
          : p
      )
    );
  };

  const handleChangeManualCount = (
    positionId: string,
    rowId: string,
    dayIdx: number,
    raw: string
  ) => {
    const parsed = raw.trim() === '' ? 0 : Math.max(0, Math.floor(Number(raw) || 0));
    setManualPositions((prev) =>
      prev.map((p) =>
        p.positionId === positionId
          ? {
              ...p,
              shifts: p.shifts.map((r) => {
                if (r.rowId !== rowId) return r;
                const nextCounts: [number, number, number, number, number, number, number] = [
                  ...r.counts,
                ] as [number, number, number, number, number, number, number];
                nextCounts[dayIdx] = parsed;
                return { ...r, counts: nextCounts };
              }),
            }
          : p
      )
    );
  };

  return (
    <div className="space-y-4">
      {/* Header + Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/shifts"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Volver a Shift Management
            </Link>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400">
              <Calculator className="h-4 w-4" />
            </span>
            Calculadora de Dotación Operacional
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Evalúa la operación actual o dimensiona nuevos servicios para cotizaciones comerciales (sin modificar Supabase).
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900 p-1">
          <button
            type="button"
            onClick={() => {
              setMode('current');
              setExpandedGroupKey(null);
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              mode === 'current'
                ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Operación Actual
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('manual');
              setExpandedGroupKey(null);
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              mode === 'manual'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Nuevo Servicio / Simulación
          </button>
        </div>
      </div>

      {/* Model disclaimer */}
      <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
        <Info className="h-4 w-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
        <span>
          Los cálculos y verificaciones de cobertura corresponden a <strong>resultados del modelo matemático</strong> sobre los turnos definidos en HRM; no constituyen certificación automática de cumplimiento legal ni guardan cambios en base de datos.
        </span>
      </div>

      {/* Shared Parameters + Mode-specific header */}
      <Card className="border-slate-200/70 dark:border-slate-800 shadow-sm">
        <CardContent className="p-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
            {mode === 'current' ? (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Operación / Área</Label>
                  <select
                    aria-label="Filtrar por área"
                    value={filterAreaId}
                    onChange={(e) => handleAreaFilterChange(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs"
                  >
                    <option value="all">Toda la operación</option>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Cargo</Label>
                  <select
                    aria-label="Filtrar por cargo"
                    value={filterPositionName}
                    onChange={(e) => handlePositionFilterChange(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs"
                  >
                    <option value="all">Todos los cargos</option>
                    {availablePositionNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-cyan-600" />
                  Cliente o Proyecto (Cotización)
                </Label>
                <Input
                  type="text"
                  placeholder="Ej: Servicio Nocturno Bodega Norte"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="h-9 text-xs font-medium"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Jornada semanal</Label>
              <select
                aria-label="Jornada semanal"
                value={maxWeeklyHours}
                onChange={(e) => setMaxWeeklyHours(Number(e.target.value) === 40 ? 40 : 42)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium"
              >
                <option value={42}>42 horas (Vigente)</option>
                <option value={40}>40 horas (Abril 2028)</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Régimen</Label>
              <select
                aria-label="Régimen laboral"
                value={regime}
                onChange={(e) => setRegime(e.target.value as WorkRegime)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium"
              >
                <option value="5x2">5x2 (Ordinario)</option>
                <option value="4x4">4x4 (Excepcional)</option>
                <option value="7x7">7x7 (Excepcional)</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">% Vacaciones</Label>
              <Input
                type="number"
                min={0}
                max={45}
                step={0.5}
                aria-label="Porcentaje de vacaciones"
                value={vacationPctStr}
                onChange={(e) => setVacationPctStr(e.target.value)}
                className="h-9 text-xs font-semibold tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">% Ausentismo</Label>
              <Input
                type="number"
                min={0}
                max={45}
                step={0.5}
                aria-label="Porcentaje de ausentismo"
                value={absenteeismPctStr}
                onChange={(e) => setAbsenteeismPctStr(e.target.value)}
                className="h-9 text-xs font-semibold tabular-nums"
              />
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            {regime === '5x2' ? (
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enforceSundays}
                  onChange={(e) => setEnforceSundays(e.target.checked)}
                  className="accent-cyan-600 w-3.5 h-3.5"
                />
                <span>
                  Aplicar regla de <strong>al menos 2 domingos libres al mes</strong> (Art. 38 Código del Trabajo)
                </span>
              </label>
            ) : (
              <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                Régimen excepcional {regime} (cuadrillas alternadas A/B).
              </span>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                Factor de reemplazo: <strong>{replacementFactor.toFixed(3)}×</strong>
              </span>
              {mode === 'current' && (
                !isSimulatingCurrent ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleStartCurrentSimulation}
                    className="h-7 text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5 mr-1" />
                    Simular cambios
                  </Button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!simHasChanges}
                      onClick={handleRestoreCurrentSimulation}
                      className="h-7 text-xs"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Restaurar requerimientos
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleCloseCurrentSimulation}
                      className="h-7 text-xs text-slate-500"
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Cerrar simulación
                    </Button>
                  </div>
                )
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Operation: Temporary In-Memory Simulation Matrix + Comparison */}
      {mode === 'current' && isSimulatingCurrent && simulatedCurrentReport && scenarioComparison && (
        <div className="space-y-3">
          <Card className="border-2 border-dashed border-indigo-300 dark:border-indigo-800 shadow-sm overflow-hidden">
            <CardHeader className="py-2.5 px-4 bg-indigo-50/70 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900/60">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <CardTitle className="text-sm font-semibold text-indigo-950 dark:text-indigo-200 flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-indigo-600" />
                    Escenario Simulado (Solo en memoria)
                    {simHasChanges && (
                      <Badge className="bg-indigo-600 text-white text-[10px]">Modificado</Badge>
                    )}
                  </CardTitle>
                  <p className="text-[11px] text-indigo-800/80 dark:text-indigo-300/80">
                    Edita cantidades, agrega o elimina turnos temporalmente. No modifica requirement_templates ni la operación oficial; al recargar se descarta.
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!simHasChanges}
                    onClick={handleRestoreCurrentSimulation}
                    className="h-7 text-xs bg-white dark:bg-slate-950"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Restaurar requerimientos
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-3 space-y-2.5">
              {(() => {
                const groupedSim = new Map<
                  string,
                  {
                    groupKey: string;
                    areaId: string;
                    areaName: string;
                    positionId: string;
                    positionName: string;
                    rows: SimulatedCurrentRow[];
                  }
                >();
                for (const r of simRows) {
                  const gk = `${r.areaId}||${r.positionId}`;
                  let g = groupedSim.get(gk);
                  if (!g) {
                    g = {
                      groupKey: gk,
                      areaId: r.areaId,
                      areaName: r.areaName,
                      positionId: r.positionId,
                      positionName: r.positionName,
                      rows: [],
                    };
                    groupedSim.set(gk, g);
                  }
                  g.rows.push(r);
                }
                const simGroups = Array.from(groupedSim.values());
                if (simGroups.length === 0) {
                  return (
                    <div className="py-4 text-center text-xs text-muted-foreground">
                      No hay filas en el escenario simulado para el filtro actual. Usa &ldquo;Restaurar requerimientos&rdquo; para recuperar las reglas originales.
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {simGroups.map((grp) => (
                      <div
                        key={grp.groupKey}
                        className="rounded-lg border border-indigo-200/70 dark:border-indigo-900/60 overflow-hidden bg-white dark:bg-slate-950"
                      >
                        <div className="flex items-center justify-between gap-2 bg-indigo-50/40 dark:bg-indigo-950/20 px-3 py-1.5 border-b border-indigo-100 dark:border-indigo-900/50">
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                            {grp.areaName} — {grp.positionName}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleSimAddRow(grp)}
                            className="h-6 px-2 text-[11px]"
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Agregar turno
                          </Button>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase tracking-wider text-muted-foreground">
                                <th className="py-1.5 px-2 text-left font-semibold min-w-[165px]">
                                  Turno
                                </th>
                                {MATRIX_DAYS_ORDER.map((d) => (
                                  <th
                                    key={d.dbDay}
                                    title={d.fullName}
                                    className="py-1.5 px-0.5 text-center font-semibold w-9"
                                  >
                                    {d.label}
                                  </th>
                                ))}
                                <th className="py-1.5 px-1.5 text-right font-semibold w-10">Tot</th>
                                <th className="py-1.5 px-1 w-7"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                              {grp.rows.map((row) => {
                                const rTot = row.counts.reduce((a, b) => a + b, 0);
                                return (
                                  <tr key={row.rowId}>
                                    <td className="py-1 px-2">
                                      <select
                                        aria-label={`Turno simulado ${grp.positionName}`}
                                        value={row.shiftId}
                                        onChange={(e) => handleSimShiftChange(row.rowId, e.target.value)}
                                        className="h-6 w-full rounded border border-input bg-background px-1.5 text-[11px]"
                                      >
                                        {uniqueShifts.map((sh) => {
                                          const eff = resolveShiftDurationHours(sh);
                                          return (
                                            <option key={sh.id} value={sh.id}>
                                              {sh.name} ({sh.start_time?.slice(0, 5)}–{sh.end_time?.slice(0, 5)} · {eff.hours}h)
                                            </option>
                                          );
                                        })}
                                      </select>
                                    </td>
                                    {MATRIX_DAYS_ORDER.map((d, dayIdx) => (
                                      <td key={d.dbDay} className="py-1 px-0.5 text-center tabular-nums">
                                        <input
                                          type="number"
                                          min={0}
                                          step={1}
                                          aria-label={`Simulado ${grp.areaName} ${grp.positionName} ${d.fullName}`}
                                          value={row.counts[dayIdx]}
                                          onChange={(e) =>
                                            handleSimCellChange(row.rowId, dayIdx, e.target.value)
                                          }
                                          className={`w-8 h-6 text-center rounded text-xs font-bold tabular-nums border outline-none ${
                                            row.counts[dayIdx] > 0
                                              ? 'border-indigo-300 bg-indigo-50/70 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200'
                                              : 'border-slate-200 bg-white text-slate-400 dark:border-slate-800 dark:bg-slate-950'
                                          }`}
                                        />
                                      </td>
                                    ))}
                                    <td className="py-1 px-1.5 text-right font-bold tabular-nums">
                                      {rTot}
                                    </td>
                                    <td className="py-1 px-0.5 text-center">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleSimDeleteRow(row.rowId)}
                                        title="Quitar fila del escenario simulado"
                                        className="h-6 w-6 text-slate-400 hover:text-red-600"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Comparative Table: ACTUAL vs SIMULADO */}
          <Card className="border-indigo-200 dark:border-indigo-900 shadow-sm overflow-hidden">
            <CardHeader className="py-2.5 px-4 bg-indigo-50/40 dark:bg-indigo-950/20 border-b border-indigo-100 dark:border-indigo-900/50">
              <CardTitle className="text-sm font-semibold flex flex-wrap items-center justify-between gap-2">
                <span>Comparación de Escenarios: Actual vs Simulado</span>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline" className="bg-white dark:bg-slate-950">
                    Actual: {currentReport.overall.totalRecommendedStaffing} trab. ({currentReport.overall.totalWeeklyShifts} turnos)
                  </Badge>
                  <Badge className="bg-indigo-600 text-white">
                    Simulado: {simulatedCurrentReport.overall.totalRecommendedStaffing} trab. ({simulatedCurrentReport.overall.totalWeeklyShifts} turnos)
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      scenarioComparison.overall.deltaRecommendedStaffing > 0
                        ? 'border-amber-300 bg-amber-50 text-amber-800'
                        : scenarioComparison.overall.deltaRecommendedStaffing < 0
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 text-slate-600'
                    }
                  >
                    Δ Dotación:{' '}
                    {scenarioComparison.overall.deltaRecommendedStaffing > 0
                      ? `+${scenarioComparison.overall.deltaRecommendedStaffing}`
                      : scenarioComparison.overall.deltaRecommendedStaffing}
                  </Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px] uppercase tracking-wider">
                    <TableHead>Área / Cargo</TableHead>
                    <TableHead className="text-center">Turnos (Act → Sim)</TableHead>
                    <TableHead className="text-center">Horas sem / mes (Act → Sim)</TableHead>
                    <TableHead className="text-center">Mín. factible (Act → Sim)</TableHead>
                    <TableHead className="text-center">Recomendada (Act → Sim)</TableHead>
                    <TableHead className="text-center">Variación dotación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scenarioComparison.groups.map((cg) => {
                    const deltaRec = cg.deltaRecommendedStaff ?? 0;
                    const rowChanged =
                      cg.deltaWeeklyShifts !== 0 ||
                      (cg.deltaMinStaff ?? 0) !== 0 ||
                      deltaRec !== 0;
                    return (
                      <TableRow
                        key={cg.groupKey}
                        className={`text-xs ${
                          rowChanged ? 'bg-indigo-50/30 dark:bg-indigo-950/10' : ''
                        }`}
                      >
                        <TableCell className="font-medium">
                          {cg.areaName} — {cg.positionName}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {cg.actual?.weeklyShifts ?? 0} →{' '}
                          <strong>{cg.simulated?.weeklyShifts ?? 0}</strong>
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          <div>
                            {cg.actual?.weeklyHoursRequired ?? 0}h →{' '}
                            <strong>{cg.simulated?.weeklyHoursRequired ?? 0}h</strong>
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            ~{cg.actual?.monthlyHoursEstimated ?? 0}h → ~
                            {cg.simulated?.monthlyHoursEstimated ?? 0}h/mes
                          </div>
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {cg.actual?.theoreticalMinStaff ?? 0} →{' '}
                          <strong>{cg.simulated?.theoreticalMinStaff ?? 0}</strong>
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {cg.actual?.recommendedStaffing ?? 0} →{' '}
                          <strong>{cg.simulated?.recommendedStaffing ?? 0}</strong>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={
                              deltaRec > 0
                                ? 'border-amber-300 bg-amber-50 text-amber-800 font-bold'
                                : deltaRec < 0
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 font-bold'
                                : 'border-slate-200 text-slate-500'
                            }
                          >
                            {deltaRec > 0 ? `+${deltaRec} trab.` : deltaRec < 0 ? `${deltaRec} trab.` : 'Sin cambio'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Manual Mode Demand Builder */}
      {mode === 'manual' && (
        <Card className="border-cyan-200/80 dark:border-cyan-900 shadow-sm">
          <CardHeader className="py-2.5 px-4 bg-cyan-50/40 dark:bg-cyan-950/20 border-b border-cyan-100 dark:border-cyan-900/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-cyan-600" />
                Definición de demanda semanal — {projectName.trim() || 'Nuevo Servicio'}
              </CardTitle>
              <Button
                type="button"
                size="sm"
                onClick={handleAddPosition}
                className="h-7 text-xs bg-cyan-600 hover:bg-cyan-700 text-white"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Agregar cargo
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-3 space-y-3">
            {manualPositions.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Agrega al menos un cargo para simular la dotación requerida.
              </div>
            ) : (
              manualPositions.map((pos) => (
                <div
                  key={pos.positionId}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50/80 dark:bg-slate-900/40 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                      <Label className="text-xs shrink-0">Cargo:</Label>
                      <Input
                        type="text"
                        value={pos.positionName}
                        onChange={(e) => handleRenamePosition(pos.positionId, e.target.value)}
                        placeholder="Nombre del cargo"
                        className="h-7 max-w-xs text-xs font-semibold"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddShiftRow(pos.positionId)}
                        className="h-7 text-xs"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Agregar turno
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemovePosition(pos.positionId)}
                        title="Eliminar cargo"
                        className="h-7 w-7 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase tracking-wider text-muted-foreground bg-white dark:bg-slate-950">
                          <th className="py-1.5 px-2.5 text-left font-semibold min-w-[220px]">
                            Turno (public.shifts)
                          </th>
                          {MATRIX_DAYS_ORDER.map((d) => (
                            <th
                              key={d.dbDay}
                              title={d.fullName}
                              className="py-1.5 px-1 text-center font-semibold w-11"
                            >
                              {d.label}
                            </th>
                          ))}
                          <th className="py-1.5 px-2 text-right font-semibold w-14">Tot</th>
                          <th className="py-1.5 px-1 w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                        {pos.shifts.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="py-3 text-center text-xs text-muted-foreground">
                              Sin turnos agregados. Haz clic en &ldquo;+ Agregar turno&rdquo;.
                            </td>
                          </tr>
                        ) : (
                          pos.shifts.map((row) => {
                            const rowTotal = row.counts.reduce((a, b) => a + b, 0);
                            return (
                              <tr key={row.rowId} className="bg-white dark:bg-slate-950">
                                <td className="py-1.5 px-2.5">
                                  <select
                                    aria-label="Seleccionar turno"
                                    value={row.shiftId}
                                    onChange={(e) =>
                                      handleChangeShiftRowId(
                                        pos.positionId,
                                        row.rowId,
                                        e.target.value
                                      )
                                    }
                                    className="h-7 w-full rounded border border-input bg-background px-2 text-xs"
                                  >
                                    {uniqueShifts.map((sh) => {
                                      const eff = resolveShiftDurationHours(sh);
                                      return (
                                        <option key={sh.id} value={sh.id}>
                                          {sh.name} ({sh.start_time?.slice(0, 5)}–{sh.end_time?.slice(0, 5)} · {eff.hours}h)
                                        </option>
                                      );
                                    })}
                                  </select>
                                </td>
                                {MATRIX_DAYS_ORDER.map((d, dayIdx) => (
                                  <td key={d.dbDay} className="py-1 px-0.5 text-center tabular-nums">
                                    <input
                                      type="number"
                                      min={0}
                                      step={1}
                                      aria-label={`${pos.positionName} ${d.fullName}`}
                                      value={row.counts[dayIdx]}
                                      onChange={(e) =>
                                        handleChangeManualCount(
                                          pos.positionId,
                                          row.rowId,
                                          dayIdx,
                                          e.target.value
                                        )
                                      }
                                      className={`w-10 h-7 text-center rounded text-xs font-bold tabular-nums border outline-none ${
                                        row.counts[dayIdx] > 0
                                          ? 'border-cyan-300 bg-cyan-50/70 text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200'
                                          : 'border-slate-200 bg-white text-slate-400 dark:border-slate-800 dark:bg-slate-950'
                                      }`}
                                    />
                                  </td>
                                ))}
                                <td className="py-1.5 px-2 text-right font-bold tabular-nums">
                                  {rowTotal}
                                </td>
                                <td className="py-1 px-1 text-center">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemoveShiftRow(pos.positionId, row.rowId)}
                                    title="Eliminar turno"
                                    className="h-7 w-7 text-slate-400 hover:text-red-600"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Legal warning for exceptional regimes */}
      {(regime === '4x4' || regime === '7x7') && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50/80 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <strong>Validación legal requerida para régimen {regime}:</strong> Los sistemas excepcionales {regime} requieren autorización expresa y vigente de la Dirección del Trabajo (Art. 38 Código del Trabajo) y operan en cuadrillas alternadas.
          </div>
        </div>
      )}

      {/* Blocked shifts alert */}
      {isPartial && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50/80 px-3.5 py-2.5 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p>
              <strong>Resultado consolidado PARCIAL ({activeReport.overall.blockedGroups} grupo(s) bloqueado(s)):</strong> Se detectaron turnos activos sin duración válida ({activeReport.overall.incompleteShiftNames.join(', ')}).
            </p>
            <p className="text-[11px] opacity-90">
              Grupos bloqueados sin dotación definitiva: <strong>{activeReport.overall.blockedGroupNames.join(' · ')}</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Informative notice when shifts with duration_hours = 0 used schedule-derived hours */}
      {activeReport.overall.derivedShiftNames.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50/70 px-3.5 py-2.5 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div>
            <strong>Duración derivada del horario:</strong> Los turnos{' '}
            <span className="font-semibold">{activeReport.overall.derivedShiftNames.join(', ')}</span> registran{' '}
            <code className="font-mono">duration_hours = 0</code> en base de datos; se aplicó la regla estándar del sistema (horario entrada/salida − 1h colación), sin modificar los registros en Supabase.
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-slate-200/70 dark:border-slate-800 shadow-sm">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Turnos Semanales</span>
              <Clock className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">
                {activeReport.overall.totalWeeklyShifts}
              </span>
              <span className="text-[11px] text-muted-foreground">turnos/sem</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/70 dark:border-slate-800 shadow-sm">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Horas Requeridas</span>
              {isPartial && (
                <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">
                  Parcial
                </Badge>
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">
                {activeReport.overall.knownWeeklyHoursRequired}h
              </span>
              <span className="text-[11px] text-muted-foreground">
                sem · ~{activeReport.overall.knownMonthlyHoursEstimated}h/mes
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/70 dark:border-slate-800 shadow-sm">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Dotación Mínima Factible</span>
              {isPartial && (
                <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">
                  Parcial
                </Badge>
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">
                {activeReport.overall.totalTheoreticalMinStaff}
              </span>
              <span className="text-[11px] text-muted-foreground">
                +{activeReport.overall.totalReplacementAdditionalStaff} reemplazo(s)
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-cyan-200/80 dark:border-cyan-900 shadow-sm bg-cyan-50/30 dark:bg-cyan-950/10">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-xs text-cyan-800 dark:text-cyan-300 font-medium">
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                Dotación Recomendada
              </span>
              {isPartial && (
                <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">
                  Parcial
                </Badge>
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-cyan-700 dark:text-cyan-300">
                {activeReport.overall.totalRecommendedStaffing}
              </span>
              <span className="text-[11px] text-muted-foreground">
                trab. · cap. {activeReport.overall.totalWeeklyCapacityHours}h/sem
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results Table */}
      <Card className="border-slate-200/70 dark:border-slate-800 shadow-sm overflow-hidden">
        <CardHeader className="py-2.5 px-4 bg-slate-50/70 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span>
              {mode === 'current'
                ? `Detalle por Área y Cargo (${activeReport.groups.length})`
                : `Consolidado por Cargo — ${projectName.trim() || 'Nuevo Servicio'} (${activeReport.groups.length})`}
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              Haz clic en una fila para ver su desglose paso a paso
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {activeReport.groups.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {mode === 'current'
                ? 'No hay reglas operacionales para los filtros seleccionados.'
                : 'Ingresa al menos un turno con cantidad mayor a 0 para calcular la dotación del nuevo servicio.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="text-[11px] uppercase tracking-wider">
                  <TableHead>{mode === 'current' ? 'Área / Cargo' : 'Proyecto / Cargo'}</TableHead>
                  <TableHead className="text-center">Turnos/sem</TableHead>
                  <TableHead className="text-center">Horas sem / mes</TableHead>
                  <TableHead className="text-center">Dot. mínima</TableHead>
                  <TableHead className="text-center">Dot. recomendada</TableHead>
                  <TableHead>Restricción dominante</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeReport.groups.map((g) => {
                  const isBlocked = g.status === 'BLOCKED_INVALID_SHIFT_HOURS';
                  const isExpanded = expandedGroupKey === g.groupKey;

                  return (
                    <Fragment key={g.groupKey}>
                      <TableRow
                        onClick={() => setExpandedGroupKey(isExpanded ? null : g.groupKey)}
                        className={`cursor-pointer text-xs transition-colors ${
                          isBlocked
                            ? 'bg-red-50/40 hover:bg-red-50/70 dark:bg-red-950/10'
                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-900/30'
                        }`}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1.5">
                            {isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            )}
                            <div>
                              <span className="font-semibold text-slate-800 dark:text-slate-100">
                                {g.areaName}
                              </span>
                              <span className="text-slate-400 mx-1">—</span>
                              <span className="text-slate-700 dark:text-slate-300">
                                {g.positionName}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-semibold tabular-nums">
                          {g.weeklyShifts}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {isBlocked ? (
                            <span className="text-red-600 font-semibold">—</span>
                          ) : (
                            <div>
                              <span className="font-semibold">{g.weeklyHoursRequired}h</span>
                              <span className="block text-[10px] text-muted-foreground">
                                ~{g.monthlyHoursEstimated}h/mes
                              </span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center tabular-nums font-semibold">
                          {isBlocked ? '—' : g.theoreticalMinStaff}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {isBlocked ? (
                            <span className="text-xs text-red-600 font-medium">Bloqueado</span>
                          ) : (
                            <div className="inline-flex flex-col items-center">
                              <Badge className="bg-cyan-600 hover:bg-cyan-600 text-white font-bold text-xs px-2">
                                {g.recommendedStaffing}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground mt-0.5">
                                +{g.replacementAdditionalStaff} reemp. (aj. {g.adjustedStaffing})
                              </span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="text-slate-700 dark:text-slate-300">
                            {DOMINANT_LABELS[g.lowerBounds.dominantConstraint]}
                          </span>
                        </TableCell>
                        <TableCell>
                          {isBlocked ? (
                            <Badge
                              variant="outline"
                              className="border-red-300 bg-red-50 text-red-700 text-[10px] gap-1"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              {g.incompleteShifts.map((s) => `${s.shiftName} = 0h`).join(', ')}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-emerald-300 bg-emerald-50 text-emerald-700 text-[10px] gap-1"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Calculado
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>

                      {isExpanded && (
                        <TableRow className="bg-slate-50/70 dark:bg-slate-900/30">
                          <TableCell colSpan={7} className="p-3">
                            <div className="space-y-1.5 text-xs">
                              <p className="font-semibold text-slate-700 dark:text-slate-200">
                                Desglose del cálculo — {g.areaName} / {g.positionName}
                              </p>
                              <ul className="list-disc pl-5 space-y-0.5 text-slate-600 dark:text-slate-300">
                                {g.explanation.map((line, i) => (
                                  <li key={i}>{line}</li>
                                ))}
                              </ul>
                              {g.weeklyCapacityHours !== null && (
                                <p className="text-[11px] text-muted-foreground pt-1">
                                  Capacidad semanal recomendada: <strong>{g.weeklyCapacityHours}h</strong> · Utilización estimada: <strong>{g.utilizationPct}%</strong>
                                </p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Methodology Section: "¿Cómo se calculó?" */}
      <Card className="border-slate-200/70 dark:border-slate-800 shadow-sm">
        <CardHeader className="py-2.5 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-cyan-600" />
              ¿Cómo se calculó?
            </CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowMethodology((v) => !v)}
              className="h-7 text-xs"
            >
              {showMethodology ? 'Ocultar' : 'Mostrar'}
            </Button>
          </div>
        </CardHeader>
        {showMethodology && (
          <CardContent className="pt-0 pb-4 px-4 text-xs text-slate-600 dark:text-slate-300 space-y-2.5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border border-slate-100 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-slate-900/30 space-y-1">
                <p className="font-semibold text-slate-800 dark:text-slate-100">
                  1. Cotas inferiores por grupo
                </p>
                <p>
                  • <strong>Pico diario:</strong> máximo de puestos simultáneos en un día (L..D).
                </p>
                <p>
                  • <strong>Capacidad horaria:</strong> horas semanales efectivas ÷ {maxWeeklyHours}h.
                </p>
                <p>
                  • <strong>Días por régimen:</strong> turnos/sem ÷ {regime === '5x2' ? '5' : '3.5'}.
                </p>
                <p>
                  • <strong>Dominical (5x2):</strong> 2 × demanda domingo (mín. 2 domingos libres/mes).
                </p>
              </div>

              <div className="rounded-lg border border-slate-100 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-slate-900/30 space-y-1">
                <p className="font-semibold text-slate-800 dark:text-slate-100">
                  2. Verificación de factibilidad
                </p>
                <p>
                  El modelo valida que la dotación pueda cubrir todos los turnos discretos de la semana cumpliendo: 1 turno/día, tope de días y horas ({maxWeeklyHours}h), descanso mínimo de 11h entre turnos y rotación dominical.
                </p>
                <p>
                  En 4x4 / 7x7 exige cuadrillas pares (A/B) sujetas a autorización de la Dirección del Trabajo.
                </p>
              </div>

              <div className="rounded-lg border border-slate-100 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-slate-900/30 space-y-1">
                <p className="font-semibold text-slate-800 dark:text-slate-100">
                  3. Reemplazos y proyección mensual
                </p>
                <p>
                  <strong>Factor</strong> = 1 ÷ (1 − ({vacationPct}% + {absenteeismPct}%) ÷ 100) ={' '}
                  <strong>{replacementFactor.toFixed(3)}×</strong>
                </p>
                <p>
                  <strong>Recomendada</strong> = techo(Mínima × Factor). <strong>Reemplazos</strong> = Recomendada − Mínima.
                </p>
                <p>
                  <strong>Horas mensuales est.</strong> = Horas semanales × (52 ÷ 12).
                </p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
