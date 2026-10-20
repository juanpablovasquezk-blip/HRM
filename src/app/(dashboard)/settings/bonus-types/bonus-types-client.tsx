'use client';

import React, { useState } from 'react';
import { BonusType } from '@/types/database';
import { createBonusType, updateBonusType, toggleBonusTypeActive } from './actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Coins, 
  Plus, 
  Pencil, 
  ArrowLeft, 
  FileCheck2, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  Hash
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

interface BonusTypesClientProps {
  initialTypes: BonusType[];
}

export function BonusTypesClient({ initialTypes }: BonusTypesClientProps) {
  const [types, setTypes] = useState<BonusType[]>(initialTypes);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<BonusType | null>(null);
  const [saving, setSaving] = useState(false);

  // Form State
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultAmount, setDefaultAmount] = useState<number>(0);
  const [amountIsEditable, setAmountIsEditable] = useState(false);
  const [requiresOt, setRequiresOt] = useState(false);
  const [active, setActive] = useState(true);

  const handleOpenCreate = () => {
    setEditingType(null);
    setCode('');
    setName('');
    setDescription('');
    setDefaultAmount(0);
    setAmountIsEditable(false);
    setRequiresOt(false);
    setActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: BonusType) => {
    setEditingType(item);
    setCode(item.code);
    setName(item.name);
    setDescription(item.description || '');
    setDefaultAmount(item.default_amount);
    setAmountIsEditable(item.amount_is_editable);
    setRequiresOt(item.requires_ot);
    setActive(item.active);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('El nombre del bono es obligatorio');
      return;
    }
    if (!editingType && !code.trim()) {
      toast.error('El código único es obligatorio');
      return;
    }

    setSaving(true);
    try {
      if (editingType) {
        const res = await updateBonusType(editingType.id, {
          name,
          description,
          default_amount: Number(defaultAmount) || 0,
          amount_is_editable: amountIsEditable,
          requires_ot: requiresOt,
          active,
        });

        if (res.success) {
          setTypes((prev) =>
            prev.map((t) =>
              t.id === editingType.id
                ? {
                    ...t,
                    name,
                    description,
                    default_amount: Number(defaultAmount) || 0,
                    amount_is_editable: amountIsEditable,
                    requires_ot: requiresOt,
                    active,
                  }
                : t
            )
          );
          toast.success('Tipo de bono actualizado con éxito');
          setIsModalOpen(false);
        } else {
          toast.error(res.error || 'Error al actualizar');
        }
      } else {
        const res = await createBonusType({
          code,
          name,
          description,
          default_amount: Number(defaultAmount) || 0,
          amount_is_editable: amountIsEditable,
          requires_ot: requiresOt,
          active,
        });

        if (res.success && res.data) {
          setTypes((prev) => [...prev, res.data]);
          toast.success('Tipo de bono creado con éxito');
          setIsModalOpen(false);
        } else {
          toast.error(res.error || 'Error al crear');
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Error inesperado');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: BonusType) => {
    const nextState = !item.active;
    try {
      const res = await toggleBonusTypeActive(item.id, nextState);
      if (res.success) {
        setTypes((prev) =>
          prev.map((t) => (t.id === item.id ? { ...t, active: nextState } : t))
        );
        toast.success(`Bono ${nextState ? 'activado' : 'desactivado'}`);
      } else {
        toast.error(res.error || 'Error al cambiar estado');
      }
    } catch (err: any) {
      toast.error('Error al cambiar estado');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <Button variant="outline" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Coins className="h-6 w-6 text-emerald-600" />
              Tipos de Bonos
            </h1>
            <p className="text-sm text-muted-foreground">
              Define los bonos disponibles, tarifas por defecto y requerimientos de OT.
            </p>
          </div>
        </div>

        <Button onClick={handleOpenCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm">
          <Plus className="h-4 w-4" />
          Nuevo Tipo de Bono
        </Button>
      </div>

      {/* Tarjeta Informativa de Reglas */}
      <Card className="border-emerald-200/60 bg-emerald-50/50 dark:bg-emerald-950/10 dark:border-emerald-900/40">
        <CardContent className="p-4 flex items-start gap-3 text-sm text-emerald-900 dark:text-emerald-300">
          <HelpCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Regla de Negocio sobre Tarifas e Historial:</p>
            <p className="text-xs text-emerald-800 dark:text-emerald-400">
              Modificar el valor de un bono aquí afectará <strong>únicamente a los nuevos bonos</strong> que se creen en adelante. 
              Los bonos ya emitidos o liquidados conservan inalterable su valor histórico pactado.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Grid de Tipos de Bonos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {types.map((item) => (
          <Card 
            key={item.id} 
            className={`border transition-all duration-200 hover:shadow-md flex flex-col justify-between ${
              !item.active ? 'opacity-60 bg-slate-50 dark:bg-slate-900/50' : 'bg-white dark:bg-slate-950'
            }`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <Badge variant="outline" className="font-mono text-xs px-2 py-0.5">
                  {item.code}
                </Badge>
                <div className="flex items-center gap-1.5">
                  <Badge className={item.active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' : 'bg-slate-100 text-slate-600'}>
                    {item.active ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
              </div>
              <CardTitle className="text-lg font-bold mt-2 text-slate-900 dark:text-slate-100">
                {item.name}
              </CardTitle>
              <CardDescription className="text-xs line-clamp-2 min-h-[32px]">
                {item.description || 'Sin descripción adicional.'}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 pt-0">
              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl space-y-2 text-sm border border-slate-100 dark:border-slate-800">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground font-medium">Monto Base / Por Defecto:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {item.amount_is_editable && item.default_amount === 0 
                      ? 'Manual al emitir' 
                      : `$${item.default_amount.toLocaleString('es-CL')}`}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">¿Monto editable?:</span>
                  <span className="font-semibold">
                    {item.amount_is_editable ? 'Sí (manual)' : 'Fijo por tarifa'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">¿Exige N° OT?:</span>
                  <span className="font-semibold flex items-center gap-1">
                    {item.requires_ot ? (
                      <span className="text-emerald-600 flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3" /> Obligatorio</span>
                    ) : (
                      <span className="text-slate-400">Opcional</span>
                    )}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Switch 
                    checked={item.active} 
                    onCheckedChange={() => handleToggleActive(item)}
                    aria-label="Activar o desactivar bono"
                  />
                  <span className="text-xs text-muted-foreground">
                    {item.active ? 'Habilitado' : 'Deshabilitado'}
                  </span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleOpenEdit(item)}
                  className="gap-1 text-xs text-slate-600 hover:text-slate-900"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal Crear / Editar */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-emerald-600" />
                {editingType ? 'Editar Tipo de Bono' : 'Nuevo Tipo de Bono'}
              </DialogTitle>
              <DialogDescription>
                {editingType 
                  ? 'Modifica las condiciones del bono. El nuevo monto solo aplicará a bonos futuros.'
                  : 'Crea una nueva categoría de bonificación para asignar a los colaboradores.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {!editingType && (
                <div className="space-y-1.5">
                  <Label htmlFor="code" className="text-xs font-semibold">Código Único (Identificador)</Label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="code"
                      placeholder="EJ: LIMPIEZA_EXTRA"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      className="pl-9 font-mono uppercase"
                      required
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Código en mayúsculas sin espacios, útil para integraciones de sistemas.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-semibold">Nombre del Bono</Label>
                <Input
                  id="name"
                  placeholder="Ej: Bono Limpieza Stall"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-xs font-semibold">Descripción u Observaciones</Label>
                <Textarea
                  id="description"
                  placeholder="Detalles sobre cuándo y cómo aplica este bono..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="defaultAmount" className="text-xs font-semibold">
                  Monto por Defecto ($ CLP)
                </Label>
                <Input
                  id="defaultAmount"
                  type="number"
                  min="0"
                  step="500"
                  placeholder="Ej: 8000"
                  value={defaultAmount || ''}
                  onChange={(e) => setDefaultAmount(Number(e.target.value))}
                />
                <p className="text-[11px] text-muted-foreground">
                  Valor base en pesos chilenos asignado a cada evento.
                </p>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl space-y-3 border border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="editableAmount" className="text-xs font-medium cursor-pointer">
                      ¿Permitir ingresar monto manual?
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Actívalo si cada bono de este tipo tiene un monto negociado o variable (Ej: Bono Especial).
                    </p>
                  </div>
                  <Switch
                    id="editableAmount"
                    checked={amountIsEditable}
                    onCheckedChange={setAmountIsEditable}
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-800">
                  <div className="space-y-0.5">
                    <Label htmlFor="requiresOt" className="text-xs font-medium cursor-pointer">
                      ¿Exige N° de Orden de Trabajo (OT)?
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Obliga a ingresar el N° de OT y previene que una persona cobre 2 veces por la misma OT.
                    </p>
                  </div>
                  <Switch
                    id="requiresOt"
                    checked={requiresOt}
                    onCheckedChange={setRequiresOt}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {saving ? 'Guardando...' : editingType ? 'Guardar Cambios' : 'Crear Bono'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
