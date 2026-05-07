'use client';

import React, { useState, useEffect } from 'react';
import { getWorkerTransportHistory } from '../../actions';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Bus, 
  Calendar, 
  Search, 
  ChevronRight,
  Car,
  Filter
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function WorkerTransportHistory() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  const fetchHistory = async () => {
    setLoading(true);
    const data = await getWorkerTransportHistory(from, to);
    setHistory(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-lg mx-auto pb-24">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-2xl font-black text-slate-900 leading-tight uppercase tracking-tight">Mi Movilidad</h2>
        <p className="text-slate-500 font-medium">Registro de transporte propio</p>
      </div>

      {/* Filters */}
      <Card className="rounded-3xl border-none shadow-lg shadow-slate-100/50">
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Desde</label>
              <Input 
                type="date" 
                value={from} 
                onChange={(e) => setFrom(e.target.value)}
                className="h-10 rounded-xl bg-slate-50 border-slate-100 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Hasta</label>
              <Input 
                type="date" 
                value={to} 
                onChange={(e) => setTo(e.target.value)}
                className="h-10 rounded-xl bg-slate-50 border-slate-100 text-xs"
              />
            </div>
          </div>
          <Button 
            onClick={fetchHistory}
            className="w-full h-10 rounded-xl bg-slate-900 text-white font-bold uppercase text-xs tracking-widest"
          >
            <Search className="h-4 w-4 mr-2" />
            Consultar Registro
          </Button>
        </CardContent>
      </Card>

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex flex-col items-center py-12 gap-3">
            <div className="h-8 w-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-bold text-slate-400 uppercase">Buscando registros...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-slate-100 flex flex-col items-center gap-4">
            <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center">
              <Filter className="h-8 w-8 text-slate-200" />
            </div>
            <p className="text-slate-400 text-xs font-bold uppercase">No hay registros propios en este rango</p>
          </div>
        ) : (
          history.map((item) => (
            <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between group active:scale-95 transition-transform">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-emerald-50 flex flex-col items-center justify-center shrink-0">
                  <span className="text-[10px] font-black text-emerald-600 leading-none mb-0.5">{format(parseISO(item.date), 'MMM', { locale: es }).toUpperCase()}</span>
                  <span className="text-lg font-black text-emerald-700 leading-none">{format(parseISO(item.date), 'dd')}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none text-[8px] font-black px-1.5 py-0">PROPIO</Badge>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {item.shift_assignment?.shift?.name || 'Turno'}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-slate-700 leading-tight">Transporte por cuenta propia</p>
                  <p className="text-[10px] text-slate-400 font-medium">Asistencia registrada el {format(parseISO(item.date), 'EEEE', { locale: es })}</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-orange-500 transition-colors" />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
