import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Stethoscope } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';

interface OnSickLeaveProps {
  people: Array<{
    name: string;
    startDate: string;
    endDate: string;
  }>;
}

export function OnSickLeaveCard({ people }: OnSickLeaveProps) {
  const today = new Date();

  return (
    <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
            <Stethoscope className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">Con Licencia Médica</CardTitle>
            <p className="text-xs text-muted-foreground">
              {people.length === 0 ? 'Nadie con licencia hoy' : `${people.length} persona${people.length > 1 ? 's' : ''} hoy`}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {people.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <span className="text-2xl mb-1">✅</span>
            <p className="text-sm text-muted-foreground">Sin licencias médicas activas</p>
          </div>
        ) : (
          <div className="space-y-2">
            {people.map((person, i) => {
              const end = parseISO(person.endDate);
              const daysLeft = differenceInDays(end, today) + 1;
              const endFormatted = format(end, "d 'de' MMM", { locale: es });
              return (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-red-200 dark:bg-red-800 flex items-center justify-center text-xs font-bold text-red-700 dark:text-red-300 shrink-0">
                      {person.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-tight">{person.name}</p>
                      <p className="text-xs text-muted-foreground">Hasta {endFormatted}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    daysLeft <= 3
                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
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
