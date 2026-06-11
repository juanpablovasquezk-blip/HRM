import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarOff } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';

const LEAVE_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  sick:      { label: 'Licencia Médica',   color: 'text-red-700 dark:text-red-400',    bg: 'bg-red-50 dark:bg-red-900/10',      border: 'border-red-100 dark:border-red-900/20'      },
  vacation:  { label: 'Vacaciones',        color: 'text-blue-700 dark:text-blue-400',  bg: 'bg-blue-50 dark:bg-blue-900/10',    border: 'border-blue-100 dark:border-blue-900/20'    },
  maternity: { label: 'Pre/Post Natal',    color: 'text-pink-700 dark:text-pink-400',  bg: 'bg-pink-50 dark:bg-pink-900/10',    border: 'border-pink-100 dark:border-pink-900/20'    },
  other:     { label: 'Otro',             color: 'text-slate-700 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800/40',  border: 'border-slate-100 dark:border-slate-700'     },
};

interface ActiveLeavesPerson {
  name: string;
  startDate: string;
  endDate: string;
  type: string;
}

interface ActiveLeavesCardProps {
  people: ActiveLeavesPerson[];
}

export function ActiveLeavesCard({ people }: ActiveLeavesCardProps) {
  const today = new Date();

  return (
    <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
            <CalendarOff className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">Ausencias Activas Hoy</CardTitle>
            <p className="text-xs text-muted-foreground">
              {people.length === 0
                ? 'Sin ausencias activas'
                : `${people.length} persona${people.length > 1 ? 's' : ''} fuera hoy`}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {people.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <span className="text-2xl mb-1">✅</span>
            <p className="text-sm text-muted-foreground">Todo el equipo presente hoy</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {people.map((person, i) => {
              const style = LEAVE_LABELS[person.type] ?? LEAVE_LABELS.other;
              const end = parseISO(person.endDate);
              const daysLeft = differenceInDays(end, today) + 1;
              const endFormatted = format(end, "d 'de' MMM", { locale: es });

              return (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 border ${style.bg} ${style.border}`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${style.bg} ${style.color} border ${style.border}`}>
                      {person.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-tight">{person.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-xs font-semibold ${style.color}`}>{style.label}</span>
                        <span className="text-xs text-muted-foreground">· hasta {endFormatted}</span>
                      </div>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${style.bg} ${style.color} border ${style.border}`}>
                    {daysLeft}d
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
