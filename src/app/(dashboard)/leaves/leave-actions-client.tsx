'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Check, X, Loader2, Trash2, Pencil, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { approveLeave, rejectLeave, deleteLeave, previewLeaveApprovalImpact } from './actions';
import Link from 'next/link';

export function LeaveActions({ leaveId, status }: { leaveId: string; status: string }) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [impact, setImpact] = useState<any>(null);

  const handleOpenApproveConfirm = async () => {
    setConfirmOpen(true);
    setLoadingImpact(true);
    const res = await previewLeaveApprovalImpact(leaveId);
    setLoadingImpact(false);
    if (!res.success) {
      toast.error('Error', { description: res.error || 'No se pudo cargar el impacto' });
      setConfirmOpen(false);
      return;
    }
    setImpact(res);
  };

  const handleConfirmApprove = () => {
    if (!impact) return;
    startTransition(async () => {
      const affected = impact.affectedShifts || impact.publishedShifts || [];
      const result = (await approveLeave(leaveId, {
        expectedDates: impact.dates || [],
        expectedShiftIds: affected.map((s: any) => s.id),
        expectedTransportIds: (impact.transportRequests || []).map((t: any) => t.id),
        expectedShiftSignatures: impact.shiftSignatures || [],
        expectedTransportSignatures: impact.transportSignatures || [],
      })) as any;
      if (result.error) {
        toast.error('Atención', { description: result.error });
        if (result.code === 'IMPACT_CHANGED') {
          setLoadingImpact(true);
          const refreshed = await previewLeaveApprovalImpact(leaveId);
          setLoadingImpact(false);
          if (refreshed.success) {
            setImpact(refreshed);
          }
        } else if (result.code === 'STALE_STATUS') {
          setConfirmOpen(false);
        }
      } else {
        toast.success('Solicitud aprobada');
        setConfirmOpen(false);
      }
    });
  };

  const handleReject = () => {
    startTransition(async () => {
      const result = await rejectLeave(leaveId);
      if (result.error) toast.error('Error', { description: result.error });
      else toast.success('Solicitud rechazada');
    });
  };

  const handleDelete = () => {
    if (!confirm('¿Estás seguro de que deseas eliminar este registro?')) return;
    startTransition(async () => {
      const result = await deleteLeave(leaveId);
      if (result.error) toast.error('Error', { description: result.error });
      else toast.success('Registro eliminado');
    });
  };

  return (
    <>
      <div className="flex gap-1">
        {status === 'pending' && (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
              onClick={handleOpenApproveConfirm}
              disabled={isPending}
              title="Revisar y aprobar solicitud"
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={handleReject}
              disabled={isPending}
              title="Rechazar solicitud"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        <Link href={`/leaves/${leaveId}/edit`}>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="Editar registro">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </Link>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50"
          onClick={handleDelete}
          disabled={isPending}
          title="Eliminar registro"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Confirmar aprobación de ausencia
            </DialogTitle>
            <DialogDescription>
              Revisa las fechas, turnos publicados y traslados que se cancelarán o eliminarán al aprobar esta solicitud.
            </DialogDescription>
          </DialogHeader>

          {loadingImpact ? (
            <div className="py-6 flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analizando impacto operativo...
            </div>
          ) : impact ? (
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border bg-slate-50 p-3 space-y-1">
                <p className="font-semibold text-slate-900">
                  {impact.leave?.personnel?.first_name} {impact.leave?.personnel?.last_name_father}
                </p>
                <p className="text-xs text-slate-600">
                  <strong>Fechas solicitadas ({impact.dates?.length || 0}):</strong>{' '}
                  {impact.leave?.start_date} al {impact.leave?.end_date}
                </p>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Turnos que se cancelarán ({(impact.affectedShifts || impact.publishedShifts || []).length}:{' '}
                  {impact.publishedShifts?.length || 0} publicados, {impact.draftShifts?.length || 0} borradores)
                </p>
                {(impact.affectedShifts || impact.publishedShifts || []).length > 0 ? (
                  <ul className="max-h-36 overflow-y-auto rounded-lg border divide-y text-xs">
                    {(impact.affectedShifts || impact.publishedShifts).map((s: any) => (
                      <li key={s.id} className="px-3 py-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold">{s.date}</span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              s.is_published
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {s.is_published ? 'Publicado' : 'Borrador'}
                          </span>
                        </div>
                        <span className="text-right">
                          {s.shift?.name || 'Turno'} ({s.shift?.start_time?.slice(0, 5)}–{s.shift?.end_time?.slice(0, 5)}) ·{' '}
                          {s.area?.name || ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500 rounded-lg border border-dashed px-3 py-2">
                    Sin turnos activos afectados en estas fechas.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Traslados afectados ({impact.transportRequests?.length || 0})
                </p>
                {impact.transportRequests?.length > 0 ? (
                  <ul className="max-h-32 overflow-y-auto rounded-lg border divide-y text-xs">
                    {impact.transportRequests.map((t: any) => (
                      <li key={t.id} className="px-3 py-2 flex items-center justify-between">
                        <span className="font-mono font-semibold">{t.date}</span>
                        <span>
                          {t.transport_type} ({t.status})
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500 rounded-lg border border-dashed px-3 py-2">
                    Sin traslados afectados en estas fechas.
                  </p>
                )}
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleConfirmApprove}
              disabled={loadingImpact || isPending || !impact}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Confirmar y aprobar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
