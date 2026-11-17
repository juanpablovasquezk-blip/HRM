'use client';

import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Briefcase, TableProperties, Save, X, Loader2, AlertCircle } from 'lucide-react';
import { buildWeeklyMatrix, MATRIX_DAYS_ORDER, isValidQuantity, type TemplateLike } from './matrix-utils';
import type { WeeklyMatrixRowChange } from '@/app/(dashboard)/shifts/actions';

interface WeeklyMatrixViewProps {
  templates: TemplateLike[];
  onSaveChanges?: (changes: WeeklyMatrixRowChange[]) => Promise<{ success: boolean; error?: string | null }>;
}

function rowKey(areaId: string, positionId: string, shiftId: string): string {
  return `${areaId}||${positionId}||${shiftId}`;
}

export function WeeklyMatrixView({ templates, onSaveChanges }: WeeklyMatrixViewProps) {
  const baseGroups = useMemo(() => buildWeeklyMatrix(templates), [templates]);

  // Map of rowKey -> 7 string values (for controlled inputs)
  const [draftValues, setDraftValues] = useState<Record<string, string[]>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Reset draft whenever server templates update
  useEffect(() => {
    setDraftValues({});
  }, [templates]);

  const baseCountsMap = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const g of baseGroups) {
      for (const s of g.shifts) {
        map.set(rowKey(g.areaId, g.positionId, s.shiftId), [...s.counts]);
      }
    }
    return map;
  }, [baseGroups]);

  const parseCell = (raw: string): { valid: boolean; num: number } => {
    if (raw.trim() === '' || !/^\d+$/.test(raw.trim())) {
      return { valid: false, num: 0 };
    }
    const n = Number(raw.trim());
    return { valid: isValidQuantity(n), num: n };
  };

  // Compute dirty rows & validation errors
  const { dirtyChanges, invalidCellCount, dirtyCellCount } = useMemo(() => {
    const changes: WeeklyMatrixRowChange[] = [];
    let invalidCount = 0;
    let dirtyCells = 0;

    for (const g of baseGroups) {
      for (const s of g.shifts) {
        const key = rowKey(g.areaId, g.positionId, s.shiftId);
        const draft = draftValues[key];
        if (!draft) continue;

        const parsedNums: number[] = [];
        let rowHasDiff = false;
        let rowValid = true;

        for (let i = 0; i < 7; i++) {
          const { valid, num } = parseCell(draft[i]);
          if (!valid) {
            invalidCount++;
            rowValid = false;
          }
          parsedNums.push(num);
          if (String(s.counts[i]) !== draft[i].trim()) {
            dirtyCells++;
            rowHasDiff = true;
          }
        }

        if (rowHasDiff && rowValid) {
          changes.push({
            area_id: g.areaId,
            position_id: g.positionId,
            shift_id: s.shiftId,
            counts: parsedNums,
          });
        }
      }
    }

    return { dirtyChanges: changes, invalidCellCount: invalidCount, dirtyCellCount: dirtyCells };
  }, [baseGroups, draftValues]);

  const handleCellChange = (key: string, dayIdx: number, value: string) => {
    const base = baseCountsMap.get(key) || [0, 0, 0, 0, 0, 0, 0];
    setDraftValues((prev) => {
      const current = prev[key] ? [...prev[key]] : base.map(String);
      current[dayIdx] = value;
      return { ...prev, [key]: current };
    });
  };

  const handleCancel = () => {
    setDraftValues({});
  };

  const handleSave = async () => {
    if (!onSaveChanges || dirtyChanges.length === 0 || invalidCellCount > 0 || isSaving) return;
    setIsSaving(true);
    try {
      const res = await onSaveChanges(dirtyChanges);
      if (res.success) {
        setDraftValues({});
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (baseGroups.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          <TableProperties className="h-8 w-8 mx-auto mb-3 opacity-40" />
          No se encontraron reglas con los filtros aplicados.
        </CardContent>
      </Card>
    );
  }

  const hasPending = dirtyCellCount > 0;

  return (
    <div className="space-y-4">
      {onSaveChanges && (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-all ${
            hasPending
              ? 'border-blue-300 bg-blue-50/80 dark:border-blue-800 dark:bg-blue-950/30 shadow-sm'
              : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-950/50'
          }`}
        >
          <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
            {invalidCellCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400 font-semibold">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Hay {invalidCellCount} celda(s) con valores inválidos (ingresa enteros ≥ 0).
              </span>
            ) : hasPending ? (
              <span className="font-medium text-blue-800 dark:text-blue-200">
                <strong>{dirtyCellCount}</strong> cambio(s) pendiente(s) en reglas semanales permanentes. No afecta necesidades ya generadas ni roles publicados.
              </span>
            ) : (
              <span>
                Edita cualquier celda para ajustar la regla semanal permanente (lunes a domingo).
              </span>
            )}
          </div>

          {hasPending && (
            <div className="flex items-center gap-2">
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
                disabled={isSaving || invalidCellCount > 0 || dirtyChanges.length === 0}
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
            </div>
          )}
        </div>
      )}

      {baseGroups.map((group) => {
        const liveDailyTotals = [0, 0, 0, 0, 0, 0, 0];
        let liveGroupWeeklyTotal = 0;

        const liveRows = group.shifts.map((shift) => {
          const key = rowKey(group.areaId, group.positionId, shift.shiftId);
          const draft = draftValues[key];
          let rowTotal = 0;

          const cells = MATRIX_DAYS_ORDER.map((_, idx) => {
            const raw = draft ? draft[idx] : String(shift.counts[idx]);
            const { valid, num } = parseCell(raw);
            const isDirty = raw.trim() !== String(shift.counts[idx]);
            const effectiveNum = valid ? num : 0;
            liveDailyTotals[idx] += effectiveNum;
            rowTotal += effectiveNum;
            return { raw, valid, num: effectiveNum, isDirty };
          });

          liveGroupWeeklyTotal += rowTotal;
          return { shift, key, cells, rowTotal };
        });

        return (
          <Card key={group.groupKey} className="border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden">
            <CardHeader className="py-3 px-4 bg-slate-50/70 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 shrink-0">
                    <MapPin className="h-4 w-4" />
                  </span>
                  <span>{group.areaName}</span>
                  <span className="text-slate-400 font-normal">—</span>
                  <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200">
                    <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                    {group.positionName}
                  </span>
                </CardTitle>
                <Badge variant="secondary" className="text-xs font-semibold tabular-nums">
                  {liveGroupWeeklyTotal} turnos/sem
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] uppercase tracking-wider text-muted-foreground bg-white dark:bg-slate-950">
                    <th className="py-2.5 px-4 text-left font-semibold min-w-[160px]">Turno</th>
                    {MATRIX_DAYS_ORDER.map((d) => (
                      <th key={d.dbDay} title={d.fullName} className="py-2.5 px-1.5 text-center font-semibold w-14">
                        {d.label}
                      </th>
                    ))}
                    <th className="py-2.5 px-4 text-right font-semibold w-20">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {liveRows.map(({ shift, key, cells, rowTotal }) => (
                    <tr key={shift.shiftId} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/30 transition-colors">
                      <td className="py-2.5 px-4 font-medium text-slate-800 dark:text-slate-200">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="font-semibold text-xs py-0.5">
                            {shift.shiftName}
                          </Badge>
                          {shift.templateCount > 1 && (
                            <span className="text-[10px] text-muted-foreground" title="Consolidado desde múltiples reglas">
                              ({shift.templateCount} reglas)
                            </span>
                          )}
                        </div>
                      </td>
                      {cells.map((cell, idx) => (
                        <td key={idx} className="py-1.5 px-1 text-center tabular-nums">
                          {onSaveChanges ? (
                            <input
                              type="number"
                              min={0}
                              step={1}
                              aria-label={`${group.areaName} ${group.positionName} ${shift.shiftName} ${MATRIX_DAYS_ORDER[idx].fullName}`}
                              value={cell.raw}
                              disabled={isSaving}
                              onChange={(e) => handleCellChange(key, idx, e.target.value)}
                              className={`w-12 h-7 text-center rounded-md text-xs font-bold tabular-nums border outline-none transition-all ${
                                !cell.valid
                                  ? 'border-red-500 bg-red-50 text-red-700 ring-1 ring-red-400 dark:bg-red-950/40 dark:text-red-300'
                                  : cell.isDirty
                                  ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-400 dark:bg-blue-950/40 dark:text-blue-200'
                                  : cell.num > 0
                                  ? 'border-orange-200 bg-orange-50/80 text-orange-700 focus:border-orange-500 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300'
                                  : 'border-slate-200 bg-white text-slate-400 focus:border-orange-400 focus:text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-600'
                              }`}
                            />
                          ) : cell.num > 0 ? (
                            <span className="inline-flex items-center justify-center min-w-[26px] h-6 px-1.5 rounded-md bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 font-bold text-xs">
                              {cell.num}
                            </span>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-700 text-xs">0</span>
                          )}
                        </td>
                      ))}
                      <td className="py-2.5 px-4 text-right font-bold tabular-nums text-slate-700 dark:text-slate-200">
                        {rowTotal}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 font-bold text-xs">
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      Total Diario
                    </td>
                    {liveDailyTotals.map((tot, idx) => (
                      <td key={idx} className="py-2.5 px-1.5 text-center tabular-nums text-slate-800 dark:text-slate-100">
                        {tot}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 text-right tabular-nums text-orange-600 dark:text-orange-400 text-sm">
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
  );
}
