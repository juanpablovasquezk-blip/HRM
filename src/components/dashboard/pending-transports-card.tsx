'use client';

import { useState } from 'react';
import { StatCard } from './stat-card';
import { AlertCircle, ArrowRight, Calendar } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import Link from 'next/link';

interface PendingTransportsCardProps {
  count: number;
  dates: string[];
}

export function PendingTransportsCard({ count, dates }: PendingTransportsCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div 
        onClick={() => {
          if (count > 0) {
            setOpen(true);
          }
        }}
        className={count > 0 ? "cursor-pointer" : ""}
      >
        <StatCard
          title="Transp. Pendientes"
          value={count}
          subtitle="Por asignar / confirmar"
          icon={AlertCircle}
          iconClassName={
            count > 0 
              ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 animate-pulse' 
              : 'bg-slate-100 text-slate-500'
          }
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 border dark:border-slate-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold uppercase tracking-tight">
              <AlertCircle className="h-5 w-5 animate-bounce" />
              Fechas con Transporte Pendiente
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400">
              Hay {count} transportes pendientes de asignar o confirmar. Selecciona una fecha para gestionarla.
            </DialogDescription>
          </DialogHeader>
          
          <div className="max-h-60 overflow-y-auto pr-1 mt-4 space-y-2">
            {dates.length === 0 ? (
              <p className="text-sm text-center text-slate-400 py-4">No hay fechas pendientes.</p>
            ) : (
              dates.map((date) => (
                <Link
                  key={date}
                  href={`/transport?date=${date}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-350">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    {date}
                  </div>
                  <div className="flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    Gestionar
                    <ArrowRight className="h-3 w-3" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
