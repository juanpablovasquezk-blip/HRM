'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  MapPin,
  Briefcase,
  TableProperties,
  Save,
  X,
  Loader2,
  AlertCircle,
  Pencil,
  Plus,
  Trash2,
  Lock,
  Check,
} from 'lucide-react';
import {
  arePriorityOverridesEqual,
  arePriorityQuotasEqual,
  buildWeeklyMatrix,
  getHighestPriorityFromQuotas,
  MATRIX_DAYS_ORDER,
  PRIORITY_OPTIONS,
  isValidQuantity,
  normalizePriority,
  normalizePriorityOverrides,
  normalizePriorityQuotaItems,
  resolveDayPriority,
  sumPriorityQuotas,
  type DailyPriorityQuotasMap,
  type OperationalPriority,
  type PriorityOverridesMap,
  type PriorityQuotaItem,
  type TemplateLike,
  type TemplatePriorityQuotaRow,
} from './matrix-utils';
import type { WeeklyMatrixRowChange } from '@/app/(dashboard)/shifts/actions';

export interface MatrixAreaOption {
  id: string;
  name: string;
  positions?: Array<{ id: string; name: string }>;
}

export interface MatrixShiftOption {
  id: string;
  name: string;
  duration_hours?: number;
}

interface WeeklyMatrixViewProps {
  templates: TemplateLike[];
  allTemplates?: TemplateLike[];
  templateQuotas?: TemplatePriorityQuotaRow[];
  areas?: MatrixAreaOption[];
  shifts?: MatrixShiftOption[];
  onSaveChanges?: (changes: WeeklyMatrixRowChange[]) => Promise<{ success: boolean; error?: string | null }>;
  onReviewGenerated?: (rowKeys: Array<{ area_id: string; position_id: string; shift_id: string }>) => void;
}

interface NewRuleDraft {
  tempId: string;
  areaId: string;
  positionId: string;
  shiftId: string;
  priority: OperationalPriority;
  priorityOverrides: PriorityOverridesMap;
  priorityQuotas: DailyPriorityQuotasMap;
  counts: string[];
}

interface ActivePopoverState {
  rowId: string;
  dbDay: number;
  dayIdx: number;
  dayLabel: string;
  isNewRow: boolean;
  generalPriority: OperationalPriority;
  currentOverride?: OperationalPriority;
  top: number;
  left: number;
}

function rowKey(areaId: string, positionId: string, shiftId: string): string {
  return `${areaId}||${positionId}||${shiftId}`;
}

function getPriorityMeta(priority: OperationalPriority) {
  return PRIORITY_OPTIONS.find((p) => p.value === priority) || PRIORITY_OPTIONS[2];
}

function parseCell(raw: string): { valid: boolean; num: number } {
  const trimmed = raw.trim();
  if (trimmed === '' || !/^\d+$/.test(trimmed)) {
    return { valid: false, num: 0 };
  }
  const n = Number(trimmed);
  return { valid: isValidQuantity(n), num: n };
}

export function WeeklyMatrixView({
  templates,
  allTemplates,
  templateQuotas = [],
  areas = [],
  shifts = [],
  onSaveChanges,
  onReviewGenerated,
}: WeeklyMatrixViewProps) {
  const baseGroups = useMemo(
    () => buildWeeklyMatrix(templates, templateQuotas),
    [templates, templateQuotas]
  );
  const canEdit = Boolean(onSaveChanges);

  const [isEditing, setIsEditing] = useState(false);
  const [draftValues, setDraftValues] = useState<Record<string, string[]>>({});
  const [draftPriorities, setDraftPriorities] = useState<Record<string, OperationalPriority>>({});
  const [draftOverrides, setDraftOverrides] = useState<Record<string, PriorityOverridesMap>>({});
  const [draftPriorityQuotas, setDraftPriorityQuotas] = useState<Record<string, DailyPriorityQuotasMap>>({});
  const [newRows, setNewRows] = useState<NewRuleDraft[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [activePopover, setActivePopover] = useState<ActivePopoverState | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Reset drafts whenever server templates update
  useEffect(() => {
    setDraftValues({});
    setDraftPriorities({});
    setDraftOverrides({});
    setDraftPriorityQuotas({});
    setNewRows([]);
    setActivePopover(null);
  }, [templates, templateQuotas]);

  // Close popover on outside click or Escape
  useEffect(() => {
    if (!activePopover) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setActivePopover(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActivePopover(null);
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePopover]);

  const { baseCountsMap, basePriorityMap, baseOverridesMap, baseQuotasMap, allExistingKeys } = useMemo(() => {
    const counts = new Map<string, number[]>();
    const priorities = new Map<string, OperationalPriority>();
    const overrides = new Map<string, PriorityOverridesMap>();
    const quotas = new Map<string, DailyPriorityQuotasMap>();
    const allKeys = new Set<string>();

    for (const g of baseGroups) {
      for (const s of g.shifts) {
        const key = rowKey(g.areaId, g.positionId, s.shiftId);
        counts.set(key, [...s.counts]);
        priorities.set(key, s.priority);
        overrides.set(key, { ...s.priorityOverrides });
        quotas.set(key, { ...s.priorityQuotas });
        allKeys.add(key);
      }
    }
    for (const tmpl of allTemplates || []) {
      if (tmpl.is_active === false) continue;
      if (tmpl.area_id && tmpl.position_id && tmpl.shift_id) {
        allKeys.add(rowKey(tmpl.area_id, tmpl.position_id, tmpl.shift_id));
      }
    }
    return {
      baseCountsMap: counts,
      basePriorityMap: priorities,
      baseOverridesMap: overrides,
      baseQuotasMap: quotas,
      allExistingKeys: allKeys,
    };
  }, [baseGroups, allTemplates]);

  const {
    dirtyChanges,
    invalidCellCount,
    dirtyCellCount,
    dirtyPriorityCount,
    dirtyOverrideCount,
    newRowErrors,
    validNewChanges,
  } = useMemo(() => {
    const changes: WeeklyMatrixRowChange[] = [];
    let invalidCount = 0;
    let dirtyCells = 0;
    let dirtyPrios = 0;
    let dirtyOvs = 0;

    for (const g of baseGroups) {
      for (const s of g.shifts) {
        const key = rowKey(g.areaId, g.positionId, s.shiftId);
        const draft = draftValues[key];
        const effectivePrio = draftPriorities[key] ?? s.priority;
        const prioChanged = effectivePrio !== s.priority;
        if (prioChanged) dirtyPrios++;

        const parsedNums: number[] = [];
        let rowHasCellDiff = false;
        let rowValid = true;

        for (let i = 0; i < 7; i++) {
          const raw = draft ? draft[i] : String(s.counts[i]);
          const { valid, num } = parseCell(raw);
          if (!valid) {
            invalidCount++;
            rowValid = false;
          }
          parsedNums.push(num);
          if (raw.trim() !== String(s.counts[i])) {
            dirtyCells++;
            rowHasCellDiff = true;
          }
        }

        const rawEffectiveOverrides = draftOverrides[key] ?? s.priorityOverrides;
        const normalizedOverrides = normalizePriorityOverrides(
          rawEffectiveOverrides,
          effectivePrio,
          rowValid ? parsedNums : undefined
        );
        const ovChanged = !arePriorityOverridesEqual(normalizedOverrides, s.priorityOverrides);
        if (ovChanged) dirtyOvs++;

        const rawQuotas = draftPriorityQuotas[key] ?? s.priorityQuotas;
        const effectiveQuotas: DailyPriorityQuotasMap = {};
        if (rowValid) {
          for (let i = 0; i < 7; i++) {
            const dbDay = MATRIX_DAYS_ORDER[i].dbDay;
            const dKey = String(dbDay);
            const num = parsedNums[i];
            if (num <= 0) continue;
            const existingDayQuotas = normalizePriorityQuotaItems(rawQuotas?.[dKey]);
            if (existingDayQuotas.length > 0 && sumPriorityQuotas(existingDayQuotas) === num) {
              effectiveQuotas[dKey] = existingDayQuotas;
            } else {
              effectiveQuotas[dKey] = [
                {
                  priority: resolveDayPriority(effectivePrio, normalizedOverrides, dbDay),
                  required_count: num,
                },
              ];
            }
          }
        }
        const quotasChanged = rowValid && !arePriorityQuotasEqual(effectiveQuotas, s.priorityQuotas);
        if (quotasChanged && !ovChanged) dirtyOvs++;

        if ((rowHasCellDiff || prioChanged || ovChanged || quotasChanged) && rowValid) {
          changes.push({
            area_id: g.areaId,
            position_id: g.positionId,
            shift_id: s.shiftId,
            priority: effectivePrio,
            priority_overrides: normalizedOverrides,
            priority_quotas: effectiveQuotas,
            counts: parsedNums,
            expected_counts: [...s.counts],
            expected_priority: s.priority,
            expected_priority_overrides: { ...s.priorityOverrides },
          });
        }
      }
    }

    // Validate "+ Nueva regla" rows
    const rowErrs: Record<string, string> = {};
    const newChanges: WeeklyMatrixRowChange[] = [];
    const seenNewKeys = new Set<string>();

    for (const nr of newRows) {
      if (!nr.areaId || !nr.positionId || !nr.shiftId) {
        rowErrs[nr.tempId] = 'Selecciona Área, Cargo y Turno.';
        continue;
      }

      const key = rowKey(nr.areaId, nr.positionId, nr.shiftId);
      if (allExistingKeys.has(key)) {
        rowErrs[nr.tempId] = 'Esta combinación Área + Cargo + Turno ya existe en la matriz.';
        continue;
      }
      if (seenNewKeys.has(key)) {
        rowErrs[nr.tempId] = 'Combinación duplicada entre las nuevas reglas.';
        continue;
      }
      seenNewKeys.add(key);

      const nums: number[] = [];
      let allValid = true;
      let total = 0;
      for (let i = 0; i < 7; i++) {
        const { valid, num } = parseCell(nr.counts[i]);
        if (!valid) {
          allValid = false;
          invalidCount++;
        }
        nums.push(num);
        total += num;
      }

      if (!allValid) {
        rowErrs[nr.tempId] = 'Ingresa enteros mayores o iguales a 0.';
        continue;
      }
      if (total === 0) {
        rowErrs[nr.tempId] = 'Ingresa al menos 1 turno en algún día de la semana.';
        continue;
      }

      const generalPrio = normalizePriority(nr.priority);
      const cleanOverrides = normalizePriorityOverrides(nr.priorityOverrides, generalPrio, nums);
      const newEffectiveQuotas: DailyPriorityQuotasMap = {};
      for (let i = 0; i < 7; i++) {
        const dbDay = MATRIX_DAYS_ORDER[i].dbDay;
        const dKey = String(dbDay);
        const num = nums[i];
        if (num <= 0) continue;
        const dq = normalizePriorityQuotaItems(nr.priorityQuotas?.[dKey]);
        if (dq.length > 0 && sumPriorityQuotas(dq) === num) {
          newEffectiveQuotas[dKey] = dq;
        } else {
          newEffectiveQuotas[dKey] = [
            {
              priority: resolveDayPriority(generalPrio, cleanOverrides, dbDay),
              required_count: num,
            },
          ];
        }
      }

      newChanges.push({
        area_id: nr.areaId,
        position_id: nr.positionId,
        shift_id: nr.shiftId,
        priority: generalPrio,
        priority_overrides: cleanOverrides,
        priority_quotas: newEffectiveQuotas,
        counts: nums,
        is_new: true,
      });
    }

    return {
      dirtyChanges: changes,
      invalidCellCount: invalidCount,
      dirtyCellCount: dirtyCells,
      dirtyPriorityCount: dirtyPrios,
      dirtyOverrideCount: dirtyOvs,
      newRowErrors: rowErrs,
      validNewChanges: newChanges,
    };
  }, [baseGroups, draftValues, draftPriorities, draftOverrides, newRows, allExistingKeys]);

  const hasPending =
    dirtyCellCount > 0 || dirtyPriorityCount > 0 || dirtyOverrideCount > 0 || newRows.length > 0;
  const newRowErrorCount = Object.keys(newRowErrors).length;
  const allChanges = [...dirtyChanges, ...validNewChanges];

  useEffect(() => {
    if (!isEditing || !hasPending) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isEditing, hasPending]);

  const handleCellChange = (key: string, dayIdx: number, value: string) => {
    const base = baseCountsMap.get(key) || [0, 0, 0, 0, 0, 0, 0];
    setDraftValues((prev) => {
      const current = prev[key] ? [...prev[key]] : base.map(String);
      current[dayIdx] = value;
      return { ...prev, [key]: current };
    });

    // Clear daily priority exception automatically when count becomes 0 or invalid
    const parsed = parseCell(value);
    const dbDay = MATRIX_DAYS_ORDER[dayIdx].dbDay;
    if (!parsed.valid || parsed.num <= 0) {
      setDraftOverrides((prev) => {
        const current = { ...(prev[key] ?? baseOverridesMap.get(key) ?? {}) };
        if (!(String(dbDay) in current)) return prev;
        delete current[String(dbDay)];
        return { ...prev, [key]: current };
      });
      if (activePopover && !activePopover.isNewRow && activePopover.rowId === key && activePopover.dbDay === dbDay) {
        setActivePopover(null);
      }
    }
  };

  const handlePriorityChange = (key: string, priority: OperationalPriority) => {
    const basePrio = basePriorityMap.get(key) || 'NORMAL';
    const prevGeneralPrio = draftPriorities[key] ?? basePrio;
    setDraftPriorities((prev) => {
      if (priority === basePrio) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: priority };
    });

    // Remove overrides that match the new general priority
    setDraftOverrides((prev) => {
      const current = prev[key] ?? baseOverridesMap.get(key);
      if (!current) return prev;
      const cleaned = normalizePriorityOverrides(current, priority);
      return { ...prev, [key]: cleaned };
    });

    // Sync single-group days in draftPriorityQuotas that inherited the previous general priority
    setDraftPriorityQuotas((prev) => {
      const currentQuotas = { ...(prev[key] ?? baseQuotasMap.get(key) ?? {}) };
      const currentOv = draftOverrides[key] ?? baseOverridesMap.get(key) ?? {};
      let changed = false;
      for (const { dbDay } of MATRIX_DAYS_ORDER) {
        const dKey = String(dbDay);
        const dayItems = normalizePriorityQuotaItems(currentQuotas[dKey]);
        if (dayItems.length === 1 && !currentOv[dKey] && dayItems[0].priority === prevGeneralPrio) {
          currentQuotas[dKey] = [{ priority, required_count: dayItems[0].required_count }];
          changed = true;
        }
      }
      return changed ? { ...prev, [key]: currentQuotas } : prev;
    });
  };

  const handleSetDayOverride = (
    rowId: string,
    isNewRow: boolean,
    dbDay: number,
    generalPriority: OperationalPriority,
    overrideValue: OperationalPriority | null
  ) => {
    if (isNewRow) {
      setNewRows((prev) =>
        prev.map((row) => {
          if (row.tempId !== rowId) return row;
          const next = { ...row.priorityOverrides };
          if (!overrideValue || overrideValue === generalPriority) {
            delete next[String(dbDay)];
          } else {
            next[String(dbDay)] = overrideValue;
          }
          return { ...row, priorityOverrides: next };
        })
      );
    } else {
      setDraftOverrides((prev) => {
        const current = { ...(prev[rowId] ?? baseOverridesMap.get(rowId) ?? {}) };
        if (!overrideValue || overrideValue === generalPriority) {
          delete current[String(dbDay)];
        } else {
          current[String(dbDay)] = overrideValue;
        }
        return { ...prev, [rowId]: current };
      });
    }
    setActivePopover(null);
  };

  const handleSetDayPriorityQuotas = (
    rowId: string,
    isNewRow: boolean,
    dbDay: number,
    dayIdx: number,
    generalPriority: OperationalPriority,
    items: PriorityQuotaItem[]
  ) => {
    const clean = normalizePriorityQuotaItems(items);
    const total = sumPriorityQuotas(clean);
    const highestPrio = getHighestPriorityFromQuotas(clean, generalPriority);
    const dKey = String(dbDay);

    if (isNewRow) {
      setNewRows((prev) =>
        prev.map((row) => {
          if (row.tempId !== rowId) return row;
          const nextCounts = [...row.counts];
          nextCounts[dayIdx] = String(total);
          const nextQuotas = { ...row.priorityQuotas };
          if (clean.length > 0) nextQuotas[dKey] = clean;
          else delete nextQuotas[dKey];
          const nextOverrides = { ...row.priorityOverrides };
          if (total <= 0 || highestPrio === generalPriority) delete nextOverrides[dKey];
          else nextOverrides[dKey] = highestPrio;
          return { ...row, counts: nextCounts, priorityQuotas: nextQuotas, priorityOverrides: nextOverrides };
        })
      );
    } else {
      const baseCounts = baseCountsMap.get(rowId) || [0, 0, 0, 0, 0, 0, 0];
      setDraftValues((prev) => {
        const current = prev[rowId] ? [...prev[rowId]] : baseCounts.map(String);
        current[dayIdx] = String(total);
        return { ...prev, [rowId]: current };
      });
      setDraftPriorityQuotas((prev) => {
        const current = { ...(prev[rowId] ?? baseQuotasMap.get(rowId) ?? {}) };
        if (clean.length > 0) current[dKey] = clean;
        else delete current[dKey];
        return { ...prev, [rowId]: current };
      });
      setDraftOverrides((prev) => {
        const current = { ...(prev[rowId] ?? baseOverridesMap.get(rowId) ?? {}) };
        if (total <= 0 || highestPrio === generalPriority) delete current[dKey];
        else current[dKey] = highestPrio;
        return { ...prev, [rowId]: current };
      });
    }
  };

  const openCellPopover = (
    e: React.MouseEvent<HTMLButtonElement>,
    params: {
      rowId: string;
      dbDay: number;
      dayIdx: number;
      dayLabel: string;
      isNewRow: boolean;
      generalPriority: OperationalPriority;
      currentOverride?: OperationalPriority;
    }
  ) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const popoverWidth = 280;
    const left = Math.min(Math.max(8, rect.left - popoverWidth + 24), window.innerWidth - popoverWidth - 8);
    const top = Math.min(rect.bottom + 6, window.innerHeight - 300);

    setActivePopover((prev) =>
      prev && prev.rowId === params.rowId && prev.dbDay === params.dbDay && prev.isNewRow === params.isNewRow
        ? null
        : { ...params, top, left }
    );
  };

  const handleAddNewRow = () => {
    setIsEditing(true);
    setNewRows((prev) => [
      ...prev,
      {
        tempId: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        areaId: '',
        positionId: '',
        shiftId: '',
        priority: 'NORMAL',
        priorityOverrides: {},
        priorityQuotas: {},
        counts: ['0', '0', '0', '0', '0', '0', '0'],
      },
    ]);
  };

  const handleUpdateNewRow = (tempId: string, patch: Partial<NewRuleDraft>) => {
    setNewRows((prev) =>
      prev.map((row) => {
        if (row.tempId !== tempId) return row;
        const updated = { ...row, ...patch };
        if (patch.priority) {
          updated.priorityOverrides = normalizePriorityOverrides(updated.priorityOverrides, patch.priority);
        }
        return updated;
      })
    );
  };

  const handleUpdateNewRowCell = (tempId: string, dayIdx: number, value: string) => {
    const parsed = parseCell(value);
    const dbDay = MATRIX_DAYS_ORDER[dayIdx].dbDay;
    setNewRows((prev) =>
      prev.map((row) => {
        if (row.tempId !== tempId) return row;
        const nextCounts = [...row.counts];
        nextCounts[dayIdx] = value;
        const nextOverrides = { ...row.priorityOverrides };
        if (!parsed.valid || parsed.num <= 0) {
          delete nextOverrides[String(dbDay)];
        }
        return { ...row, counts: nextCounts, priorityOverrides: nextOverrides };
      })
    );
  };

  const handleRemoveNewRow = (tempId: string) => {
    setNewRows((prev) => prev.filter((row) => row.tempId !== tempId));
    if (activePopover?.isNewRow && activePopover.rowId === tempId) {
      setActivePopover(null);
    }
  };

  const handleCancel = () => {
    if (
      hasPending &&
      !window.confirm('Tienes cambios sin guardar en la matriz semanal. ¿Deseas descartarlos?')
    ) {
      return;
    }
    setDraftValues({});
    setDraftPriorities({});
    setDraftOverrides({});
    setNewRows([]);
    setActivePopover(null);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (
      !onSaveChanges ||
      allChanges.length === 0 ||
      invalidCellCount > 0 ||
      newRowErrorCount > 0 ||
      isSaving
    ) {
      return;
    }
    setActivePopover(null);
    setIsSaving(true);
    try {
      const res = await onSaveChanges(allChanges);
      if (res.success) {
        setDraftValues({});
        setDraftPriorities({});
        setDraftOverrides({});
        setNewRows([]);
        setIsEditing(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const activeEdit = canEdit && isEditing;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 transition-all ${
          activeEdit && hasPending
            ? 'border-blue-300 bg-blue-50/80 dark:border-blue-800 dark:bg-blue-950/30 shadow-sm'
            : activeEdit
            ? 'border-orange-200 bg-orange-50/40 dark:border-orange-900/60 dark:bg-orange-950/20'
            : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-950/50'
        }`}
      >
        <div className="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-2">
          {!canEdit ? (
            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              Modo consulta (solo lectura).
            </span>
          ) : !isEditing ? (
            <span>
              Matriz semanal permanente en modo consulta. Los puntos de color indican días con prioridad especial; haz clic en <strong>Editar matriz</strong> para modificar.
            </span>
          ) : invalidCellCount > 0 || newRowErrorCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400 font-semibold">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Corrige los campos marcados antes de guardar ({invalidCellCount + newRowErrorCount} error(es)).
            </span>
          ) : hasPending ? (
            <span className="font-medium text-blue-800 dark:text-blue-200">
              <strong>{allChanges.length}</strong> fila(s) modificada(s)/nueva(s) lista(s) para guardar. No modifica meses generados ni turnos publicados.
            </span>
          ) : (
            <span>
              Modo edición activo. Ajusta cantidades (≥ 0), prioridad general o haz clic en el punto de cada día (&gt; 0) para definir excepciones.
            </span>
          )}
        </div>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            {!isEditing ? (
              <>
                {onReviewGenerated && baseGroups.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const keys = baseGroups.flatMap((g) =>
                        g.shifts.map((s) => ({
                          area_id: g.areaId,
                          position_id: g.positionId,
                          shift_id: s.shiftId,
                        }))
                      );
                      onReviewGenerated(keys);
                    }}
                    className="h-8 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                  >
                    Revisar fechas generadas
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddNewRow}
                  className="h-8 text-xs"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Nueva regla
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="h-8 text-xs bg-orange-600 hover:bg-orange-700 text-white"
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Editar matriz
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddNewRow}
                  disabled={isSaving}
                  className="h-8 text-xs"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Nueva regla
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="h-8 text-xs"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSave}
                  disabled={
                    isSaving ||
                    invalidCellCount > 0 ||
                    newRowErrorCount > 0 ||
                    allChanges.length === 0
                  }
                  className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5 mr-1" />
                      Guardar cambios
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Inline "+ Nueva regla" table */}
      {activeEdit && newRows.length > 0 && (
        <Card className="border-blue-200 dark:border-blue-900 shadow-sm overflow-hidden">
          <CardHeader className="py-2 px-3 bg-blue-50/70 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900/60">
            <CardTitle className="text-xs font-semibold text-blue-900 dark:text-blue-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Nuevas reglas semanales ({newRows.length})
              </span>
              <span className="font-normal text-[11px] text-blue-700 dark:text-blue-300">
                Se guardarán atómicamente al presionar Guardar cambios
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase tracking-wider text-muted-foreground bg-white dark:bg-slate-950">
                  <th className="py-1.5 px-2 text-left font-semibold min-w-[130px]">Área</th>
                  <th className="py-1.5 px-2 text-left font-semibold min-w-[140px]">Cargo</th>
                  <th className="py-1.5 px-2 text-left font-semibold min-w-[120px]">Turno</th>
                  <th className="py-1.5 px-2 text-left font-semibold w-24">Prioridad</th>
                  {MATRIX_DAYS_ORDER.map((d) => (
                    <th key={d.dbDay} title={d.fullName} className="py-1.5 px-1 text-center font-semibold w-10">
                      {d.label}
                    </th>
                  ))}
                  <th className="py-1.5 px-2 text-right font-semibold w-12">Total</th>
                  <th className="py-1.5 px-2 text-center font-semibold w-9"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {newRows.map((nr) => {
                  const areaObj = areas.find((a) => a.id === nr.areaId);
                  const posOptions = areaObj?.positions || [];
                  const errMsg = newRowErrors[nr.tempId];
                  let rowTotal = 0;
                  const parsedCells = nr.counts.map((raw) => {
                    const p = parseCell(raw);
                    if (p.valid) rowTotal += p.num;
                    return { raw, ...p };
                  });

                  return (
                    <tr key={nr.tempId} className="bg-white dark:bg-slate-950">
                      <td className="py-1.5 px-2 align-top">
                        <select
                          aria-label="Área nueva regla"
                          value={nr.areaId}
                          disabled={isSaving}
                          onChange={(e) =>
                            handleUpdateNewRow(nr.tempId, {
                              areaId: e.target.value,
                              positionId: '',
                            })
                          }
                          className="w-full h-7 rounded border border-input bg-background px-1.5 text-xs"
                        >
                          <option value="">Seleccionar...</option>
                          {areas.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                        {errMsg && (
                          <p className="text-[10px] text-red-600 dark:text-red-400 mt-1 font-medium">
                            {errMsg}
                          </p>
                        )}
                      </td>
                      <td className="py-1.5 px-2 align-top">
                        <select
                          aria-label="Cargo nueva regla"
                          value={nr.positionId}
                          disabled={!nr.areaId || isSaving}
                          onChange={(e) =>
                            handleUpdateNewRow(nr.tempId, { positionId: e.target.value })
                          }
                          className="w-full h-7 rounded border border-input bg-background px-1.5 text-xs disabled:opacity-50"
                        >
                          <option value="">Seleccionar...</option>
                          {posOptions.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1.5 px-2 align-top">
                        <select
                          aria-label="Turno nueva regla"
                          value={nr.shiftId}
                          disabled={isSaving}
                          onChange={(e) =>
                            handleUpdateNewRow(nr.tempId, { shiftId: e.target.value })
                          }
                          className="w-full h-7 rounded border border-input bg-background px-1.5 text-xs"
                        >
                          <option value="">Seleccionar...</option>
                          {shifts.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1.5 px-2 align-top">
                        <select
                          aria-label="Prioridad nueva regla"
                          value={nr.priority}
                          disabled={isSaving}
                          onChange={(e) =>
                            handleUpdateNewRow(nr.tempId, {
                              priority: normalizePriority(e.target.value),
                            })
                          }
                          className="w-full h-7 rounded border border-input bg-background px-1 text-xs"
                        >
                          {PRIORITY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      {parsedCells.map((cell, idx) => {
                        const dayMeta = MATRIX_DAYS_ORDER[idx];
                        const dayOv = nr.priorityOverrides[String(dayMeta.dbDay)];
                        const hasOv = Boolean(dayOv && dayOv !== nr.priority && cell.num > 0);
                        const ovMeta = hasOv && dayOv ? getPriorityMeta(dayOv) : null;

                        return (
                          <td key={idx} className="py-1.5 px-0.5 text-center align-top tabular-nums">
                            <div className="relative inline-flex items-center justify-center">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                aria-label={`Nueva regla ${dayMeta.fullName}`}
                                value={cell.raw}
                                disabled={isSaving}
                                onChange={(e) =>
                                  handleUpdateNewRowCell(nr.tempId, idx, e.target.value)
                                }
                                className={`w-9 h-7 text-center rounded text-xs font-bold tabular-nums border outline-none ${
                                  !cell.valid
                                    ? 'border-red-500 bg-red-50 text-red-700'
                                    : cell.num > 0
                                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                                    : 'border-slate-200 bg-white text-slate-500'
                                }`}
                              />
                              {cell.valid && cell.num > 0 && (
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  onClick={(e) =>
                                    openCellPopover(e, {
                                      rowId: nr.tempId,
                                      dbDay: dayMeta.dbDay,
                                      dayIdx: idx,
                                      dayLabel: dayMeta.fullName,
                                      isNewRow: true,
                                      generalPriority: nr.priority,
                                      currentOverride: dayOv,
                                    })
                                  }
                                  title={
                                    ovMeta
                                      ? `Prioridad ${dayMeta.fullName}: ${ovMeta.label}`
                                      : `Definir prioridad especial para ${dayMeta.fullName}`
                                  }
                                  aria-label={`Prioridad ${dayMeta.fullName} nueva regla`}
                                  className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-950 transition-transform hover:scale-125 ${
                                    ovMeta ? ovMeta.dotClass : 'bg-slate-300 hover:bg-orange-400'
                                  }`}
                                />
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="py-2 px-2 text-right font-bold tabular-nums align-top text-slate-700 dark:text-slate-200">
                        {rowTotal}
                      </td>
                      <td className="py-1.5 px-1 text-center align-top">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveNewRow(nr.tempId)}
                          disabled={isSaving}
                          title="Quitar fila"
                          className="h-7 w-7 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Matrix Cards: 2 columns on xl desktop, 1 column on smaller screens */}
      {baseGroups.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <TableProperties className="h-8 w-8 mx-auto mb-3 opacity-40" />
            No se encontraron reglas con los filtros aplicados.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {baseGroups.map((group) => {
            const liveDailyTotals = [0, 0, 0, 0, 0, 0, 0];
            let liveGroupWeeklyTotal = 0;

            const liveRows = group.shifts.map((shift) => {
              const key = rowKey(group.areaId, group.positionId, shift.shiftId);
              const draft = draftValues[key];
              const effectivePrio = draftPriorities[key] ?? shift.priority;
              const prioChanged = effectivePrio !== shift.priority;
              const rawOverrides = draftOverrides[key] ?? shift.priorityOverrides;
              const rawQuotasMap = draftPriorityQuotas[key] ?? shift.priorityQuotas;
              let rowTotal = 0;

              const cells = MATRIX_DAYS_ORDER.map((dayMeta, idx) => {
                const raw = draft ? draft[idx] : String(shift.counts[idx]);
                const { valid, num } = parseCell(raw);
                const isDirty = raw.trim() !== String(shift.counts[idx]);
                const effectiveNum = valid ? num : 0;
                const dayKey = String(dayMeta.dbDay);
                const baseOv = shift.priorityOverrides[dayKey];
                const curOv = effectiveNum > 0 ? rawOverrides[dayKey] : undefined;
                const effectiveDayPrio = resolveDayPriority(
                  effectivePrio,
                  effectiveNum > 0 ? rawOverrides : undefined,
                  dayMeta.dbDay
                );
                const hasOverride = Boolean(effectiveNum > 0 && curOv && curOv !== effectivePrio);
                const ovDirty = (curOv ?? null) !== (baseOv ?? null);

                const explicitDayQuotas = normalizePriorityQuotaItems(rawQuotasMap?.[dayKey]);
                const dayQuotas: PriorityQuotaItem[] =
                  effectiveNum <= 0
                    ? []
                    : explicitDayQuotas.length > 0 && sumPriorityQuotas(explicitDayQuotas) === effectiveNum
                      ? explicitDayQuotas
                      : [{ priority: effectiveDayPrio, required_count: effectiveNum }];
                const baseDayQuotas = normalizePriorityQuotaItems(shift.priorityQuotas?.[dayKey]);
                const quotasDirty =
                  dayQuotas.length !== baseDayQuotas.length ||
                  dayQuotas.some((q, qIdx) => q.priority !== baseDayQuotas[qIdx]?.priority || q.required_count !== baseDayQuotas[qIdx]?.required_count);

                liveDailyTotals[idx] += effectiveNum;
                rowTotal += effectiveNum;
                return {
                  raw,
                  valid,
                  num: effectiveNum,
                  isDirty,
                  dayMeta,
                  curOv,
                  effectiveDayPrio,
                  hasOverride,
                  ovDirty,
                  dayQuotas,
                  quotasDirty,
                };
              });

              liveGroupWeeklyTotal += rowTotal;
              return { shift, key, cells, rowTotal, effectivePrio, prioChanged };
            });

            return (
              <Card
                key={group.groupKey}
                className="border-slate-200/70 dark:border-slate-800 shadow-sm overflow-hidden"
              >
                <CardHeader className="py-2 px-3 bg-slate-50/70 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-xs sm:text-sm font-semibold flex items-center gap-1.5 min-w-0">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 shrink-0">
                        <MapPin className="h-3.5 w-3.5" />
                      </span>
                      <span className="truncate">{group.areaName}</span>
                      <span className="text-slate-400 font-normal shrink-0">—</span>
                      <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200 truncate">
                        <Briefcase className="h-3 w-3 text-slate-400 shrink-0" />
                        <span className="truncate">{group.positionName}</span>
                      </span>
                    </CardTitle>
                    <Badge variant="secondary" className="text-[11px] font-semibold tabular-nums shrink-0 px-2 py-0.5">
                      {liveGroupWeeklyTotal} t/sem
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase tracking-wider text-muted-foreground bg-white dark:bg-slate-950">
                        <th className="py-1.5 px-2.5 text-left font-semibold min-w-[105px]">Turno</th>
                        <th className="py-1.5 px-1.5 text-left font-semibold w-20">Prioridad</th>
                        {MATRIX_DAYS_ORDER.map((d) => (
                          <th
                            key={d.dbDay}
                            title={d.fullName}
                            className="py-1.5 px-0.5 text-center font-semibold w-9"
                          >
                            {d.label}
                          </th>
                        ))}
                        <th className="py-1.5 px-2.5 text-right font-semibold w-12">Tot</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {liveRows.map(({ shift, key, cells, rowTotal, effectivePrio, prioChanged }) => {
                        const prioMeta = getPriorityMeta(effectivePrio);
                        return (
                          <tr
                            key={shift.shiftId}
                            className="hover:bg-slate-50/60 dark:hover:bg-slate-900/30 transition-colors"
                          >
                            <td className="py-1.5 px-2.5 font-medium text-slate-800 dark:text-slate-200">
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  <Badge variant="secondary" className="font-semibold text-[11px] px-1.5 py-0">
                                    {shift.shiftName}
                                  </Badge>
                                  {shift.templateCount > 1 && (
                                    <span
                                      className="text-[10px] text-muted-foreground"
                                      title="Consolidado desde múltiples reglas"
                                    >
                                      ({shift.templateCount})
                                    </span>
                                  )}
                                </div>
                                {group.areaName.toLowerCase().includes('blue') &&
                                  (group.positionName.toLowerCase().includes('conductor') ||
                                    group.positionName.toLowerCase().includes('ayudante')) &&
                                  (shift.startTime.startsWith('00:00') ||
                                    shift.shiftName.toUpperCase().includes('00')) && (
                                    <span
                                      className="text-[9px] text-indigo-700 dark:text-indigo-300 font-medium leading-tight"
                                      title="La cantidad nocturna se calcula en Generar Mes; aquí editas la prioridad."
                                    >
                                      Prioridad editable · Cant. vía Blue Express
                                    </span>
                                  )}
                              </div>
                            </td>
                            <td className="py-1 px-1.5">
                              {activeEdit ? (
                                <select
                                  aria-label={`Prioridad ${group.areaName} ${group.positionName} ${shift.shiftName}`}
                                  value={effectivePrio}
                                  disabled={isSaving}
                                  onChange={(e) =>
                                    handlePriorityChange(key, normalizePriority(e.target.value))
                                  }
                                  className={`h-6 w-[74px] rounded border px-1 text-[11px] font-medium outline-none transition-all ${
                                    prioChanged
                                      ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-400 dark:bg-blue-950/40 dark:text-blue-200'
                                      : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'
                                  }`}
                                >
                                  {PRIORITY_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span
                                  className={`inline-flex items-center rounded border px-1.5 py-0 text-[10px] font-semibold leading-4 ${prioMeta.badgeClass}`}
                                >
                                  {prioMeta.label}
                                </span>
                              )}
                            </td>
                            {cells.map((cell, idx) => {
                              const ovMeta = cell.hasOverride
                                ? getPriorityMeta(cell.effectiveDayPrio)
                                : null;

                              return (
                                <td key={idx} className="py-1 px-0.5 text-center tabular-nums">
                                  {activeEdit ? (
                                    <>
                                      <div className="relative inline-flex items-center justify-center">
                                        <input
                                          type="number"
                                          min={0}
                                          step={1}
                                          aria-label={`${group.areaName} ${group.positionName} ${shift.shiftName} ${cell.dayMeta.fullName}`}
                                          value={cell.raw}
                                          disabled={isSaving}
                                          onChange={(e) => handleCellChange(key, idx, e.target.value)}
                                          className={`w-9 h-6 text-center rounded text-xs font-bold tabular-nums border outline-none transition-all ${
                                            !cell.valid
                                              ? 'border-red-500 bg-red-50 text-red-700 ring-1 ring-red-400 dark:bg-red-950/40 dark:text-red-300'
                                              : cell.isDirty || cell.ovDirty || cell.quotasDirty
                                              ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-400 dark:bg-blue-950/40 dark:text-blue-200'
                                              : cell.num > 0
                                              ? 'border-orange-200 bg-orange-50/80 text-orange-700 focus:border-orange-500 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300'
                                              : 'border-slate-200 bg-white text-slate-400 focus:border-orange-400 focus:text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-600'
                                          }`}
                                        />
                                        {cell.valid && cell.num > 0 && (
                                          <button
                                            type="button"
                                            disabled={isSaving}
                                            onClick={(e) =>
                                              openCellPopover(e, {
                                                rowId: key,
                                                dbDay: cell.dayMeta.dbDay,
                                                dayIdx: idx,
                                                dayLabel: cell.dayMeta.fullName,
                                                isNewRow: false,
                                                generalPriority: effectivePrio,
                                                currentOverride: cell.curOv,
                                              })
                                            }
                                            title={
                                              cell.dayQuotas.length > 1
                                                ? `${cell.dayMeta.fullName}: ${cell.dayQuotas.map((q) => `${q.required_count} ${getPriorityMeta(q.priority).label}`).join(' + ')}. Clic para editar desglose.`
                                                : ovMeta
                                                  ? `${cell.dayMeta.fullName}: Prioridad especial ${ovMeta.label} (General: ${prioMeta.label}). Clic para editar desglose.`
                                                  : `${cell.dayMeta.fullName}: Hereda prioridad general (${prioMeta.label}). Clic para desglose por prioridad.`
                                            }
                                            aria-label={`Prioridad ${cell.dayMeta.fullName} ${shift.shiftName}`}
                                            className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-950 transition-transform hover:scale-125 ${
                                              cell.dayQuotas.length > 1
                                                ? 'bg-indigo-600'
                                                : ovMeta
                                                  ? ovMeta.dotClass
                                                  : 'bg-slate-300 hover:bg-orange-400 dark:bg-slate-700'
                                            }`}
                                          />
                                        )}
                                      </div>
                                      {cell.dayQuotas.length > 1 && (
                                        <div className="mt-0.5 flex flex-wrap justify-center gap-0.5 leading-none">
                                          {cell.dayQuotas.map((q) => (
                                            <span key={q.priority} className={`text-[9px] font-semibold px-1 rounded ${getPriorityMeta(q.priority).badgeClass}`}>
                                              {q.required_count}{q.priority === 'CRITICAL' ? 'C' : q.priority === 'HIGH' ? 'A' : q.priority === 'NORMAL' ? 'N' : 'B'}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </>
                                  ) : cell.num > 0 ? (
                                    <div className="inline-flex flex-col items-center">
                                      <span
                                        title={
                                          cell.dayQuotas.length > 1
                                            ? `${cell.dayMeta.fullName}: ${cell.dayQuotas.map((q) => `${q.required_count} ${getPriorityMeta(q.priority).label}`).join(' + ')}`
                                            : ovMeta
                                              ? `${cell.dayMeta.fullName}: Prioridad especial ${ovMeta.label} (General: ${prioMeta.label})`
                                              : undefined
                                        }
                                        className="relative inline-flex items-center justify-center min-w-[22px] h-5 px-1 rounded bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 font-bold text-[11px]"
                                      >
                                        {cell.num}
                                        {(ovMeta || cell.dayQuotas.length > 1) && (
                                          <span
                                            className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-1 ring-white dark:ring-slate-950 ${cell.dayQuotas.length > 1 ? 'bg-indigo-600' : ovMeta!.dotClass}`}
                                          />
                                        )}
                                      </span>
                                      {cell.dayQuotas.length > 1 && (
                                        <div className="mt-0.5 flex flex-wrap justify-center gap-0.5 leading-none">
                                          {cell.dayQuotas.map((q) => (
                                            <span key={q.priority} className={`text-[9px] font-semibold px-1 rounded ${getPriorityMeta(q.priority).badgeClass}`}>
                                              {q.required_count}{q.priority === 'CRITICAL' ? 'C' : q.priority === 'HIGH' ? 'A' : q.priority === 'NORMAL' ? 'N' : 'B'}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-300 dark:text-slate-700 text-[11px]">0</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="py-1.5 px-2.5 text-right font-bold tabular-nums text-slate-700 dark:text-slate-200">
                              {rowTotal}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 font-bold text-[11px]">
                        <td colSpan={2} className="py-1.5 px-2.5 text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                          Total Diario
                        </td>
                        {liveDailyTotals.map((tot, idx) => (
                          <td key={idx} className="py-1.5 px-0.5 text-center tabular-nums text-slate-800 dark:text-slate-100">
                            {tot}
                          </td>
                        ))}
                        <td className="py-1.5 px-2.5 text-right tabular-nums text-orange-600 dark:text-orange-400 text-xs">
                          {liveGroupWeeklyTotal}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Floating compact daily priority-groups popover */}
      {activeEdit && activePopover && (() => {
        const dKey = String(activePopover.dbDay);
        const targetRow = activePopover.isNewRow
          ? newRows.find((r) => r.tempId === activePopover.rowId)
          : null;
        const rowCounts = activePopover.isNewRow
          ? (targetRow?.counts || []).map((c) => parseCell(c).num)
          : (draftValues[activePopover.rowId]
              ? draftValues[activePopover.rowId].map((c) => parseCell(c).num)
              : baseCountsMap.get(activePopover.rowId) || [0, 0, 0, 0, 0, 0, 0]);
        const currentDayTotal = rowCounts[activePopover.dayIdx] ?? 0;
        const rawMap = activePopover.isNewRow
          ? targetRow?.priorityQuotas
          : (draftPriorityQuotas[activePopover.rowId] ?? baseQuotasMap.get(activePopover.rowId));
        const rawOvMap = activePopover.isNewRow
          ? targetRow?.priorityOverrides
          : (draftOverrides[activePopover.rowId] ?? baseOverridesMap.get(activePopover.rowId));
        const explicitItems = normalizePriorityQuotaItems(rawMap?.[dKey]);
        const currentItems: PriorityQuotaItem[] =
          explicitItems.length > 0 && sumPriorityQuotas(explicitItems) === currentDayTotal
            ? explicitItems
            : currentDayTotal > 0
              ? [{ priority: resolveDayPriority(activePopover.generalPriority, rawOvMap, activePopover.dbDay), required_count: currentDayTotal }]
              : [];

        const usedPrios = new Set(currentItems.map((i) => i.priority));
        const nextUnusedPrio = PRIORITY_OPTIONS.find((o) => !usedPrios.has(o.value))?.value;

        return (
          <div
            ref={popoverRef}
            style={{ top: activePopover.top, left: activePopover.left }}
            className="fixed z-50 w-72 rounded-lg border border-slate-200 bg-white p-2.5 shadow-xl dark:border-slate-800 dark:bg-slate-950 space-y-2"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                {activePopover.dayLabel} — Cupos por prioridad
              </span>
              <button
                type="button"
                onClick={() => setActivePopover(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-1.5">
              {currentItems.map((item, qIdx) => (
                <div key={`${item.priority}-${qIdx}`} className="flex items-center gap-1.5">
                  <select
                    value={item.priority}
                    onChange={(e) => {
                      const nextPrio = normalizePriority(e.target.value);
                      const updated = currentItems.map((it, idx) =>
                        idx === qIdx ? { ...it, priority: nextPrio } : it
                      );
                      handleSetDayPriorityQuotas(
                        activePopover.rowId,
                        activePopover.isNewRow,
                        activePopover.dbDay,
                        activePopover.dayIdx,
                        activePopover.generalPriority,
                        updated
                      );
                    }}
                    className="flex-1 h-7 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 text-xs"
                  >
                    {PRIORITY_OPTIONS.map((opt) => (
                      <option
                        key={opt.value}
                        value={opt.value}
                        disabled={opt.value !== item.priority && usedPrios.has(opt.value)}
                      >
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={item.required_count}
                    onChange={(e) => {
                      const val = Math.max(1, parseInt(e.target.value || '1', 10) || 1);
                      const updated = currentItems.map((it, idx) =>
                        idx === qIdx ? { ...it, required_count: val } : it
                      );
                      handleSetDayPriorityQuotas(
                        activePopover.rowId,
                        activePopover.isNewRow,
                        activePopover.dbDay,
                        activePopover.dayIdx,
                        activePopover.generalPriority,
                        updated
                      );
                    }}
                    className="w-14 h-7 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-center text-xs font-bold tabular-nums"
                  />
                  <button
                    type="button"
                    title="Eliminar grupo"
                    onClick={() => {
                      const updated = currentItems.filter((_, idx) => idx !== qIdx);
                      handleSetDayPriorityQuotas(
                        activePopover.rowId,
                        activePopover.isNewRow,
                        activePopover.dbDay,
                        activePopover.dayIdx,
                        activePopover.generalPriority,
                        updated
                      );
                      if (updated.length === 0) setActivePopover(null);
                    }}
                    className="p-1 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {nextUnusedPrio && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const updated = [...currentItems, { priority: nextUnusedPrio, required_count: 1 }];
                  handleSetDayPriorityQuotas(
                    activePopover.rowId,
                    activePopover.isNewRow,
                    activePopover.dbDay,
                    activePopover.dayIdx,
                    activePopover.generalPriority,
                    updated
                  );
                }}
                className="w-full h-7 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Agregar prioridad
              </Button>
            )}

            <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
              <span>Total del día: <strong className="text-slate-800 dark:text-slate-200">{currentDayTotal}</strong></span>
              <button
                type="button"
                onClick={() => setActivePopover(null)}
                className="text-blue-600 hover:underline font-medium"
              >
                Listo
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
