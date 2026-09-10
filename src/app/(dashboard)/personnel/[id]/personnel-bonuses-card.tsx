'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Coins,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Calendar,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { SpecialBonus } from '@/types/database';
import {
  createSpecialBonus,
  updateSpecialBonus,
  deleteSpecialBonus,
} from '@/app/(dashboard)/reports/bonos/actions';

interface PersonnelBonusesCardProps {
  personnelId: string;
  workerName: string;
  initialBonuses: SpecialBonus[];
  canEdit?: boolean;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(amount);
};

const formatMonthName = (monthStr: string | null | undefined) => {
  if (!monthStr) return 'Pendiente de Pago';
  try {
    const date = parseISO(`${monthStr}-01`);
    return format(date, 'MMMM yyyy', { locale: es }).toUpperCase();
  } catch (_) {
    return monthStr;
  }
};

export function PersonnelBonusesCard({
  personnelId,
  workerName,
  initialBonuses,
  canEdit = false,
}: PersonnelBonusesCardProps) {
  const router = useRouter();
  const [bonuses, setBonuses] = useState<SpecialBonus[]>(initialBonuses || []);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBonus, setEditingBonus] = useState<SpecialBonus | null>(null);

  // Form state
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setBonuses(initialBonuses || []);
  }, [initialBonuses]);

  const handleOpenCreateModal = () => {
    setEditingBonus(null);
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setReason('');
    setAmount('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (bonus: SpecialBonus) => {
    if (bonus.paid_month) {
      toast.error('No se puede modificar un bono que ya fue liquidado.');
      return;
    }
    setEditingBonus(bonus);
    setDate(bonus.date);
    setReason(bonus.reason);
    setAmount(bonus.amount.toString());
    setIsModalOpen(true);
  };

  const handleDelete = async (bonus: SpecialBonus) => {
    if (bonus.paid_month) {
      toast.error('No se puede eliminar un bono que ya fue liquidado.');
      return;
    }

    if (!confirm(`¿Estás seguro de que deseas eliminar el bono "${bonus.reason}" (${formatCurrency(bonus.amount)})?`)) {
      return;
    }

    setDeletingId(bonus.id);
    const toastId = toast.loading('Eliminando bono especial...');

    try {
      const res = await deleteSpecialBonus(bonus.id);
      if (!res.success) {
        throw new Error(res.error || 'Error al eliminar el bono.');
      }
      setBonuses(prev => prev.filter(b => b.id !== bonus.id));
      toast.success('Bono especial eliminado exitosamente.', { id: toastId });
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar el bono.', { id: toastId });
    } finally {
      setDeletingId(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!date) {
      toast.error('Por favor, selecciona una fecha.');
      return;
    }

    if (!reason.trim()) {
      toast.error('Por favor, ingresa el motivo del bono.');
      return;
    }

    const amountNum = parseInt(amount, 10);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('El monto debe ser un número entero mayor a 0.');
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading(editingBonus ? 'Actualizando bono...' : 'Registrando bono...');

    try {
      if (editingBonus) {
        const res = await updateSpecialBonus(editingBonus.id, {
          date,
          reason: reason.trim(),
          amount: amountNum,
        });

        if (!res.success) {
          throw new Error(res.error || 'Error al actualizar el bono.');
        }

        setBonuses(prev =>
          prev.map(b =>
            b.id === editingBonus.id
              ? { ...b, date, reason: reason.trim(), amount: amountNum }
              : b
          ).sort((a, b) => b.date.localeCompare(a.date))
        );

        toast.success('Bono especial actualizado exitosamente.', { id: toastId });
      } else {
        const res = await createSpecialBonus({
          personnel_id: personnelId,
          date,
          reason: reason.trim(),
          amount: amountNum,
        });

        if (!res.success) {
          throw new Error(res.error || 'Error al registrar el bono.');
        }

        toast.success('Bono especial registrado exitosamente.', { id: toastId });
        const optimisticBonus: SpecialBonus = {
          id: crypto.randomUUID(),
          personnel_id: personnelId,
          date,
          reason: reason.trim(),
          amount: amountNum,
          paid_month: null,
          created_by: null,
          created_at: new Date().toISOString(),
        };
        setBonuses(prev => [optimisticBonus, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      }

      setIsModalOpen(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Error al procesar el bono.', { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalAmount = bonuses.reduce((acc, b) => acc + (b.amount || 0), 0);
  const pendingCount = bonuses.filter(b => !b.paid_month).length;
  const paidCount = bonuses.filter(b => !!b.paid_month).length;

  return (
    <>
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-100 dark:border-slate-800/80 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Coins className="h-5 w-5 text-teal-600" />
                Bonos Especiales
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-1">
                Registro y estado de liquidación de bonos extraordinarios ({bonuses.length} {bonuses.length === 1 ? 'bono' : 'bonos'}{' '}
                · Total: {formatCurrency(totalAmount)}).
              </CardDescription>
            </div>

            {canEdit && (
              <Button
                type="button"
                onClick={handleOpenCreateModal}
                className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Registrar Bono
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {bonuses.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400 font-medium">
              No se han registrado bonos especiales para este colaborador.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/40 dark:bg-slate-900/20 hover:bg-transparent">
                    <TableHead className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase">Fecha</TableHead>
                    <TableHead className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase">Motivo</TableHead>
                    <TableHead className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase text-right">Monto</TableHead>
                    <TableHead className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase text-center">Estado de Liquidación</TableHead>
                    {canEdit && (
                      <TableHead className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase text-right">Acciones</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bonuses.map((bonus) => {
                    const isLiquidated = Boolean(bonus.paid_month);
                    const isDeleting = deletingId === bonus.id;

                    return (
                      <TableRow key={bonus.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10 transition-colors">
                        <TableCell className="font-medium text-xs whitespace-nowrap">
                          {(() => {
                            try {
                              return format(parseISO(bonus.date), 'dd/MM/yyyy');
                            } catch (_) {
                              return bonus.date;
                            }
                          })()}
                        </TableCell>
                        <TableCell className="text-xs font-medium text-slate-800 dark:text-slate-200">
                          {bonus.reason}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-xs text-teal-700 dark:text-teal-400 whitespace-nowrap">
                          {formatCurrency(bonus.amount)}
                        </TableCell>
                        <TableCell className="text-center">
                          {isLiquidated ? (
                            <Badge
                              variant="outline"
                              className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 font-bold uppercase text-[10px] inline-flex items-center gap-1"
                            >
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              Liquidado en {formatMonthName(bonus.paid_month)}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 font-bold uppercase text-[10px] inline-flex items-center gap-1"
                            >
                              <Clock className="h-3 w-3 text-amber-600" />
                              Pendiente de Pago
                            </Badge>
                          )}
                        </TableCell>
                        {canEdit && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={isLiquidated || isDeleting}
                                onClick={() => handleOpenEditModal(bonus)}
                                title={isLiquidated ? 'Liquidado (No se puede editar)' : 'Editar bono'}
                                className="h-8 w-8 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-30 rounded-lg"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={isLiquidated || isDeleting}
                                onClick={() => handleDelete(bonus)}
                                title={isLiquidated ? 'Liquidado (No se puede eliminar)' : 'Eliminar bono'}
                                className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-30 rounded-lg"
                              >
                                {isDeleting ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Registrar / Editar Bono */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Coins className="h-5 w-5 text-teal-600" />
              {editingBonus ? 'Editar Bono Especial' : 'Registrar Bono Especial'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {editingBonus
                ? `Modifica los datos del bono asignado a ${workerName}.`
                : `Asigna un nuevo bono extraordinario a ${workerName}.`}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="bonus-date" className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase">
                Fecha del Bono <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="bonus-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-xl border-slate-200 focus:ring-2 focus:ring-teal-500 text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bonus-reason" className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase">
                Motivo o Justificación <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="bonus-reason"
                type="text"
                placeholder="Ej: Trabajo adicional montaje, bono cumplimiento, etc."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="rounded-xl border-slate-200 focus:ring-2 focus:ring-teal-500 text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bonus-amount" className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase">
                Monto en CLP ($) <span className="text-rose-500">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">$</span>
                <Input
                  id="bonus-amount"
                  type="number"
                  min="1"
                  placeholder="50000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="rounded-xl border-slate-200 focus:ring-2 focus:ring-teal-500 pl-7 text-sm font-mono"
                  required
                />
              </div>
              {amount && !isNaN(parseInt(amount, 10)) && (
                <p className="text-[11px] text-teal-600 font-mono font-medium">
                  = {formatCurrency(parseInt(amount, 10))}
                </p>
              )}
            </div>

            <DialogFooter className="pt-4 flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                disabled={isSubmitting}
                className="rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-5 font-semibold"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    Guardando...
                  </>
                ) : editingBonus ? (
                  'Guardar Cambios'
                ) : (
                  'Registrar Bono'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default PersonnelBonusesCard;
