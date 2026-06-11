'use client';

import React, { useState } from 'react';
import { 
  FileText, 
  Plus, 
  Trash2, 
  Edit2, 
  AlertCircle, 
  CheckCircle2, 
  XCircle,
  Clock,
  Link2
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { saveDocumentDefinition, deleteDocumentDefinition } from './actions';
import { DocumentDefinition, Position } from '@/types/database';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '../../../../components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DocumentsClientProps {
  initialDefinitions: DocumentDefinition[];
  positions: (Position & { area?: { name: string } })[];
}

export default function DocumentsClient({ initialDefinitions, positions }: DocumentsClientProps) {
  const [definitions, setDefinitions] = useState<DocumentDefinition[]>(initialDefinitions);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDefinition, setEditingDefinition] = useState<Partial<DocumentDefinition> | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpenAdd = () => {
    setEditingDefinition({
      name: '',
      description: '',
      is_mandatory: true,
      requires_expiration: false,
      applicable_positions: [],
      depends_on_definition_id: null,
      cycle_months: 6,
      anchor_days_offset: 30,
      is_active: true
    });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (def: DocumentDefinition) => {
    setEditingDefinition({
      ...def,
      applicable_positions: def.applicable_positions || [],
      depends_on_definition_id: def.depends_on_definition_id || null,
      cycle_months: def.cycle_months || 6,
      anchor_days_offset: def.anchor_days_offset || 30
    });
    setIsDialogOpen(true);
  };

  const togglePosition = (posId: string) => {
    setEditingDefinition(prev => {
      const current = prev?.applicable_positions || [];
      const next = current.includes(posId)
        ? current.filter(id => id !== posId)
        : [...current, posId];
      return { ...prev, applicable_positions: next };
    });
  };

  // When a dependency is chosen, auto-restrict positions to those of the parent document
  const handleDependencyChange = (val: string | null) => {
    const newDepId = !val || val === 'none' ? null : val;
    if (newDepId) {
      const parentDef = definitions.find(d => d.id === newDepId);
      // If parent has explicit positions, inherit them; otherwise use all
      const inheritedPositions =
        parentDef?.applicable_positions && parentDef.applicable_positions.length > 0
          ? parentDef.applicable_positions
          : positions.map(p => p.id);
      setEditingDefinition(prev => ({
        ...prev,
        depends_on_definition_id: newDepId,
        applicable_positions: inheritedPositions,
      }));
    } else {
      setEditingDefinition(prev => ({ ...prev, depends_on_definition_id: null }));
    }
  };

  const handleSave = async () => {
    if (!editingDefinition?.name) {
      toast.error('El nombre es obligatorio');
      return;
    }

    setLoading(true);
    try {
      const res = await saveDocumentDefinition(editingDefinition);
      if (res.success) {
        toast.success(editingDefinition.id ? 'Definición actualizada' : 'Documento requerido creado');
        setIsDialogOpen(false);
        window.location.reload(); 
      } else {
        toast.error(res.error || 'Error al guardar');
      }
    } catch (error: any) {
      console.error('[handleSave] catch:', error);
      toast.error('Error inesperado: ' + (error?.message || 'Error de conexión'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este requerimiento?')) return;
    
    setLoading(true);
    try {
      const res = await deleteDocumentDefinition(id);
      if (res.success) {
        toast.success('Documento eliminado');
        window.location.reload();
      } else {
        toast.error(res.error || 'Error al eliminar');
      }
    } catch (error: any) {
      console.error('[handleDelete] catch:', error);
      toast.error('Error inesperado: ' + (error?.message || 'Error de conexión'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documentos Requeridos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configura los documentos que los empleados deben subir a su perfil.
          </p>
        </div>
        <Button onClick={handleOpenAdd} className="bg-orange-600 hover:bg-orange-700 text-white gap-2 rounded-xl h-11 px-6 shadow-lg shadow-orange-200 transition-all active:scale-95">
          <Plus className="h-4 w-4" />
          Nuevo Documento
        </Button>
      </div>

      <div className="grid gap-4">
        {definitions.length === 0 ? (
          <Card className="border-dashed border-2 bg-slate-50/50">
            <CardContent className="p-12 text-center flex flex-col items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                <FileText className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="font-bold text-slate-600">No hay documentos definidos</p>
                <p className="text-sm text-slate-400">Crea el primer requerimiento para tus empleados</p>
              </div>
              <Button onClick={handleOpenAdd} variant="outline" className="mt-2 rounded-xl">
                Empezar ahora
              </Button>
            </CardContent>
          </Card>
        ) : (
          definitions.map((def) => (
            <Card key={def.id} className="border-slate-200/60 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group">
              <CardContent className="p-0">
                <div className="flex items-center gap-4 p-5">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${def.is_mandatory ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}>
                    <FileText className="h-6 w-6" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-bold text-slate-900 truncate">{def.name}</p>
                      {def.is_mandatory && (
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-[10px] font-bold uppercase py-0">Obligatorio</Badge>
                      )}
                      {!def.is_active && (
                        <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 text-[10px] font-bold uppercase py-0">Inactivo</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {def.applicable_positions?.length > 0 ? (
                        def.applicable_positions.map(posId => {
                          const pos = positions.find(p => p.id === posId);
                          return (
                            <span key={posId} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                              {pos?.name || 'Cargo desconocido'}
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">Aplica para todos los cargos</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-6 px-4 border-l border-slate-100">
                    <div className="flex flex-col items-center gap-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Expiración</p>
                      {def.requires_expiration ? (
                        <Clock className="h-4 w-4 text-indigo-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-slate-300" />
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity pr-2">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(def)} className="h-9 w-9 rounded-lg hover:bg-orange-50 hover:text-orange-600">
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(def.id)} className="h-9 w-9 rounded-lg hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="bg-slate-900 text-white p-6">
            <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              <FileText className="h-5 w-5 text-orange-400" />
              {editingDefinition?.id ? 'Editar Documento' : 'Nuevo Documento'}
            </DialogTitle>
            <DialogDescription className="text-slate-400 font-medium">
              Define las reglas y cargos que requieren este documento.
            </DialogDescription>
          </DialogHeader>
          
          <div className="p-6 space-y-6 bg-white overflow-y-auto max-h-[60vh]">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="name" className="text-xs font-bold uppercase text-slate-400 ml-1">Nombre del Documento</Label>
                <Input 
                  id="name" 
                  placeholder="ej: Cédula de Identidad" 
                  value={editingDefinition?.name || ''}
                  onChange={(e) => setEditingDefinition(prev => ({ ...prev, name: e.target.value }))}
                  className="h-11 rounded-xl bg-slate-50 border-slate-200 focus:ring-orange-500"
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="description" className="text-xs font-bold uppercase text-slate-400 ml-1">Descripción (Opcional)</Label>
                <Input 
                  id="description" 
                  placeholder="Instrucciones para el empleado..." 
                  value={editingDefinition?.description || ''}
                  onChange={(e) => setEditingDefinition(prev => ({ ...prev, description: e.target.value }))}
                  className="h-11 rounded-xl bg-slate-50 border-slate-200 focus:ring-orange-500"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-slate-900">¿Es Obligatorio?</p>
                </div>
                <Switch 
                  checked={editingDefinition?.is_mandatory || false}
                  onCheckedChange={(val) => setEditingDefinition(prev => ({ ...prev, is_mandatory: val }))}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-slate-900">¿Vencimiento?</p>
                </div>
                <Switch 
                  checked={editingDefinition?.requires_expiration || false}
                  onCheckedChange={(val) => setEditingDefinition(prev => ({ ...prev, requires_expiration: val }))}
                />
              </div>

              {editingDefinition?.requires_expiration && (
                <div className="col-span-2 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 space-y-4">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-indigo-600" />
                    <p className="text-sm font-bold text-indigo-900">Configuración de Vencimiento Dinámico</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase text-indigo-400">Depende de (Documento Base)</Label>
                    <Select 
                      value={editingDefinition?.depends_on_definition_id || 'none'} 
                      onValueChange={handleDependencyChange}
                    >
                      <SelectTrigger className="h-10 rounded-xl bg-white border-indigo-100 focus:ring-indigo-500">
                        <span className="truncate text-sm">
                          {editingDefinition?.depends_on_definition_id
                            ? (definitions.find(d => d.id === editingDefinition.depends_on_definition_id)?.name ?? 'Selecciona un documento...')
                            : 'Sin dependencia (Fecha fija)'}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin dependencia (Fecha fija)</SelectItem>
                        {definitions
                          .filter(d => d.id !== editingDefinition?.id)
                          .map(d => (
                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                  </div>

                  {editingDefinition?.depends_on_definition_id && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase text-indigo-400">Ciclo de Renovación</Label>
                        <div className="relative">
                          <Input 
                            type="number"
                            value={editingDefinition?.cycle_months || ''}
                            onChange={(e) => setEditingDefinition(prev => ({ ...prev, cycle_months: parseInt(e.target.value) }))}
                            className="h-10 rounded-xl bg-white border-indigo-100 pr-12"
                          />
                          <span className="absolute right-3 top-2.5 text-xs font-bold text-indigo-300">Meses</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase text-indigo-400">Margen de Alerta</Label>
                        <div className="relative">
                          <Input 
                            type="number"
                            value={editingDefinition?.anchor_days_offset || ''}
                            onChange={(e) => setEditingDefinition(prev => ({ ...prev, anchor_days_offset: parseInt(e.target.value) }))}
                            className="h-10 rounded-xl bg-white border-indigo-100 pr-12"
                          />
                          <span className="absolute right-3 top-2.5 text-xs font-bold text-indigo-300">Días</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3">
              {/* Compute which positions are allowed based on dependency */
              (() => {
                const parentDef = editingDefinition?.depends_on_definition_id
                  ? definitions.find(d => d.id === editingDefinition.depends_on_definition_id)
                  : null;
                const allowedIds: string[] = parentDef
                  ? (parentDef.applicable_positions?.length > 0
                      ? parentDef.applicable_positions
                      : positions.map(p => p.id))
                  : positions.map(p => p.id);
                const hasDependency = !!parentDef;
                const availablePositions = positions.filter(p => allowedIds.includes(p.id));
                const disabledPositions = positions.filter(p => !allowedIds.includes(p.id));

                return (
                  <>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold uppercase text-slate-400 ml-1">Aplicable a Cargos:</Label>
                      <Badge variant="secondary" className="text-[10px] uppercase font-bold">
                        {editingDefinition?.applicable_positions?.length || 0} seleccionados
                      </Badge>
                    </div>

                    {hasDependency && (
                      <div className="flex items-start gap-2 p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-700">
                        <span className="text-base leading-none mt-0.5">🔗</span>
                        <span>
                          Los cargos se heredan de <strong>{parentDef!.name}</strong>.
                          {disabledPositions.length > 0 && <> {disabledPositions.length} cargo(s) no aplican.</>}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center space-x-3 p-3 bg-slate-100/50 rounded-xl border border-slate-200/50">
                      <Checkbox
                        id="select-all"
                        checked={availablePositions.length > 0 && availablePositions.every(p => editingDefinition?.applicable_positions?.includes(p.id))}
                        onCheckedChange={(checked: boolean) => {
                          setEditingDefinition(prev => ({
                            ...prev,
                            applicable_positions: checked ? allowedIds : []
                          }));
                        }}
                      />
                      <label htmlFor="select-all" className="text-sm font-bold text-slate-700 cursor-pointer flex-1">
                        Seleccionar Todos
                        {hasDependency && <span className="text-[10px] font-normal text-indigo-500 ml-1">(solo disponibles)</span>}
                      </label>
                    </div>

                    {!hasDependency && (
                      <p className="text-[10px] text-slate-400 italic px-1">Si no seleccionas ninguno, aplicará a todos los cargos por defecto.</p>
                    )}

                    <ScrollArea className="h-48 rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                      <div className="space-y-2">
                        {positions.map((pos) => {
                          const isAllowed = allowedIds.includes(pos.id);
                          const isChecked = editingDefinition?.applicable_positions?.includes(pos.id);
                          return (
                            <div
                              key={pos.id}
                              className={`flex items-center space-x-3 p-2 rounded-lg transition-colors border ${
                                !isAllowed
                                  ? 'opacity-35 cursor-not-allowed bg-slate-100/50 border-transparent'
                                  : 'hover:bg-white hover:border-slate-100 border-transparent'
                              }`}
                            >
                              <Checkbox
                                id={`pos-${pos.id}`}
                                checked={isChecked}
                                disabled={!isAllowed}
                                onCheckedChange={() => isAllowed && togglePosition(pos.id)}
                              />
                              <label
                                htmlFor={`pos-${pos.id}`}
                                className={`text-sm font-medium leading-none flex-1 ${
                                  isAllowed ? 'cursor-pointer' : 'cursor-not-allowed text-slate-400'
                                }`}
                              >
                                {pos.name}
                                <span className="text-[10px] text-slate-400 ml-2 block">{pos.area?.name}</span>
                              </label>
                              {!isAllowed && (
                                <span className="text-[9px] text-slate-400 italic shrink-0">No aplica</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </>
                );
              })()
              }
            </div>
          </div>

          <DialogFooter className="p-6 bg-slate-50 border-t border-slate-100">
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)} disabled={loading} className="rounded-xl font-bold uppercase text-xs tracking-widest">
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={loading} className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-8 font-bold uppercase text-xs tracking-widest shadow-lg shadow-slate-200">
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
