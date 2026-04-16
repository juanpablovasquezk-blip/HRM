'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { createManualAssignment } from '@/app/(dashboard)/shifts/actions';
import { PersonnelSelect } from '@/components/personnel/personnel-select';
import Link from 'next/link';

interface Person {
  id: string;
  first_name: string;
  last_name_father: string;
  rut: string;
}

interface Area {
  id: string;
  name: string;
  positions: { id: string, name: string }[];
}

interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
}

interface ManualAssignmentClientProps {
  personnel: Person[];
  shifts: Shift[];
  areas: Area[];
}

export function ManualAssignmentClient({ personnel, shifts, areas }: ManualAssignmentClientProps) {
  const [isPending, startTransition] = useTransition();
  const [personnelId, setPersonnelId] = useState('');
  const [areaId, setAreaId] = useState('');
  const router = useRouter();

  const selectedArea = areas.find(a => a.id === areaId);
  const positions = selectedArea?.positions || [];

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!personnelId) {
      toast.error('Selección requerida', { description: 'Debe seleccionar un trabajador' });
      return;
    }

    const formData = new FormData(event.currentTarget);
    formData.set('personnel_id', personnelId);

    startTransition(async () => {
      const result = await createManualAssignment(formData);
      if (result.error) {
        toast.error('Error', { description: result.error });
      } else {
        toast.success('Asignación manual guardada');
        router.push('/shifts/assignments');
      }
    });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/shifts/assignments">
          <Button variant="ghost" size="icon" className="rounded-xl">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cargar Turno Manual</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Asigna un trabajador a un turno específico ignorando la automatización
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-orange-600 font-semibold">Detalles de la Asignación</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Trabajador *</Label>
              <PersonnelSelect 
                personnel={personnel} 
                onSelect={setPersonnelId} 
                placeholder="Busca por nombre o RUT..."
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="date">Fecha *</Label>
              <Input id="date" name="date" type="date" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shift_id">Turno *</Label>
              <select id="shift_id" name="shift_id" required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-orange-500">
                <option value="">Seleccionar turno</option>
                {shifts.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="area_id">Área Operativa *</Label>
              <select 
                id="area_id" 
                name="area_id" 
                required 
                value={areaId}
                onChange={(e) => setAreaId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Seleccionar área</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="position_id">Cargo en este turno *</Label>
              <select id="position_id" name="position_id" required
                disabled={!areaId}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50">
                <option value="">Seleccionar cargo</option>
                {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isPending}
            className="bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar Asignación Manual
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
        </div>
      </form>
    </div>
  );
}
