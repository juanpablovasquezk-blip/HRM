'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createPersonnel, updatePersonnel } from '@/app/(dashboard)/personnel/actions';
import type { Personnel } from '@/types/database';

interface PersonnelFormProps {
  personnel?: Personnel;
  companies?: { id: string; name: string }[];
  positions?: { id: string; name: string }[];
  shifts?: { id: string; name: string; start_time: string; end_time: string }[];
}

export function PersonnelForm({ personnel, companies = [], positions = [], shifts = [] }: PersonnelFormProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isEditing = !!personnel;
  const [prefersNight, setPrefersNight] = useState(personnel?.prefers_night ?? false);
  const [avoidsNight, setAvoidsNight] = useState(personnel?.avoids_night ?? false);
  const [hasSpecialContract, setHasSpecialContract] = useState(personnel?.has_special_contract ?? false);
  const [selectedSecondary, setSelectedSecondary] = useState<string[]>(
    (personnel?.secondary_positions as string[]) || []
  );
  const [dropdownValue, setDropdownValue] = useState<string>('');

  const address = (personnel?.address as { street?: string; city?: string; region?: string }) || {};

  const handleSubmit = async (formData: FormData) => {
    formData.set('prefers_night', String(prefersNight));
    formData.set('avoids_night', String(avoidsNight));
    formData.set('has_special_contract', String(hasSpecialContract));
    formData.set('secondary_positions', selectedSecondary.join(','));
    // rotation_pattern and fixed_shift_id come direct from their selects via name attribute

    startTransition(async () => {
      const result = isEditing
        ? await updatePersonnel(personnel!.id, formData)
        : await createPersonnel(formData);

      if (result.error) {
        toast.error('Error', { description: result.error });
      } else {
        toast.success(isEditing ? 'Trabajador actualizado' : 'Trabajador registrado');
        router.push('/personnel');
      }
    });
  };

  // Deduplicate positions by name (same role can exist in multiple areas)
  const uniquePositions = Array.from(
    new Map(positions.map(p => [p.name, p])).values()
  ).sort((a, b) => a.name.localeCompare(b.name));
  const positionMap = Object.fromEntries(positions.map(p => [p.id, p.name]));

  return (
    <form action={handleSubmit} className="space-y-6 max-w-3xl">
      {/* Información Personal */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Información Personal</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="first_name">Nombre *</Label>
            <Input id="first_name" name="first_name" defaultValue={personnel?.first_name} required placeholder="Juan" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name_father">Apellido Paterno *</Label>
            <Input id="last_name_father" name="last_name_father" defaultValue={personnel?.last_name_father} required placeholder="Pérez" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name_mother">Apellido Materno</Label>
            <Input id="last_name_mother" name="last_name_mother" defaultValue={personnel?.last_name_mother} placeholder="García" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rut">RUT *</Label>
            <Input id="rut" name="rut" defaultValue={personnel?.rut} required placeholder="12.345.678-9" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email (para acceso al sistema)</Label>
            <Input id="email" name="email" type="email" defaultValue={personnel?.email || ''} placeholder="juan.perez@ejemplo.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="birth_date">Fecha de Nacimiento *</Label>
            <Input id="birth_date" name="birth_date" type="date" defaultValue={personnel?.birth_date} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Teléfono</Label>
            <Input id="phone" name="phone" defaultValue={personnel?.phone} placeholder="+56 9 1234 5678" />
          </div>
        </CardContent>
      </Card>

      {/* Dirección */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Dirección</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2 md:col-span-3">
            <Label htmlFor="address_street">Calle</Label>
            <Textarea id="address_street" name="address_street" defaultValue={address.street} placeholder="Av. Providencia 1234" rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address_city">Ciudad</Label>
            <Input id="address_city" name="address_city" defaultValue={address.city} placeholder="Santiago" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address_region">Región</Label>
            <Input id="address_region" name="address_region" defaultValue={address.region} placeholder="Metropolitana" />
          </div>
        </CardContent>
      </Card>

      {/* Cargo y Empresa */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Cargo y Empresa</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {!isEditing && (
            <div className="space-y-2">
              <Label htmlFor="company_id">Empresa *</Label>
              <select id="company_id" name="company_id" required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                defaultValue="">
                <option value="">Seleccionar empresa</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="main_position">Cargo Principal</Label>
            <select id="main_position" name="main_position"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={personnel?.main_position || ''}>
              <option value="">Por asignar / Sin cargo</option>
              {uniquePositions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>
              Cargos Secundarios{' '}
              <span className="text-xs text-muted-foreground">(ordenados por prioridad — el primero será la primera opción si no se necesita del cargo principal)</span>
            </Label>

            {/* Add from dropdown */}
            <div className="flex gap-2">
              <select
                className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={dropdownValue}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val && !selectedSecondary.includes(val)) {
                    setSelectedSecondary(prev => [...prev, val]);
                  }
                  // Reset select immediately
                  setDropdownValue('');
                }}
              >
                <option value="">+ Agregar cargo secundario...</option>
                {uniquePositions
                  .filter(p => !selectedSecondary.includes(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))
                }
              </select>
            </div>

            {/* Priority list */}
            {selectedSecondary.length > 0 ? (
              <div className="space-y-1.5 p-3 rounded-lg border border-input bg-slate-50 dark:bg-slate-900/50">
                {selectedSecondary.map((posId, idx) => {
                  const posName = positionMap[posId];
                  const displayName = posName ? posName : `(Cargo no encontrado - ${posId.split('-')[0]})`;
                  return (
                    <div key={`${posId}-${idx}`} className="flex items-center gap-2 bg-white dark:bg-slate-950 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-800 shadow-sm">
                      <span className="flex items-center justify-center h-6 w-6 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 text-xs font-bold shrink-0">
                        {idx + 1}
                      </span>
                      <span className={`text-sm font-medium flex-1 ${!posName && 'text-red-500'}`}>{displayName}</span>
                      <div className="flex items-center gap-0.5">
                        <button type="button" disabled={idx === 0}
                          className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-default transition-colors"
                          onClick={() => {
                            const arr = [...selectedSecondary];
                            [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                            setSelectedSecondary(arr);
                          }}>
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                        </button>
                        <button type="button" disabled={idx === selectedSecondary.length - 1}
                          className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-default transition-colors"
                          onClick={() => {
                            const arr = [...selectedSecondary];
                            [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                            setSelectedSecondary(arr);
                          }}>
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        <button type="button"
                          className="h-6 w-6 flex items-center justify-center rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors ml-1"
                          onClick={() => setSelectedSecondary(prev => prev.filter(p => p !== posId))}>
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic px-1">Sin cargos secundarios asignados.</p>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="driver_licenses">
              Licencias de Conducir{' '}
              <span className="text-xs text-muted-foreground">(separadas por coma)</span>
            </Label>
            <Input id="driver_licenses" name="driver_licenses" defaultValue={personnel?.driver_licenses?.join(', ')} placeholder="B, C, D" />
          </div>
        </CardContent>
      </Card>

      {/* Planificación y Rotación */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-orange-600">Planificación y Escala</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rotation_pattern">Patrón de Rotación</Label>
              <select 
                id="rotation_pattern" 
                name="rotation_pattern"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                defaultValue={personnel?.rotation_pattern || '5x2'}
              >
                <option value="5x2">5x2 (Semanal / Rotativo)</option>
                <option value="l-v">Lunes a Viernes (Fijo)</option>
                <option value="7x7">7x7 (Rotativo Canes)</option>
                <option value="4x4_noche">4x4 Noche (Intercambiable)</option>
                <option value="part_time">Part-Time / Ocasional</option>
                <option value="manual">Manual / Bajo Demanda</option>
              </select>
              <p className="text-[10px] text-muted-foreground italic">Determina cómo el motor propone los turnos.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fixed_shift_id">Turno Fijo (Opcional)</Label>
              <select 
                id="fixed_shift_id" 
                name="fixed_shift_id"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                defaultValue={personnel?.fixed_shift_id || ''}
              >
                <option value="">Ninguno / Rotativo</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.start_time.substring(0,5)} - {s.end_time.substring(0,5)})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground italic">Si se asigna, este trabajador siempre preferirá este turno.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hire_date">Fecha de Ingreso (Contratación)</Label>
              <Input id="hire_date" name="hire_date" type="date" defaultValue={personnel?.hire_date || ''} />
              <p className="text-[10px] text-muted-foreground italic">No se podrán asignar turnos antes de esta fecha.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="termination_date">Fecha de Baja (Si renuncia)</Label>
              <Input id="termination_date" name="termination_date" type="date" defaultValue={personnel?.termination_date || ''} />
              <p className="text-[10px] text-muted-foreground italic">Pasada esta fecha, el trabajador quedará bloqueado en el roster.</p>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-orange-100 bg-orange-50/30 md:col-span-2">
              <div>
                <Label htmlFor="has_special_contract" className="text-orange-900">¿Contrato Especial? (7x7 / Otros)</Label>
                <p className="text-[11px] text-orange-700">Exime de la regla de 40h semanales y domingos libres (ej: Canes externo)</p>
              </div>
              <Switch id="has_special_contract" checked={hasSpecialContract} onCheckedChange={setHasSpecialContract} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preferencias y Restricciones */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Preferencias y Restricciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="prefers_night">Prefiere Turno Nocturno</Label>
              <p className="text-xs text-muted-foreground">Priorizar asignaciones de turno nocturno</p>
            </div>
            <Switch id="prefers_night" checked={prefersNight} onCheckedChange={(checked) => { setPrefersNight(checked); if (checked) setAvoidsNight(false); }} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="avoids_night">Evita Turno Nocturno</Label>
              <p className="text-xs text-muted-foreground">Evitar asignar turnos nocturnos cuando sea posible</p>
            </div>
            <Switch id="avoids_night" checked={avoidsNight} onCheckedChange={(checked) => { setAvoidsNight(checked); if (checked) setPrefersNight(false); }} />
          </div>
        </CardContent>
      </Card>

      {/* Acciones */}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}
          className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg shadow-orange-500/25">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Guardar Cambios' : 'Crear Trabajador'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
      </div>
    </form>
  );
}
