'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Coins, 
  Calendar, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  HelpCircle,
  FileText
} from 'lucide-react';
import { format, parseISO, addMonths, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { getWorkerBonuses } from './actions';
import { toast } from 'sonner';

interface WorkerBonusItem {
  id: string;
  date: string;
  amount: number;
  ot_number: string | null;
  observations: string | null;
  paid_month: string | null;
  bonus_type?: {
    id: string;
    code: string;
    name: string;
  };
}

interface WorkerBonusesClientProps {
  initialBonuses: WorkerBonusItem[];
}

export function WorkerBonusesClient({ initialBonuses }: WorkerBonusesClientProps) {
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const [customRangeActive, setCustomRangeActive] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchOt, setSearchOt] = useState('');
  const [bonuses, setBonuses] = useState<WorkerBonusItem[]>(initialBonuses);
  const [loading, setLoading] = useState(false);

  // Navegación rápida por mes
  const handlePrevMonth = async () => {
    const nextDate = subMonths(currentMonthDate, 1);
    setCurrentMonthDate(nextDate);
    setCustomRangeActive(false);
    await fetchMonthBonuses(nextDate);
  };

  const handleNextMonth = async () => {
    const nextDate = addMonths(currentMonthDate, 1);
    setCurrentMonthDate(nextDate);
    setCustomRangeActive(false);
    await fetchMonthBonuses(nextDate);
  };

  const fetchMonthBonuses = async (monthDate: Date) => {
    const fromStr = format(startOfMonth(monthDate), 'yyyy-MM-dd');
    const toStr = format(endOfMonth(monthDate), 'yyyy-MM-dd');
    setLoading(true);
    try {
      const res = await getWorkerBonuses({
        startDate: fromStr,
        endDate: toStr,
        otNumber: searchOt.trim() || undefined,
      });
      if (res.success && res.data) {
        setBonuses(res.data);
      }
    } catch {
      toast.error('Error al actualizar bonos');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyCustomFilter = async () => {
    if (!startDate || !endDate) {
      toast.error('Ingresa fecha inicial y final');
      return;
    }
    setCustomRangeActive(true);
    setLoading(true);
    try {
      const res = await getWorkerBonuses({
        startDate,
        endDate,
        otNumber: searchOt.trim() || undefined,
      });
      if (res.success && res.data) {
        setBonuses(res.data);
      }
    } catch {
      toast.error('Error al consultar rango');
    } finally {
      setLoading(false);
    }
  };

  const handleResetToCurrentMonth = async () => {
    const now = new Date();
    setCurrentMonthDate(now);
    setCustomRangeActive(false);
    setStartDate('');
    setEndDate('');
    setSearchOt('');
    await fetchMonthBonuses(now);
  };

  // Métricas calculadas para la vista
  const metrics = useMemo(() => {
    let total = 0;
    let pending = 0;
    let paid = 0;

    for (const b of bonuses) {
      total += b.amount;
      if (b.paid_month) {
        paid += b.amount;
      } else {
        pending += b.amount;
      }
    }

    return { total, pending, paid, count: bonuses.length };
  }, [bonuses]);

  return (
    <div className="space-y-5 pb-8 max-w-lg mx-auto px-4 sm:px-0">
      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
          <Coins className="h-6 w-6 text-emerald-600" />
          Mis Bonos
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Consulta el detalle de tus bonos por faena, stall, derrames y especiales.
        </p>
      </div>

      {/* Navegación por Mes / Rango */}
      <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
        <CardContent className="p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={handlePrevMonth}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="text-center">
              <span className="text-sm font-bold capitalize text-slate-900">
                {customRangeActive
                  ? 'Rango Personalizado'
                  : format(currentMonthDate, 'MMMM yyyy', { locale: es })}
              </span>
              <p className="text-[11px] text-slate-500">
                {customRangeActive ? `${startDate} al ${endDate}` : 'Corte Mensual'}
              </p>
            </div>

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={handleNextMonth}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Buscador por OT y Filtro avanzado */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Buscar por N° OT..."
                value={searchOt}
                onChange={(e) => setSearchOt(e.target.value)}
                className="h-8 pl-8 text-xs font-mono"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchMonthBonuses(currentMonthDate)}
              className="h-8 text-xs"
            >
              Buscar
            </Button>
          </div>

          {/* Opcional: Rango entre fechas para cierres de nómina tipo 28/09 - 01/11 */}
          <details className="text-[11px] text-slate-600">
            <summary className="cursor-pointer font-medium text-emerald-700 hover:underline">
              Filtro por rango de fechas (corte de liquidación)
            </summary>
            <div className="pt-2.5 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-500">Desde</label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500">Hasta</label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleResetToCurrentMonth}
                  className="h-7 text-xs text-slate-500"
                >
                  Volver al mes
                </Button>
                <Button
                  size="sm"
                  onClick={handleApplyCustomFilter}
                  className="h-7 text-xs bg-slate-900 text-white"
                >
                  Filtrar fechas
                </Button>
              </div>
            </div>
          </details>
        </CardContent>
      </Card>

      {/* Tarjetas Resumen */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
          <p className="text-[10px] uppercase font-bold text-slate-400">Total Periodo</p>
          <p className="text-base font-black text-slate-900 mt-0.5">
            ${metrics.total.toLocaleString('es-CL')}
          </p>
          <p className="text-[10px] text-slate-500">{metrics.count} bonos</p>
        </div>

        <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl shadow-xs">
          <p className="text-[10px] uppercase font-bold text-amber-600">Pendiente</p>
          <p className="text-base font-black text-amber-700 mt-0.5">
            ${metrics.pending.toLocaleString('es-CL')}
          </p>
          <p className="text-[10px] text-amber-600">Por liquidar</p>
        </div>

        <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl shadow-xs">
          <p className="text-[10px] uppercase font-bold text-emerald-600">Pagado</p>
          <p className="text-base font-black text-emerald-700 mt-0.5">
            ${metrics.paid.toLocaleString('es-CL')}
          </p>
          <p className="text-[10px] text-emerald-600">En nómina</p>
        </div>
      </div>

      {/* Lista de Bonos */}
      <div className="space-y-2.5">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
          Detalle de Bonos ({bonuses.length})
        </h2>

        {loading ? (
          <div className="py-8 text-center text-xs text-slate-400">Cargando bonos...</div>
        ) : bonuses.length === 0 ? (
          <Card className="border-dashed border-slate-200 p-8 text-center bg-white/50">
            <p className="text-xs text-slate-500">
              No tienes bonos registrados en este periodo o para el filtro seleccionado.
            </p>
          </Card>
        ) : (
          bonuses.map((item) => {
            const isPaid = Boolean(item.paid_month);

            return (
              <Card 
                key={item.id} 
                className="border-slate-200 shadow-xs hover:border-emerald-300 transition-colors bg-white overflow-hidden"
              >
                <CardContent className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-slate-900">
                          {item.bonus_type?.name || 'Bono'}
                        </span>
                        {item.ot_number && (
                          <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 bg-slate-50 text-slate-700">
                            OT: {item.ot_number}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {item.date ? format(parseISO(item.date), "dd 'de' MMMM, yyyy", { locale: es }) : '-'}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-base font-black text-slate-900 block">
                        ${item.amount.toLocaleString('es-CL')}
                      </span>
                      {isPaid ? (
                        <Badge className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0">
                          Liquidado {item.paid_month}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] px-1.5 py-0">
                          Pendiente de pago
                        </Badge>
                      )}
                    </div>
                  </div>

                  {item.observations && (
                    <div className="p-2 bg-slate-50 rounded-lg text-xs text-slate-600 border border-slate-100">
                      <span className="font-medium text-slate-700">Detalle:</span> {item.observations}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
