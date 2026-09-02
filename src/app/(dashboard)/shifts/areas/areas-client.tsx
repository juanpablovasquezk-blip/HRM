'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin, Briefcase, Plus, Trash2, X, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { createArea, deleteArea, createPosition, deletePosition } from '@/app/(dashboard)/shifts/actions';

interface AreasClientProps {
  initialAreas: any[];
  userCompanyId: string;
}

export function AreasClient({ initialAreas, userCompanyId }: AreasClientProps) {
  const [isPending, startTransition] = useTransition();
  const [showNewAreaForm, setShowNewAreaForm] = useState(false);
  const [addingPositionToArea, setAddingPositionToArea] = useState<string | null>(null);
  const [creatingNewPosition, setCreatingNewPosition] = useState(false);

  const handleCreateArea = (formData: FormData) => {
    formData.set('company_id', userCompanyId);
    startTransition(async () => {
      const result = await createArea(formData);
      if (result.error) toast.error('Error', { description: result.error });
      else {
        toast.success('Área creada');
        setShowNewAreaForm(false);
      }
    });
  };

  const handleCreatePosition = (areaId: string, formData: FormData) => {
    formData.set('area_id', areaId);
    startTransition(async () => {
      const result = await createPosition(formData);
      if (result.error) toast.error('Error', { description: result.error });
      else {
        toast.success('Cargo añadido');
        setAddingPositionToArea(null);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link href="/shifts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-orange-600 transition-colors mb-2">
            <ArrowLeft className="h-3.5 w-3.5" /> Volver a Turnos
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Áreas y Cargos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gestiona la estructura organizacional de tu empresa
          </p>
        </div>
        <Button 
          className="bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25"
          onClick={() => setShowNewAreaForm(true)}
          disabled={showNewAreaForm}
        >
          <Plus className="h-4 w-4 mr-2" />Nueva Área
        </Button>
      </div>

      {showNewAreaForm && (
        <Card className="border-orange-200 dark:border-orange-900 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex justify-between items-center">
              <span>Registrar Nueva Área</span>
              <Button variant="ghost" size="sm" onClick={() => setShowNewAreaForm(false)} className="h-8 w-8 p-0"><X className="h-4 w-4" /></Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={handleCreateArea} className="flex gap-4 items-end">
              <div className="flex-1 space-y-2">
                <Label>Nombre del Área</Label>
                <Input name="name" placeholder="Ej: Recursos Humanos" required />
              </div>
              <Button type="submit" disabled={isPending}>Guardar</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {initialAreas && initialAreas.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {initialAreas.map((area: any) => (
            <Card key={area.id} className="border-slate-200/60 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-orange-500" />
                    {area.name}
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => {
                    if (confirm('Eliminar área entera?')) {
                      startTransition(() => { deleteArea(area.id); });
                    }
                  }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="flex flex-col gap-2 mt-2">
                  <div className="text-xs text-muted-foreground font-medium mb-1">CARGOS REGISTRADOS:</div>
                  {area.positions && area.positions.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {area.positions.map((pos: any) => (
                        <Badge key={pos.id} variant="secondary" className="font-normal text-xs flex items-center gap-1 group py-1">
                          <Briefcase className="h-3 w-3 text-slate-400" /> 
                          <span>{pos.name}</span>
                          {pos.requires_shifts === false && (
                            <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-1.5 py-0.5 rounded ml-1">
                              Sin turnos
                            </span>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50 ml-1" 
                            onClick={(e) => {
                               e.stopPropagation();
                               startTransition(async () => {
                                 const result = await deletePosition(pos.id);
                                 if (result.error) {
                                   toast.error(`No se pudo eliminar: ${result.error}`);
                                 } else {
                                   toast.success('Cargo eliminado');
                                 }
                               });
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-slate-400 italic">Sin cargos definidos</span>
                  )}

                  {addingPositionToArea === area.id ? (() => {
                    const allPositionNames = Array.from(new Set(
                      initialAreas.flatMap((a: any) => (a.positions || []).map((p: any) => p.name))
                    )).sort();
                    return (
                      <form action={(formData) => handleCreatePosition(area.id, formData)} className="mt-4 flex flex-col gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="flex gap-2">
                          {creatingNewPosition ? (
                            <Input name="name" placeholder="Nombre del nuevo cargo..." size={1} className="h-8 text-xs flex-1 bg-white" autoFocus required />
                          ) : (
                            <select name="name" required className="flex h-8 flex-1 rounded-md border border-input bg-white px-2 py-1 text-xs"
                              onChange={(e) => { if (e.target.value === '__NEW__') { e.preventDefault(); setCreatingNewPosition(true); } }}
                            >
                              <option value="">Seleccionar cargo...</option>
                              {allPositionNames.map((name: string) => (
                                <option key={name} value={name}>{name}</option>
                              ))}
                              <option value="__NEW__" className="font-semibold">＋ Crear cargo nuevo...</option>
                            </select>
                          )}
                          <Button type="submit" size="sm" className="h-8 bg-orange-600 text-white hover:bg-orange-700" disabled={isPending}>Ok</Button>
                          <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => { setAddingPositionToArea(null); setCreatingNewPosition(false); }}>
                             <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 font-medium pt-1">
                          <input type="checkbox" name="requires_shifts" value="true" defaultChecked className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 h-3.5 w-3.5" />
                          <span>Requiere asignación de turnos (Roster Operativo)</span>
                        </label>
                      </form>
                    );
                  })() : (
                    <Button variant="outline" size="sm" className="mt-4 w-full h-8 text-xs border-dashed" onClick={() => setAddingPositionToArea(area.id)}>
                      <Plus className="h-3 w-3 mr-1" /> Añadir Cargo
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <MapPin className="h-8 w-8 mx-auto mb-3 opacity-50" />
            Aún no hay áreas definidas.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
