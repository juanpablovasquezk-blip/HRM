'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { 
  format, 
  addMonths, 
  subMonths, 
  parseISO, 
  isSameMonth, 
  startOfMonth 
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface DashboardMonthSelectorProps {
  currentMonthStr: string; // "YYYY-MM"
}

export function DashboardMonthSelector({ currentMonthStr }: DashboardMonthSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedDate = parseISO(`${currentMonthStr}-01`);
  const actualCurrentMonthDate = startOfMonth(new Date());
  const isCurrentMonth = isSameMonth(selectedDate, actualCurrentMonthDate);
  const isFutureMonth = selectedDate > actualCurrentMonthDate;

  const navigateToMonth = (date: Date) => {
    const formatted = format(date, 'yyyy-MM');
    const params = new URLSearchParams(searchParams.toString());
    if (format(date, 'yyyy-MM') === format(actualCurrentMonthDate, 'yyyy-MM')) {
      params.delete('month');
    } else {
      params.set('month', formatted);
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    router.push(`/dashboard${query}`);
  };

  const handlePrev = () => {
    navigateToMonth(subMonths(selectedDate, 1));
  };

  const handleNext = () => {
    navigateToMonth(addMonths(selectedDate, 1));
  };

  const handleReset = () => {
    navigateToMonth(actualCurrentMonthDate);
  };

  const formattedLabel = format(selectedDate, "MMMM 'de' yyyy", { locale: es });
  const capitalizedLabel = formattedLabel.charAt(0).toUpperCase() + formattedLabel.slice(1);

  return (
    <div className="flex items-center gap-2 flex-wrap bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          onClick={handlePrev}
          title="Mes anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-2 px-2.5 py-1">
          <Calendar className="h-4 w-4 text-orange-600 shrink-0" />
          <span className="text-sm font-bold text-slate-900 dark:text-slate-100 capitalize min-w-[130px] text-center">
            {capitalizedLabel}
          </span>
          {isCurrentMonth ? (
            <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 text-[10px] font-bold px-1.5 py-0.5">
              Mes actual
            </Badge>
          ) : isFutureMonth ? (
            <Badge variant="secondary" className="bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200 text-[10px] font-bold px-1.5 py-0.5">
              Proyección
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 text-[10px] font-bold px-1.5 py-0.5">
              Histórico
            </Badge>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          onClick={handleNext}
          title="Mes siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {!isCurrentMonth && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          className="h-8 text-xs font-semibold text-orange-600 border-orange-200 hover:bg-orange-50 dark:hover:bg-orange-950/30 gap-1.5 px-2.5"
        >
          <RotateCcw className="h-3 w-3" />
          Hoy / Mes Actual
        </Button>
      )}
    </div>
  );
}
