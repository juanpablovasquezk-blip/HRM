'use client';

import { useState, useTransition, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Plus, Trash2, Edit2, X, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { createShift, updateShift, deleteShift } from '@/app/(dashboard)/shifts/actions';

interface ShiftManageClientProps {
  initialShifts: Array<{
    id: string;
    name: string;
    start_time: string;
    end_time: string;
    duration_hours: number;
    requires_transport: boolean;
    geov?: number | null;
    company_id?: string;
  }>;
  companies: Array<{ id: string; name: string }>;
}

// Calculates duration in hours from "HH:MM" strings, handles overnight shifts
function calcDuration(start: string, end: string): number | null {
  if (!start || !end || !start.includes(':') || !end.includes(':')) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return null;
  let startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;
  if (endMins <= startMins) endMins += 24 * 60; // crosses midnight
  return Math.round(((endMins - startMins) / 60) * 10) / 10;
}

export function ShiftManageClient({ initialShifts, companies }: ShiftManageClientProps) {
  const [isPending, startTransition] = useTransition();
  const [requiresTransport, setRequiresTransport] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const liveDuration = calcDuration(startTime, endTime);

  const handleSubmit = (formData: FormData) => {
    formData.set('requires_transport', String(requiresTransport));

    startTransition(async () => {
      let result;
      if (editingId) {
        formData.set('id', editingId);
        result = await updateShift(formData);
      } else {
        result = await createShift(formData);
      }

      if (result.error) {
        toast.error('Error', { description: result.error });
      } else {
        toast.success(editingId ? 'Turno actualizado' : 'Turno creado');
        cancelEdit();
      }
    });
  };

  const handleEdit = (shift: any) => {
    setEditingId(shift.id);
    setRequiresTransport(shift.requires_transport);
    const st = shift.start_time?.slice(0, 5) || '';
    const et = shift.end_time?.slice(0, 5) || '';
    setStartTime(st);
    setEndTime(et);
    if (!formRef.current) return;

    const form = formRef.current;
    (form.elements.namedItem('name') as HTMLInputElement).value = shift.name;
    (form.elements.namedItem('start_time') as HTMLInputElement).value = st;
    (form.elements.namedItem('end_time') as HTMLInputElement).value = et;
    (form.elements.namedItem('geov') as HTMLInputElement).value = shift.geov ?? '';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setRequiresTransport(false);
    setStartTime('');
    setEndTime('');
    if (formRef.current) formRef.current.reset();
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteShift(id);
      if (result.error) {
        toast.error('Error', { description: result.error });
      } else {
        toast.success('Turno eliminado');
      }
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <a href="/shifts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-orange-600 transition-colors mb-2">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Volver a Turnos
        </a>
        <h1 className="text-2xl font-bold tracking-tight">Gestionar Turnos</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Crear y modificar las definiciones de turnos (globales — aplican a todas las empresas)
        </p>
      </div>

      {/* Create / Edit Form */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              {editingId ? 'Editar Turno' : 'Nuevo Turno'}
            </div>
            {editingId && (
              <Button variant="ghost" size="sm" onClick={cancelEdit} className="h-8">
                <X className="h-4 w-4 mr-2" /> Cancelar
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={handleSubmit} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
            {/* Nombre */}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="shift-name">Nombre</Label>
              <Input id="shift-name" name="name" placeholder="Turno Mañana" required />
            </div>
            {/* Entrada */}
            <div className="space-y-2">
              <Label htmlFor="shift-start">Entrada</Label>
              <Input
                id="shift-start"
                name="start_time"
                type="time"
                required
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
              />
            </div>
            {/* Salida */}
            <div className="space-y-2">
              <Label htmlFor="shift-end">Salida</Label>
              <Input
                id="shift-end"
                name="end_time"
                type="time"
                required
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
              />
            </div>
            {/* Duración (preview calculado en tiempo real) */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1 text-slate-500">
                <Clock className="h-3.5 w-3.5" />
                Duración
              </Label>
              <div className="flex h-10 items-center px-3 rounded-md border border-slate-200 bg-slate-50 text-sm font-semibold text-orange-600">
                {liveDuration !== null ? `${liveDuration}h` : '—'}
              </div>
            </div>
            {/* GeoV */}
            <div className="space-y-2">
              <Label htmlFor="shift-geov">GeoV</Label>
              <Input id="shift-geov" name="geov" type="number" step="0.01" placeholder="0.00" />
            </div>
            {/* Usa Bus + Botón */}
            <div className="flex items-center justify-between md:col-span-6">
              <div className="flex items-center gap-2">
                <Switch checked={requiresTransport} onCheckedChange={setRequiresTransport} />
                <Label className="text-xs">Usa Bus</Label>
              </div>
              <Button
                type="submit"
                disabled={isPending}
                className="bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingId ? 'Guardar' : 'Crear')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Shifts Table */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Turno</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Salida</TableHead>
                <TableHead>Duración</TableHead>
                <TableHead>GeoV</TableHead>
                <TableHead>Transporte</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialShifts.map((shift) => (
                <TableRow key={shift.id}>
                  <TableCell className="font-medium">{shift.name}</TableCell>
                  <TableCell className="font-mono text-sm">{shift.start_time?.slice(0, 5)}</TableCell>
                  <TableCell className="font-mono text-sm">{shift.end_time?.slice(0, 5)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {shift.duration_hours > 0
                        ? `${shift.duration_hours}h`
                        : (calcDuration(shift.start_time?.slice(0, 5), shift.end_time?.slice(0, 5)) ?? 0) + 'h'}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-bold text-indigo-600">{shift.geov ?? '-'}</TableCell>
                  <TableCell>
                    {shift.requires_transport
                      ? <Badge className="bg-blue-100 text-orange-700 dark:bg-blue-900/30 dark:text-blue-400">Sí</Badge>
                      : <span className="text-muted-foreground text-sm">No</span>
                    }
                  </TableCell>
                  <TableCell className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-orange-600"
                      onClick={() => handleEdit(shift)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700"
                      onClick={() => handleDelete(shift.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
