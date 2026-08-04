'use client';

import React, { useState } from 'react';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, 
  DialogDescription, DialogFooter, DialogClose 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { MessageSquareCode, Check, AlertCircle, Send, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { sendIndividualComplianceReminder } from '@/app/(dashboard)/dashboard/actions';

interface PendingWorker {
  id: string;
  first_name: string;
  last_name_father: string;
  email: string;
  rut: string;
  phone: string;
  hasIncompleteProfile: boolean;
  missingDocs: string[];
}

interface BulkReminderButtonProps {
  people: PendingWorker[];
}

const DEFAULT_TEMPLATE = `Hola *{nombre}* 📋

Debido a requerimientos aeronáuticos obligatorios y auditorías de seguridad de la DGAC, debemos mantener actualizados tus datos y documentos en la plataforma de Minerquim.

Actualmente registras la siguiente información pendiente:
{pendientes}

Por favor, ingresa a tu portal personal para completarlos lo antes posible:
🔗 {link}

*Credenciales de acceso:*
• Usuario: {email}
• Contraseña: {rut} (Tu RUT en mayúsculas, sin puntos ni guion)

_(Nota: Estos datos son confidenciales y obligatorios para gestionar tus credenciales de acceso)_

¡Muchas gracias por tu ayuda!`;

export function BulkReminderButton({ people }: BulkReminderButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(people.map(p => p.id)));
  const [customTemplate, setCustomTemplate] = useState(DEFAULT_TEMPLATE);
  
  // Sending states
  const [isSending, setIsSending] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sendResults, setSendResults] = useState<Array<{ name: string; success: boolean; error: string | null }>>([]);
  const [showSummary, setShowSummary] = useState(false);

  const toggleSelectAll = () => {
    if (selectedIds.size === people.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(people.map(p => p.id)));
    }
  };

  const toggleSelectWorker = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleSendReminders = async () => {
    if (selectedIds.size === 0) {
      toast.error('Seleccione al menos un destinatario');
      return;
    }

    setIsSending(true);
    setCurrentIndex(0);
    setSendResults([]);
    setShowSummary(false);

    const idsArray = Array.from(selectedIds);
    const results: typeof sendResults = [];

    for (let i = 0; i < idsArray.length; i++) {
      setCurrentIndex(i + 1);
      const workerId = idsArray[i];
      const worker = people.find(p => p.id === workerId);
      if (!worker) continue;

      const workerFullName = `${worker.first_name} ${worker.last_name_father}`;

      // 1. Format RUT to password (no points, no dash, uppercase)
      const cleanRut = worker.rut.replace(/[.-]/g, '').toUpperCase();
      const loginLink = `${window.location.origin}/login`;

      // 2. Resolve pending items text
      const pendingItems: string[] = [];
      if (worker.hasIncompleteProfile) {
        pendingItems.push('• Datos personales en tu Ficha (previsión, salud, contacto de emergencia, etc.)');
      }
      if (worker.missingDocs && worker.missingDocs.length > 0) {
        pendingItems.push(`• Subir documentos faltantes: *${worker.missingDocs.join(', ')}*`);
      }
      const pendingStr = pendingItems.join('\n');

      // 3. Interpolate custom template
      const personalizedMessage = customTemplate
        .replace(/{nombre}/g, worker.first_name)
        .replace(/{email}/g, worker.email)
        .replace(/{rut}/g, cleanRut)
        .replace(/{link}/g, loginLink)
        .replace(/{pendientes}/g, pendingStr);

      try {
        const res = await sendIndividualComplianceReminder({
          workerId: worker.id,
          phone: worker.phone,
          customMessage: personalizedMessage,
        });

        if (res.success) {
          results.push({ name: workerFullName, success: true, error: null });
        } else {
          results.push({ name: workerFullName, success: false, error: res.error });
        }
      } catch (err: any) {
        results.push({ name: workerFullName, success: false, error: err.message });
      }

      setSendResults([...results]);
      // Small artificial delay to spacing WhatsApp messages
      await new Promise(r => setTimeout(r, 1000));
    }

    setIsSending(false);
    setShowSummary(true);
    toast.success('Envío masivo finalizado');
  };

  const handleClose = () => {
    setIsOpen(false);
    setShowSummary(false);
    setSendResults([]);
    setCurrentIndex(0);
    // Reset selection to all
    setSelectedIds(new Set(people.map(p => p.id)));
  };

  const totalSelected = selectedIds.size;
  const successCount = sendResults.filter(r => r.success).length;
  const failCount = sendResults.filter(r => !r.success).length;
  const progressPercent = totalSelected > 0 ? Math.round((currentIndex / totalSelected) * 100) : 0;

  return (
    <>
      <Button 
        onClick={() => setIsOpen(true)}
        className="bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-md shadow-orange-500/25 flex items-center gap-2 h-10 px-4 active:scale-95 transition-all"
        disabled={people.length === 0}
      >
        <MessageSquareCode className="h-4.5 w-4.5" />
        Notificar Pendientes por WhatsApp ({people.length})
      </Button>

      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent className="max-w-2xl bg-white dark:bg-slate-900 rounded-2xl overflow-hidden p-6 max-h-[90vh] flex flex-col">
          <DialogHeader className="pb-3 flex-none">
            <DialogTitle className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              Enviar Recordatorios de Cumplimiento
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
              Personaliza el mensaje y selecciona quiénes recibirán la notificación de WhatsApp.
            </DialogDescription>
          </DialogHeader>

          {!showSummary && !isSending ? (
            <div className="flex-1 overflow-y-auto space-y-5 py-2 pr-1 min-h-0">
              {/* Message Editor */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Mensaje Base a Enviar
                </label>
                <Textarea
                  value={customTemplate}
                  onChange={(e) => setCustomTemplate(e.target.value)}
                  rows={10}
                  className="font-mono text-xs leading-relaxed bg-slate-50 border-slate-200 dark:bg-slate-950 dark:border-slate-800 focus:ring-orange-500"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                  Puedes utilizar variables dinámicas: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-bold text-slate-600 dark:text-slate-300">{`{nombre}`}</code>, <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-bold text-slate-600 dark:text-slate-300">{`{email}`}</code>, <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-bold text-slate-600 dark:text-slate-300">{`{rut}`}</code>, <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-bold text-slate-600 dark:text-slate-300">{`{link}`}</code>, y <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-bold text-slate-600 dark:text-slate-300">{`{pendientes}`}</code> (que se adaptará automáticamente a cada caso).
                </p>
              </div>

              {/* Workers list */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Destinatarios ({totalSelected} seleccionados)
                  </label>
                  <button 
                    onClick={toggleSelectAll}
                    className="text-xs font-semibold text-orange-600 hover:text-orange-700 hover:underline"
                  >
                    {selectedIds.size === people.length ? 'Desmarcar Todos' : 'Marcar Todos'}
                  </button>
                </div>

                <div className="border border-slate-100 dark:border-slate-800 rounded-xl max-h-[220px] overflow-y-auto bg-slate-50/50 dark:bg-slate-950/20 divide-y divide-slate-100 dark:divide-slate-800/60">
                  {people.map((worker) => {
                    const isSelected = selectedIds.has(worker.id);
                    return (
                      <div 
                        key={worker.id}
                        className="flex items-start gap-3 p-3 hover:bg-slate-100/40 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectWorker(worker.id)}
                          className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 h-4 w-4 mt-0.5 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              {worker.first_name} {worker.last_name_father}
                            </p>
                            <span className="text-[9px] bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-400 font-bold shrink-0">
                              {worker.phone || 'Sin Teléfono'}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {worker.hasIncompleteProfile && 'Ficha Incompleta'} 
                            {worker.hasIncompleteProfile && worker.missingDocs.length > 0 && ' | '}
                            {worker.missingDocs.length > 0 && `Faltan: ${worker.missingDocs.join(', ')}`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {/* Sending Progress Screen */}
          {isSending && (
            <div className="flex-1 flex flex-col items-center justify-center py-12 space-y-6 flex-none">
              <Loader2 className="h-10 w-10 text-orange-600 animate-spin" />
              <div className="text-center space-y-2">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Enviando recordatorios vía WhatsApp...
                </p>
                <p className="text-xs text-muted-foreground">
                  Procesando {currentIndex} de {totalSelected}
                </p>
              </div>
              <div className="w-full max-w-md px-4">
                <Progress value={progressPercent} className="h-2 bg-slate-100" />
              </div>
            </div>
          )}

          {/* Summary Screen */}
          {showSummary && (
            <div className="flex-1 flex flex-col min-h-0 space-y-4 py-2">
              <div className="flex justify-around bg-slate-50 dark:bg-slate-950/40 p-4 rounded-xl flex-none">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground font-semibold">Exitosos</p>
                  <p className="text-2xl font-black text-emerald-600">{successCount}</p>
                </div>
                <div className="text-center border-l border-slate-200 dark:border-slate-800 pl-12">
                  <p className="text-xs text-muted-foreground font-semibold">Fallidos</p>
                  <p className="text-2xl font-black text-red-600">{failCount}</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900/50">
                {sendResults.map((result, i) => (
                  <div key={i} className="flex items-center justify-between p-3">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {result.name}
                    </span>
                    <div className="flex items-center gap-2">
                      {result.success ? (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                          <Check className="h-3 w-3" /> Enviado
                        </span>
                      ) : (
                        <span 
                          className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 cursor-help"
                          title={result.error || 'Fallo desconocido'}
                        >
                          <AlertCircle className="h-3 w-3" /> Error
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="pt-4 border-t border-slate-100 dark:border-slate-800/50 flex-none gap-2 sm:gap-0">
            {!showSummary && !isSending ? (
              <>
                <Button 
                  variant="outline" 
                  onClick={handleClose} 
                  className="rounded-xl border-slate-200 hover:bg-slate-50 dark:border-slate-800"
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSendReminders}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-md shadow-orange-500/25 flex items-center gap-1.5"
                  disabled={totalSelected === 0}
                >
                  <Send className="h-3.5 w-3.5" />
                  Enviar a Seleccionados ({totalSelected})
                </Button>
              </>
            ) : showSummary ? (
              <Button 
                onClick={handleClose}
                className="bg-slate-950 hover:bg-slate-900 text-white font-bold rounded-xl px-6"
              >
                Cerrar Reporte
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
