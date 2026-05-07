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
import { Loader2, Plus, Trash2, Edit2, X } from 'lucide-react';
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

export function ShiftManageClient({ initialShifts, companies }: ShiftManageClientProps) {
  const [isPending, startTransition] = useTransition();
  const [requiresTransport, setRequiresTransport] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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
    if (!formRef.current) return;
    
    const form = formRef.current;
    (form.elements.namedItem('name') as HTMLInputElement).value = shift.name;
    (form.elements.namedItem('start_time') as HTMLInputElement).value = shift.start_time;
    (form.elements.namedItem('end_time') as HTMLInputElement).value = shift.end_time;
    (form.elements.namedItem('geov') as HTMLInputElement).value = shift.geov || '';
    (form.elements.namedItem('company_id') as HTMLSelectElement).value = shift.company_id || companies[0]?.id;
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setRequiresTransport(false);
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
          Crear y modificar las definiciones de turnos
        </p>
      </div>

      {/* Create Form */}
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
          <form ref={formRef} action={handleSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="shift-name">Nombre</Label>
              <Input id="shift-name" name="name" placeholder="Turno Mañana" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shift-start">Entrada</Label>
              <Input id="shift-start" name="start_time" type="time" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shift-end">Salida</Label>
              <Input id="shift-end" name="end_time" type="time" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shift-geov">GeoV</Label>
              <Input id="shift-geov" name="geov" type="number" step="0.01" placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shift-company">Compañía (Opcional)</Label>
              <select id="shift-company" name="company_id"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Cualquier Compañía</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch checked={requiresTransport} onCheckedChange={setRequiresTransport} />
                <Label className="text-xs">Usa Bus</Label>
              </div>
              <Button type="submit" disabled={isPending} className="bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25">
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
                <TableHead>Compañía</TableHead>
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
                    <Badge variant="outline" className="text-[10px] font-medium uppercase">
                      {companies.find(c => c.id === shift.company_id)?.name || 'Cualquier Compañía'}
                    </Badge>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{shift.duration_hours}h</Badge></TableCell>
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
