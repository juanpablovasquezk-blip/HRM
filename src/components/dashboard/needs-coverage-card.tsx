import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck, Layers } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface NeedsCoverageCardProps {
  totalRequired: number;
  totalAssigned: number;
  coveragePercent: number;
  missingSlots: number;
  monthLabel: string;
  monthStr: string;
}

export function NeedsCoverageCard({
  totalRequired,
  totalAssigned,
  coveragePercent,
  missingSlots,
  monthLabel,
  monthStr,
}: NeedsCoverageCardProps) {
  const isFullyCovered = totalRequired > 0 && missingSlots === 0;
  const isUnderCovered = missingSlots > 0;
  const hasNoRequirements = totalRequired === 0;

  return (
    <Card className="relative overflow-hidden border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-orange-500" />
                Cobertura de Necesidades Operacionales
              </span>
              <Badge variant="outline" className="text-[10px] font-bold capitalize">
                {monthLabel}
              </Badge>
            </div>

            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                {hasNoRequirements ? (
                  totalAssigned > 0 ? `${totalAssigned} turnos asignados` : 'Sin requerimientos'
                ) : (
                  `${coveragePercent}%`
                )}
              </span>

              {!hasNoRequirements && (
                <span className="text-sm font-semibold text-muted-foreground">
                  ({totalAssigned} de {totalRequired} turnos cubiertos)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              {hasNoRequirements ? (
                <p className="text-xs text-muted-foreground">
                  Aún no se han generado requerimientos/plantillas para este mes.
                </p>
              ) : isFullyCovered ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="h-4 w-4" />
                  Dotación 100% cubierta para todo el mes
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    Faltan <strong>{missingSlots}</strong> cupo{missingSlots !== 1 ? 's' : ''} por asignar en la malla
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:items-end gap-3 shrink-0">
            {!hasNoRequirements && (
              <div className="w-full sm:w-48 space-y-1">
                <div className="flex justify-between text-[11px] font-bold text-muted-foreground">
                  <span>Progreso</span>
                  <span>{coveragePercent}%</span>
                </div>
                <Progress 
                  value={Math.min(100, coveragePercent)} 
                  className={cn(
                    "h-2 rounded-full",
                    coveragePercent >= 95 ? "[&>div]:bg-emerald-500" : coveragePercent >= 80 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500"
                  )}
                />
              </div>
            )}

            <Link href={`/shifts/roster?month=${monthStr}`}>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-orange-600 border-slate-300 dark:border-slate-700 gap-1.5 group"
              >
                Ver en Maestro de Roster
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
