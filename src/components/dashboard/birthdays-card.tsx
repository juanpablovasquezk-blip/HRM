import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Cake } from 'lucide-react';
import { format, parseISO, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';

interface BirthdaysCardProps {
  people: Array<{
    name: string;
    birthDate: string; // full date e.g. "1990-06-15"
  }>;
}

export function BirthdaysCard({ people }: BirthdaysCardProps) {
  const today = new Date();
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();

  // Sort by day-of-month so upcoming ones come first
  const sorted = [...people].sort((a, b) => {
    const dayA = parseISO(a.birthDate).getDate();
    const dayB = parseISO(b.birthDate).getDate();
    // put past days (in the month) after upcoming
    const dA = dayA >= todayDay ? dayA : dayA + 31;
    const dB = dayB >= todayDay ? dayB : dayB + 31;
    return dA - dB;
  });

  return (
    <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
            <Cake className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">Cumpleaños del Mes</CardTitle>
            <p className="text-xs text-muted-foreground">
              {people.length === 0
                ? 'Sin cumpleaños este mes'
                : `${people.length} cumpleaño${people.length > 1 ? 's' : ''} en ${format(today, 'MMMM', { locale: es })}`}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {people.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <span className="text-2xl mb-1">🎂</span>
            <p className="text-sm text-muted-foreground">Sin cumpleaños este mes</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
            {sorted.map((person, i) => {
              const birth = parseISO(person.birthDate);
              const thisYearBirthday = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
              const isToday = isSameDay(thisYearBirthday, today);
              const dayLabel = format(birth, "d 'de' MMMM", { locale: es });
              const age = today.getFullYear() - birth.getFullYear();

              return (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 border ${
                    isToday
                      ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700'
                      : 'bg-slate-50 border-slate-100 dark:bg-slate-800/40 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isToday
                        ? 'bg-amber-200 text-amber-800 dark:bg-amber-700 dark:text-amber-200'
                        : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                    }`}>
                      {person.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-tight flex items-center gap-1">
                        {person.name}
                        {isToday && <span className="text-base">🎂</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{dayLabel}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    isToday
                      ? 'bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-300'
                      : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  }`}>
                    {age} años
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
