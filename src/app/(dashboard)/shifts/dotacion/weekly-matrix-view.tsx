'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Briefcase, TableProperties } from 'lucide-react';
import { buildWeeklyMatrix, MATRIX_DAYS_ORDER, type TemplateLike } from './matrix-utils';

interface WeeklyMatrixViewProps {
  templates: TemplateLike[];
}

export function WeeklyMatrixView({ templates }: WeeklyMatrixViewProps) {
  const groups = useMemo(() => buildWeeklyMatrix(templates), [templates]);

  if (groups.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          <TableProperties className="h-8 w-8 mx-auto mb-3 opacity-40" />
          No se encontraron reglas con los filtros aplicados.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
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
                {group.weeklyTotal} turnos/sem
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] uppercase tracking-wider text-muted-foreground bg-white dark:bg-slate-950">
                  <th className="py-2.5 px-4 text-left font-semibold min-w-[160px]">Turno</th>
                  {MATRIX_DAYS_ORDER.map((d) => (
                    <th key={d.dbDay} title={d.fullName} className="py-2.5 px-2 text-center font-semibold w-12">
                      {d.label}
                    </th>
                  ))}
                  <th className="py-2.5 px-4 text-right font-semibold w-20">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {group.shifts.map((shift) => (
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
                    {shift.counts.map((val, idx) => (
                      <td key={idx} className="py-2.5 px-2 text-center tabular-nums">
                        {val > 0 ? (
                          <span className="inline-flex items-center justify-center min-w-[26px] h-6 px-1.5 rounded-md bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 font-bold text-xs">
                            {val}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700 text-xs">0</span>
                        )}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 text-right font-bold tabular-nums text-slate-700 dark:text-slate-200">
                      {shift.weeklyTotal}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 font-bold text-xs">
                  <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                    Total Diario
                  </td>
                  {group.dailyTotals.map((tot, idx) => (
                    <td key={idx} className="py-2.5 px-2 text-center tabular-nums text-slate-800 dark:text-slate-100">
                      {tot}
                    </td>
                  ))}
                  <td className="py-2.5 px-4 text-right tabular-nums text-orange-600 dark:text-orange-400 text-sm">
                    {group.weeklyTotal}
                  </td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
