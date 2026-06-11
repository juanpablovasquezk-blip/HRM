import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserX } from 'lucide-react';

interface FinalAbsenceRecord {
  name: string;
  count: number;
}

interface MonthlyFinalAbsencesCardProps {
  people: FinalAbsenceRecord[];
  monthLabel: string;
}

export function MonthlyFinalAbsencesCard({ people, monthLabel }: MonthlyFinalAbsencesCardProps) {
  const totalAbsences = people.reduce((sum, p) => sum + p.count, 0);

  return (
    <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
            <UserX className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">Ausentismo Final del Mes</CardTitle>
            <p className="text-xs text-muted-foreground">
              {totalAbsences === 0
                ? `Sin ausencias finales en ${monthLabel}`
                : `${totalAbsences} ausencia${totalAbsences !== 1 ? 's' : ''} · ${people.length} persona${people.length !== 1 ? 's' : ''} en ${monthLabel}`}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {people.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <span className="text-2xl mb-1">✅</span>
            <p className="text-sm text-muted-foreground">Sin ausencias finales este mes</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {people.map((person, i) => {
              const isHighRisk = person.count >= 3;
              const isMedium = person.count === 2;
              return (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 border ${
                    isHighRisk
                      ? 'bg-rose-50 border-rose-100 dark:bg-rose-900/10 dark:border-rose-900/20'
                      : isMedium
                      ? 'bg-orange-50 border-orange-100 dark:bg-orange-900/10 dark:border-orange-900/20'
                      : 'bg-slate-50 border-slate-100 dark:bg-slate-800/40 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isHighRisk
                        ? 'bg-rose-100 text-rose-700 border border-rose-200'
                        : isMedium
                        ? 'bg-orange-100 text-orange-700 border border-orange-200'
                        : 'bg-slate-200 text-slate-600 border border-slate-300'
                    }`}>
                      {person.name.charAt(0)}
                    </div>
                    <p className="text-sm font-medium leading-tight">{person.name}</p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${
                    isHighRisk
                      ? 'bg-rose-100 text-rose-700 border border-rose-200'
                      : isMedium
                      ? 'bg-orange-100 text-orange-700 border border-orange-200'
                      : 'bg-slate-200 text-slate-600'
                  }`}>
                    {person.count}×
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
