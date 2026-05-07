'use client';

import React, { useState } from 'react';
import { format, addMonths, startOfMonth, endOfMonth, isAfter, setDate, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, Clock, Send, AlertCircle, CheckCircle2, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { requestFreeDays, deleteWorkerLeave } from '../actions';
import { useTransition } from 'react';
import { Badge } from '@/components/ui/badge';

export default function FreeRequestClient({ personnelId, initialRequests = [] }: { personnelId: string, initialRequests?: any[] }) {
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPendingDelete, startDeleteTransition] = useTransition();

  const today = new Date();
  const nextMonth = addMonths(today, 1);
  const nextMonthName = format(nextMonth, 'MMMM', { locale: es });
  
  // Deadline logic: Requests for next month close on the 20th of the current month
  const deadlineDate = setDate(startOfMonth(today), 20);
  const isDeadlinePassed = isAfter(today, deadlineDate);

  // Total requests for next month
  const totalRequestsCount = initialRequests.length;
  const isLimitReached = totalRequestsCount >= 2;

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = e.target.value;
    if (!date) return;
    
    if (selectedDates.includes(date)) {
      setSelectedDates(prev => prev.filter(d => d !== date));
    } else {
      if (selectedDates.length >= 2) {
        toast.error("Máximo 2 días libres por solicitud");
        return;
      }
      setSelectedDates(prev => [...prev, date].sort());
    }
  };

  const handleSubmit = async () => {
    if (selectedDates.length === 0) return;
    
    setIsSubmitting(true);
    const res = await requestFreeDays(personnelId, selectedDates);
    if (res.success) {
      toast.success("Solicitud enviada correctamente");
      setSelectedDates([]);
    } else {
      toast.error("Error: " + res.error);
    }
    setIsSubmitting(false);
  };

  const handleDelete = (id: string) => {
    startDeleteTransition(async () => {
      const res = await deleteWorkerLeave(id);
      if (res.success) toast.success("Solicitud eliminada");
      else toast.error("Error: " + res.error);
    });
  };

  if (isDeadlinePassed) {
    return (
      <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-6 text-center space-y-3">
        <div className="h-12 w-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
          <Clock className="h-6 w-6 text-slate-400" />
        </div>
        <div className="space-y-1">
          <h3 className="font-bold text-slate-900 uppercase text-sm">Periodo Cerrado</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Las solicitudes para <strong>{nextMonthName}</strong> cerraron el día 20.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-6 space-y-6">
      <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
        <div className="h-10 w-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
          <Calendar className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-black text-slate-900 uppercase text-sm leading-none">Solicitar Libres</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Para {nextMonthName}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Seleccionar Días (Máx 2)</label>
          <input 
            type="date" 
            min={format(startOfMonth(nextMonth), 'yyyy-MM-dd')}
            max={format(endOfMonth(nextMonth), 'yyyy-MM-dd')}
            onChange={handleDateChange}
            disabled={isLimitReached}
            className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          />
        </div>

        {isLimitReached && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-tight">Ya has completado tus 2 solicitudes para este mes</p>
          </div>
        )}

        {selectedDates.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedDates.map(date => (
              <div key={date} className="bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-full text-[10px] font-black flex items-center gap-2 border border-indigo-100">
                {format(parseISO(date), 'dd/MM')}
                <button onClick={() => setSelectedDates(prev => prev.filter(d => d !== date))} className="hover:text-red-500">×</button>
              </div>
            ))}
          </div>
        )}

        <div className="bg-amber-50 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[10px] text-amber-800 leading-normal font-medium">
            Tienes hasta el <strong>día 20 de este mes</strong> para modificar o enviar tus solicitudes para {nextMonthName}.
          </p>
        </div>

        <Button 
          onClick={handleSubmit} 
          disabled={selectedDates.length === 0 || isSubmitting || isLimitReached}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-2xl py-6 font-black uppercase tracking-widest text-xs shadow-lg shadow-slate-200"
        >
          {isSubmitting ? "Enviando..." : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Enviar Solicitud
            </>
          )}
        </Button>

        {/* List of existing requests */}
        {initialRequests.length > 0 && (
          <div className="pt-6 border-t border-slate-50 space-y-4">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tus Solicitudes Actuales</h4>
            <div className="space-y-3">
              {initialRequests.map((req) => (
                <div key={req.id} className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-bold
                      ${req.status === 'approved' ? 'bg-emerald-100 text-emerald-600' : 
                        req.status === 'rejected' ? 'bg-red-100 text-red-600' : 
                        'bg-amber-100 text-amber-600'}
                    `}>
                      {format(parseISO(req.start_date), 'dd')}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-700">{format(parseISO(req.start_date), 'MMMM yyyy', { locale: es })}</p>
                      <Badge className={`
                        text-[8px] uppercase font-black px-1.5 py-0.5 border-none mt-0.5
                        ${req.status === 'approved' ? 'bg-emerald-500' : 
                          req.status === 'rejected' ? 'bg-red-500' : 
                          'bg-amber-500'}
                      `}>
                        {req.status === 'approved' ? 'Aprobado' : req.status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                      </Badge>
                    </div>
                  </div>
                  
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => handleDelete(req.id)}
                    disabled={isPendingDelete}
                    className="h-8 w-8 text-slate-300 hover:text-red-500"
                  >
                    {isPendingDelete ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
