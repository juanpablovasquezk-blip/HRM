'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { requestLeave, updateLeave } from '@/app/(dashboard)/leaves/actions';
import { PersonnelSelect } from '@/components/personnel/personnel-select';
import type { Leave } from '@/types/database';

const LEAVE_TYPES = [
  { value: 'vacation', label: 'Vacaciones' },
  { value: 'sick', label: 'Licencia Médica' },
  { value: 'personal', label: 'Día Administrativo' },
  { value: 'maternity', label: 'Paternidad/Maternidad' },
  { value: 'other', label: 'Otro' },
];

interface Person {
  id: string;
  first_name: string;
  last_name_father: string;
  rut: string;
}

export function LeaveForm({ personnel, leave }: { personnel: Person[], leave?: Leave }) {
  const [isPending, startTransition] = useTransition();
  const [personnelId, setPersonnelId] = useState(leave?.personnel_id || '');
  const router = useRouter();
  const isEditing = !!leave;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!personnelId) {
      toast.error('Selección requerida', { description: 'Debe seleccionar un trabajador' });
      return;
    }

    const formData = new FormData(event.currentTarget);
    formData.set('personnel_id', personnelId);

    startTransition(async () => {
      const result = isEditing
        ? await updateLeave(leave.id, formData)
        : await requestLeave(formData);

      if (result.error) {
        toast.error('Error', { description: result.error });
      } else {
        toast.success(isEditing ? 'Registro actualizado' : 'Solicitud enviada correctamente');
        router.push('/leaves');
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-orange-600">
            {isEditing ? 'Editar Registro' : 'Detalles de la Ausencia'}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label>Trabajador *</Label>
            {isEditing ? (
              <div className="p-2 border rounded bg-slate-50 text-sm font-medium">
                {personnel.find(p => p.id === personnelId)?.first_name} {personnel.find(p => p.id === personnelId)?.last_name_father}
              </div>
            ) : (
              <PersonnelSelect 
                personnel={personnel} 
                onSelect={setPersonnelId} 
                placeholder="Escribe el nombre o RUT para buscar..."
              />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="type">Tipo *</Label>
            <select id="type" name="type" required defaultValue={leave?.type}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-orange-500">
              <option value="">Seleccionar tipo</option>
              {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="status_mode">Estado</Label>
            <select id="status_mode" name="status" defaultValue={leave?.status || 'pending'}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-orange-500">
              <option value="pending">Pendiente de Aprobación</option>
              <option value="approved">Aprobado</option>
              <option value="rejected">Rechazado</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="start_date">Fecha Inicio *</Label>
            <Input id="start_date" name="start_date" type="date" required defaultValue={leave?.start_date} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end_date">Fecha Término *</Label>
            <Input id="end_date" name="end_date" type="date" required defaultValue={leave?.end_date} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="reason">Motivo / Observación</Label>
            <Textarea id="reason" name="reason" defaultValue={leave?.reason || ''} placeholder="Opcional: Detalles sobre la ausencia" rows={3} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}
          className="bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Guardar Cambios' : 'Registrar Ausencia'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
      </div>
    </form>
  );
}
