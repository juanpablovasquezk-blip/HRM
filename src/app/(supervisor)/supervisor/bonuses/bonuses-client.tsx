'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Coins, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  ArrowLeft,
  Users
} from 'lucide-react';
import { format, parseISO, addMonths, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { getSupervisorBonuses } from './actions';
import { toast } from 'sonner';
import Link from 'next/link';

interface SupervisorBonusItem {
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
  personnel?: {
    id: string;
    first_name: string;
    last_name_father: string;
    last_name_mother?: string;
    rut: string;
  };
}

interface SupervisorBonusesClientProps {
  initialBonuses: SupervisorBonusItem[];
  personnelList: Array<{ id: string; first_name: string; last_name_father: string; rut: string }>;
}

export function SupervisorBonusesClient({
  initialBonuses,
  personnelList,
}: SupervisorBonusesClientProps) {
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const [selectedPersonnel, setSelectedPersonnel] = useState('ALL');
  const [searchOt, setSearchOt] = useState('');
  const [bonuses, setBonuses] = useState<SupervisorBonusItem[]>(initialBonuses);
  const [loading, setLoading] = useState(false);

  const fetchBonuses = async (monthDate: Date, pId?: string, ot?: string) => {
    const fromStr = format(startOfMonth(monthDate), 'yyyy-MM-dd');
    const toStr = format(endOfMonth(monthDate), 'yyyy-MM-dd');
    setLoading(true);
    try {
      const res = await getSupervisorBonuses({
        startDate: fromStr,
        endDate: toStr,
        personnelId: (pId !== undefined ? pId : selectedPersonnel) !== 'ALL' ? (pId || selectedPersonnel) : undefined,
        otNumber: (ot !== undefined ? ot : searchOt).trim() || undefined,
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

  const handlePrevMonth = () => {
    const nextDate = subMonths(currentMonthDate, 1);
    setCurrentMonthDate(nextDate);
    fetchBonuses(nextDate);
  };

  const handleNextMonth = () => {
    const nextDate = addMonths(currentMonthDate, 1);
    setCurrentMonthDate(nextDate);
    fetchBonuses(nextDate);
  };

  return (
    <div className="space-y-5 pb-8 max-w-lg mx-auto px-4 sm:px-0">
      <div className="flex items-center gap-3">
        <Link href="/supervisor">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-full">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Coins className="h-5 w-5 text-emerald-600" />
            Bonos del Equipo
          </h1>
          <p className="text-xs text-slate-500">
            Seguimiento de bonos por OT y actividades del equipo supervisado.
          </p>
        </div>
      </div>

      {/* Navegación y Filtros */}
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
                {format(currentMonthDate, 'MMMM yyyy', { locale: es })}
              </span>
              <p className="text-[11px] text-slate-500">
                {bonuses.length} bonos registrados
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

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-600">Filtrar por Colaborador</label>
              <Select
                value={selectedPersonnel}
                onValueChange={(val) => {
                  const safeVal = val || 'ALL';
                  setSelectedPersonnel(safeVal);
                  fetchBonuses(currentMonthDate, safeVal, searchOt);
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Todos los colaboradores" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  <SelectItem value="ALL">Todo el equipo</SelectItem>
                  {personnelList.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.first_name} {p.last_name_father} ({p.rut})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Buscar N° OT..."
                  value={searchOt}
                  onChange={(e) => setSearchOt(e.target.value)}
                  className="h-8 pl-8 text-xs font-mono"
                />
              </div>
              <Button
                size="sm"
                onClick={() => fetchBonuses(currentMonthDate, selectedPersonnel, searchOt)}
                className="h-8 text-xs bg-slate-900 text-white"
              >
                Filtrar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Registros */}
      <div className="space-y-2.5">
        {loading ? (
          <div className="py-8 text-center text-xs text-slate-400">Cargando bonos...</div>
        ) : bonuses.length === 0 ? (
          <Card className="border-dashed border-slate-200 p-8 text-center bg-white/50">
            <p className="text-xs text-slate-500">
              No hay bonos registrados para este mes con los filtros seleccionados.
            </p>
          </Card>
        ) : (
          bonuses.map((item) => {
            const p = item.personnel;
            const isPaid = Boolean(item.paid_month);

            return (
              <Card 
                key={item.id} 
                className="border-slate-200 shadow-xs hover:border-emerald-300 transition-colors bg-white overflow-hidden"
              >
                <CardContent className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-sm text-slate-900">
                        {p ? `${p.first_name} ${p.last_name_father}` : 'Colaborador'}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        {p?.rut || ''}
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
                          Pendiente
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 pt-1 border-t border-slate-100">
                    <span className="font-medium text-emerald-700">
                      {item.bonus_type?.name || 'Bono'}
                    </span>
                    {item.ot_number && (
                      <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                        OT: {item.ot_number}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400">
                      {item.date ? format(parseISO(item.date), 'dd/MM/yyyy') : '-'}
                    </span>
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
