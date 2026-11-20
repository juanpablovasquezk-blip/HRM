'use client';

import { useState, useTransition, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { createTemplate, deleteTemplate, materializeTemplates, deleteRequirement, updateTemplate, saveWeeklyMatrixChanges, previewBlueExpressNightStaffing, applyBlueExpressNightStaffingProposal, type WeeklyMatrixRowChange } from '@/app/(dashboard)/shifts/actions';
import type { BlueExpressNightProposal } from '@/lib/scheduler/v2/blue-express';
import { Layers, Plus, Trash2, Calendar, MapPin, Briefcase, Clock, Loader2, RefreshCw, Shield, ChevronDown, Edit2, X, TableProperties, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { WeeklyMatrixView } from './weekly-matrix-view';

interface ReqClientProps {
  initialReqs: any[];
  templates: any[];
  areas: any[];
  shifts: any[];
  companyId: string;
  canEdit?: boolean;
}

const DAY_NAMES: Record<number, string> = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' };
const DAY_LABELS_SHORT: Record<number, string> = { 0: 'D', 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S' };

export function RequirementsClient({ initialReqs, templates, areas, shifts, companyId, canEdit = false }: ReqClientProps) {
  const [isPending, startTransition] = useTransition();
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [showGenerate, setShowGenerate] = useState(false);
  const [blueProposal, setBlueProposal] = useState<BlueExpressNightProposal | null>(null);
  const [blueStart, setBlueStart] = useState('2026-12-07');
  const [blueEnd, setBlueEnd] = useState('2027-01-03');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAreaId, setFilterAreaId] = useState('all');
  const [filterPositionId, setFilterPositionId] = useState('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'matrix' | 'cards'>('matrix');
  
  // Form states
  const [areaId, setAreaId] = useState('');
  const [posId, setPosId] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [count, setCount] = useState('');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);

  const router = useRouter();

  const filteredTemplates = useMemo(() => {
    // Create lookup maps for performance
    const areaMap = new Map(areas.map(a => [a.id, a]));
    const shiftMap = new Map(shifts.map(s => [s.id, s]));
    const posMap = new Map();
    areas.forEach(a => {
      (a.positions || []).forEach((p: any) => posMap.set(p.id, p));
    });

    return templates.map(tmpl => {
      const area = areaMap.get(tmpl.area_id);
      const shift = shiftMap.get(tmpl.shift_id);
      const position = posMap.get(tmpl.position_id);
      
      return {
        ...tmpl,
        area: area || { name: 'Desconocido' },
        shift: shift || { name: 'Desconocido' },
        position: position || { name: 'Desconocido' }
      };
    }).filter(tmpl => {
      const areaName = (tmpl.area?.name || '').toLowerCase();
      const posName = (tmpl.position?.name || '').toLowerCase();
      const matchesSearch = areaName.includes(searchQuery.toLowerCase()) || posName.includes(searchQuery.toLowerCase());
      const matchesArea = filterAreaId === 'all' || tmpl.area_id === filterAreaId;
      const matchesPos = filterPositionId === 'all' || (tmpl.position as any)?.name === filterPositionId;
      return matchesSearch && matchesArea && matchesPos;
    });
  }, [templates, searchQuery, filterAreaId, filterPositionId, areas, shifts]);

  const selectedArea = areas.find((a) => a.id === areaId);
  const availablePositions = selectedArea?.positions || [];

  const handleCreateTemplate = (formData: FormData) => {
    formData.set('company_id', companyId);
    startTransition(async () => {
      let result;
      if (editingId) {
        result = await updateTemplate(editingId, formData);
      } else {
        result = await createTemplate(formData);
      }

      if (result.error) toast.error('Error', { description: result.error });
      else {
        toast.success(editingId ? 'Regla actualizada' : 'Regla de dotación creada');
        setEditingId(null);
        setAreaId('');
        setPosId('');
        setShiftId('');
        setCount('');
        setSelectedDays([1, 2, 3, 4, 5]);
        router.refresh();
      }
    });
  };

  const handleEditClick = (e: React.MouseEvent, tmpl: any) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('Editing template:', tmpl.id);
    
    setEditingId(tmpl.id);
    setAreaId(tmpl.area_id || '');
    setPosId(tmpl.position_id || '');
    setShiftId(tmpl.shift_id || '');
    setCount(tmpl.required_count?.toString() || '');
    setSelectedDays(tmpl.days_of_week || []);
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setEditingId(null);
    setAreaId('');
    setPosId('');
    setShiftId('');
    setCount('');
    setSelectedDays([1, 2, 3, 4, 5]);
  };

  const handleDeleteTemplate = (id: string) => {
    startTransition(async () => {
      const result = await deleteTemplate(id);
      if (result.error) toast.error('Error', { description: result.error });
      else { toast.success('Regla eliminada'); router.refresh(); }
    });
  };

  const isMaterializingRef = useRef(false);

  const handleMaterialize = (formData: FormData) => {
    if (isMaterializingRef.current || isPending) return;
    isMaterializingRef.current = true;

    const startDate = formData.get('gen_start') as string;
    const endDate = formData.get('gen_end') as string;
    startTransition(async () => {
      try {
        const result = await materializeTemplates(startDate, endDate) as any;
        if (result.error) {
          toast.error('Error', { description: result.error });
        } else {
          const created = result.createdCount ?? result.count ?? 0;
          const skipped = result.skippedCount ?? 0;

          if (created === 0 && skipped > 0) {
            toast.info('El período ya estaba generado', {
              description: `No se crearon nuevas necesidades (${skipped} existentes se mantuvieron intactas).`,
            });
          } else if (created > 0 && skipped > 0) {
            toast.success(`${created} necesidades faltantes creadas`, {
              description: `${skipped} necesidades ya existentes fueron omitidas sin cambios.`,
            });
          } else {
            toast.success(`${created} requerimientos generados exitosamente`);
          }
          if (Array.isArray(result.holidayWarnings) && result.holidayWarnings.length > 0) {
            toast.warning('Aviso de calendario de feriados', {
              description: result.holidayWarnings.join(' '),
            });
          }
          setShowGenerate(false);
          router.refresh();
        }
      } finally {
        isMaterializingRef.current = false;
      }
    });
  };

  const handleDeleteReq = (id: string) => {
    startTransition(async () => {
      const result = await deleteRequirement(id);
      if (result.error) toast.error('Error', { description: result.error });
      else { toast.success('Requerimiento eliminado'); router.refresh(); }
    });
  };

  const handleSaveMatrixChanges = async (changes: WeeklyMatrixRowChange[]) => {
    const res = await saveWeeklyMatrixChanges(changes);
    if (res.error) {
      toast.error('Error al guardar la matriz', { description: res.error });
      return { success: false, error: res.error };
    }
    toast.success('Reglas semanales actualizadas', {
      description: `Se guardaron ${res.updatedRows ?? changes.length} fila(s) en las reglas permanentes.`,
    });
    router.refresh();
    return { success: true, error: null };
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <a href="/shifts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-orange-600 transition-colors mb-2">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Volver a Turnos
        </a>
        <h1 className="text-2xl font-bold tracking-tight">Demanda y Dotación</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Define reglas permanentes de dotación y genera los requerimientos para cada mes.
        </p>
      </div>

      {/* ═══ SECTION 1: Templates ═══ */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-orange-500" />
            <h2 className="text-lg font-semibold">Reglas de Dotación Permanentes</h2>
          </div>

          <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900 p-1">
            <Button
              type="button"
              variant={viewMode === 'matrix' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('matrix')}
              className={`h-8 text-xs gap-1.5 ${viewMode === 'matrix' ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}
            >
              <TableProperties className="h-3.5 w-3.5" />
              Matriz Semanal
            </Button>
            <Button
              type="button"
              variant={viewMode === 'cards' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('cards')}
              className={`h-8 text-xs gap-1.5 ${viewMode === 'cards' ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Tarjetas
            </Button>
          </div>
        </div>

        {/* Create Template Form (only in Cards view; Matrix uses inline + Nueva regla) */}
        {viewMode === 'cards' && (
          <Card className="border-orange-200 dark:border-orange-900 shadow-sm border-t-4 border-t-orange-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <div className="flex items-center gap-2">
                {editingId ? <Edit2 className="h-4 w-4 text-blue-600" /> : <Plus className="h-4 w-4 text-orange-600" />}
                {editingId ? 'Editando Regla' : 'Nueva Regla'}
              </div>
              {editingId && (
                <Button variant="ghost" size="sm" onClick={resetForm} className="h-8 text-xs text-slate-500">
                  <X className="w-3 h-3 mr-1" /> Cancelar Edición
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form id="template-form" action={handleCreateTemplate} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="space-y-2">
                  <Label className="flex gap-1 items-center"><MapPin className="h-3 w-3"/>Área</Label>
                  <select name="area_id" required value={areaId} onChange={(e) => setAreaId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Seleccionar</option>
                    {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="flex gap-1 items-center"><Briefcase className="h-3 w-3"/>Cargo</Label>
                  <select name="position_id" required disabled={!areaId} value={posId} onChange={(e) => setPosId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50">
                    <option value="">Seleccionar</option>
                    {availablePositions.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="flex gap-1 items-center"><Clock className="h-3 w-3"/>Turno</Label>
                  <select name="shift_id" required value={shiftId} onChange={(e) => setShiftId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Seleccionar</option>
                    {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.duration_hours}h)</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Cant. Personas</Label>
                  <Input name="required_count" type="number" min="1" placeholder="Ej: 5" required className="font-bold" value={count} onChange={(e) => setCount(e.target.value)} />
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-6 items-end justify-between bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                <div className="space-y-3 flex-1">
                  <Label className="text-sm font-semibold">¿Qué días de la semana aplica?</Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'L', val: 1 }, { label: 'M', val: 2 }, { label: 'X', val: 3 },
                      { label: 'J', val: 4 }, { label: 'V', val: 5 }, { label: 'S', val: 6 }, { label: 'D', val: 0 }
                    ].map((day) => (
                      <label key={day.val} className="flex items-center gap-2 cursor-pointer bg-white dark:bg-slate-950 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-orange-500 transition-colors shadow-sm">
                        <input 
                          type="checkbox" 
                          name="days_of_week" 
                          value={day.val} 
                          checked={selectedDays.includes(day.val)} 
                          onChange={(e) => {
                            const val = day.val;
                            setSelectedDays(prev => 
                              e.target.checked ? [...prev, val] : prev.filter(d => d !== val)
                            );
                          }}
                          className="accent-orange-600 w-4 h-4" 
                        />
                        <span className="text-sm font-medium">{day.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <Button type="submit" disabled={isPending} className={`px-8 shadow-lg shadow-orange-500/25 ${editingId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gradient-to-r from-orange-500 to-orange-600 text-white'}`}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingId ? 'Actualizar Regla' : 'Guardar Regla')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        )}

        {/* Search and Filters for Templates */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
           <div className="flex-1 min-w-[200px] relative">
              <Plus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 rotate-45" />
              <Input 
                placeholder="Filtrar por nombre de cargo o área..." 
                className="pl-9 h-9" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
           </div>
           <select 
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-orange-500"
              value={filterAreaId}
              onChange={(e) => setFilterAreaId(e.target.value)}
           >
              <option key="all" value="all">Todas las áreas</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
           </select>
           <select 
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-orange-500"
              value={filterPositionId}
              onChange={(e) => setFilterPositionId(e.target.value)}
           >
              <option key="all" value="all">Todos los cargos</option>
              {Array.from(new Set(templates.map(t => (t.position as any)?.name)))
                .filter(Boolean)
                .sort()
                .map(name => (
                  <option key={String(name)} value={String(name)}>{String(name)}</option>
                ))}
           </select>
        </div>

        {/* Templates View: Weekly Matrix or Cards */}
        {viewMode === 'matrix' ? (
          <WeeklyMatrixView
            templates={filteredTemplates}
            allTemplates={templates}
            areas={areas}
            shifts={shifts}
            onSaveChanges={canEdit ? handleSaveMatrixChanges : undefined}
          />
        ) : filteredTemplates.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              <Shield className="h-8 w-8 mx-auto mb-3 opacity-40" />
              No se encontraron reglas con los filtros aplicados.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredTemplates.map((tmpl: any) => {
              const days: number[] = tmpl.days_of_week || [];
              const isEditingThis = editingId === tmpl.id;
              
              return (
                <Card key={tmpl.id} className={`transition-all duration-300 ${
                  isEditingThis 
                    ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-lg scale-[1.02] z-10' 
                    : 'border-slate-200/60 dark:border-slate-800 shadow-sm hover:shadow-md'
                }`}>
                  <CardContent className="p-4">
                      {/* ... rest of existing card content ... */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 shrink-0">
                          <MapPin className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm truncate">{tmpl.area?.name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap mt-0.5">
                            <Badge variant="outline" className="font-normal text-xs py-0">{tmpl.position?.name}</Badge>
                            <span className="text-slate-300">•</span>
                            <Badge variant="secondary" className="font-normal text-xs py-0">{tmpl.shift?.name}</Badge>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="text-right mr-1">
                          <div className="text-xl font-bold text-orange-600 dark:text-orange-400 leading-none">{tmpl.required_count}</div>
                          <div className="text-[9px] text-muted-foreground uppercase tracking-wider text-right">pers.</div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          type="button"
                          className={`h-8 w-8 ${isEditingThis ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:text-blue-600'}`} 
                          onClick={(e) => handleEditClick(e, tmpl)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600" onClick={() => handleDeleteTemplate(tmpl.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex gap-1 mt-3">
                      {[1, 2, 3, 4, 5, 6, 0].map(d => (
                        <span key={d} className={`text-[10px] font-bold w-6 h-6 flex items-center justify-center rounded-md ${
                          days.includes(d)
                            ? 'bg-orange-500 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600'
                        }`}>
                          {DAY_LABELS_SHORT[d]}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ SECTION 2: Generate / Materialize ═══ */}
      <Card className="border-emerald-200 dark:border-emerald-900 shadow-sm bg-gradient-to-br from-emerald-50/50 to-transparent dark:from-emerald-950/20">
        <CardContent className="p-5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                <RefreshCw className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Generar Planificación Mensual</h3>
                <p className="text-xs text-muted-foreground">Aplica las reglas permanentes a un rango de fechas para crear los requerimientos.</p>
              </div>
            </div>

            {showGenerate ? (
              <form action={handleMaterialize} className="flex items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Desde</Label>
                  <Input name="gen_start" type="date" required className="h-9 w-36"
                    defaultValue={new Date().toISOString().split('T')[0]} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Hasta</Label>
                  <Input name="gen_end" type="date" required className="h-9 w-36"
                    defaultValue={new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]} />
                </div>
                <Button type="submit" disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white h-9">
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generar'}
                </Button>
                <Button type="button" variant="ghost" className="h-9" onClick={() => setShowGenerate(false)}>Cancelar</Button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      const res = await previewBlueExpressNightStaffing(blueStart, blueEnd);
                      if (!res.success || !res.proposal) {
                        toast.error('No se pudo calcular la propuesta Blue Express', {
                          description: res.error || 'Error desconocido',
                        });
                        return;
                      }
                      setBlueProposal(res.proposal);
                    });
                  }}
                >
                  {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Clock className="h-4 w-4 mr-2" />}
                  Propuesta Blue Express AM 00 (Solo Lectura)
                </Button>
                <Button onClick={() => setShowGenerate(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={templates.length === 0}>
                  <Calendar className="h-4 w-4 mr-2" /> Generar Mes
                </Button>
              </div>
            )}
          </div>

          {blueProposal && (
            <div className="mt-4 pt-4 border-t space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-semibold text-sm">
                    ROSTER-09 · Propuesta Nocturna {blueProposal.identifiers.areaName} ({blueProposal.identifiers.shiftName}) — Solo Lectura
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Rango objetivo: {blueProposal.target_start_date} al {blueProposal.target_end_date} · Historial evaluado (noches transcurridas): {blueProposal.history_start_date} al {blueProposal.history_end_date}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Input type="date" value={blueStart} onChange={(e) => setBlueStart(e.target.value)} className="h-8 w-36 text-xs" />
                  <Input type="date" value={blueEnd} onChange={(e) => setBlueEnd(e.target.value)} className="h-8 w-36 text-xs" />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={isPending}
                    onClick={() => {
                      startTransition(async () => {
                        const res = await previewBlueExpressNightStaffing(blueStart, blueEnd);
                        if (res.success && res.proposal) setBlueProposal(res.proposal);
                      });
                    }}
                  >
                    Recalcular
                  </Button>
                  {canEdit && (
                    <Button
                      type="button"
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={isPending}
                      onClick={() => {
                        startTransition(async () => {
                          const res = await applyBlueExpressNightStaffingProposal(
                            blueProposal.target_start_date,
                            blueProposal.target_end_date
                          );
                          if (!res.success) {
                            toast.error('No se pudo aplicar la propuesta Blue Express AM 00', {
                              description: res.error || 'Error desconocido',
                            });
                            return;
                          }
                          toast.success('Dotación Blue Express AM 00 aplicada', {
                            description: `${res.upsertedCount} cupos ordinarios nocturnos actualizados/creados entre ${blueProposal.target_start_date} y ${blueProposal.target_end_date}.`,
                          });
                          if (res.proposal) setBlueProposal(res.proposal);
                          router.refresh();
                        });
                      }}
                    >
                      {isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                      Aplicar Propuesta (AM 00)
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="ghost" onClick={() => setBlueProposal(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {blueProposal.estimate_notice && (
                <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                  {blueProposal.estimate_notice}
                </div>
              )}

              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="p-2">Día</th>
                      <th className="p-2">Noches c/datos (sin datos / 0 conf.)</th>
                      <th className="p-2">Historial duplas</th>
                      <th className="p-2">Últimas 3</th>
                      <th className="p-2">Cancel. / Incomp. / Sin asist.</th>
                      <th className="p-2">Camiones propuestos</th>
                      <th className="p-2">Cupos (Cond. / Ayud.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blueProposal.weekdays.map((w) => (
                      <tr key={w.isoWeekday} className="border-t">
                        <td className="p-2 font-medium">{w.label}</td>
                        <td className="p-2">
                          {w.nights_with_data} ({w.nights_without_data} s/d · {w.nights_zero_confirmed} cero)
                        </td>
                        <td className="p-2">{w.history_duplas.join(', ') || '—'}</td>
                        <td className="p-2">{w.last_three_duplas.join(', ') || '—'}</td>
                        <td className="p-2">
                          {w.cancellations_total} / {w.incomplete_duplas_total} / {w.unconfirmed_attendance_total}
                        </td>
                        <td className="p-2 font-semibold">{w.recommended_trucks}</td>
                        <td className="p-2">
                          {w.proposed_conductores} / {w.proposed_ayudantes}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {blueProposal.target_range_already_generated ? (
                <div className="text-xs text-muted-foreground">
                  Requerimientos ordinarios ya generados en el rango: {blueProposal.target_range_updates.length} ajustes sugeridos en cupos nocturnos de Blue Express (sin guardar).
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Sin requerimientos ordinarios generados aún en el rango objetivo; si se confirma demanda adicional a las 14:00 para el día siguiente, se cubre mediante Dotación Extra habitual.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ SECTION 3: Generated Requirements (grouped) ═══ */}
      <GroupedRequirements reqs={initialReqs} onDelete={handleDeleteReq} isPending={isPending} />
    </div>
  );
}

// ─── Grouped Requirements View ────────────────────────────────────────────────

function GroupedRequirements({ reqs, onDelete, isPending }: { reqs: any[]; onDelete: (id: string) => void; isPending: boolean }) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  if (reqs.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          <Layers className="h-8 w-8 mx-auto mb-3 opacity-40" />
          No hay requerimientos generados aún. Define reglas arriba y presiona &quot;Generar Mes&quot;.
        </CardContent>
      </Card>
    );
  }

  const groups: Record<string, { key: string; area: string; position: string; shift: string; count: number; isExtra: boolean; items: any[] }> = {};
  for (const req of reqs) {
    const isExtra = Boolean(req.is_extra);
    const groupKey = `${req.area?.name}||${req.position?.name}||${req.shift?.name}||${req.required_count}||${isExtra ? 'extra' : 'base'}`;
    if (!groups[groupKey]) {
      groups[groupKey] = { key: groupKey, area: req.area?.name || '—', position: req.position?.name || '—', shift: req.shift?.name || '—', count: req.required_count, isExtra, items: [] };
    }
    groups[groupKey].items.push(req);
  }

  const groupList = Object.values(groups).sort((a, b) => Number(a.isExtra) - Number(b.isExtra));
  for (const g of groupList) g.items.sort((a: any, b: any) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Requerimientos Generados</h2>
        <Badge variant="secondary" className="text-xs">{reqs.length} registros en {groupList.length} grupo{groupList.length > 1 ? 's' : ''}</Badge>
      </div>

      {groupList.map((group) => {
        const isExpanded = expandedGroup === group.key;
        const firstDate = group.items[0]?.date;
        const lastDate = group.items[group.items.length - 1]?.date;
        const daysPresent = new Set(group.items.map((r: any) => new Date(r.date + 'T00:00:00').getDay()));
        const dayLabels = [1, 2, 3, 4, 5, 6, 0].filter(d => daysPresent.has(d)).map(d => DAY_NAMES[d]);

        return (
          <Card key={group.key} className={`shadow-sm hover:shadow-md transition-all overflow-hidden ${group.isExtra ? 'border-amber-300/80 dark:border-amber-800/80' : 'border-slate-200/60 dark:border-slate-800'}`}>
            <div className="p-4 cursor-pointer flex flex-col sm:flex-row sm:items-center gap-3 justify-between hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors"
              onClick={() => setExpandedGroup(isExpanded ? null : group.key)}>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${group.isExtra ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                  <Layers className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate flex items-center gap-2">
                    <span>{group.area}</span>
                    {group.isExtra && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-amber-50 text-amber-700 border-amber-300">
                        Extra
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap mt-0.5">
                    <Badge variant="outline" className="font-normal text-xs py-0">{group.position}</Badge>
                    <span className="text-slate-300">•</span>
                    <Badge variant="secondary" className="font-normal text-xs py-0">{group.shift}</Badge>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <div className="text-2xl font-bold text-orange-600 dark:text-orange-400 leading-none">{group.count}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">personas</div>
                </div>
                <div className="text-right hidden md:block">
                  <div className="text-xs font-medium">{dayLabels.join(', ')}</div>
                  <div className="text-[10px] text-muted-foreground">{fmtDate(firstDate)} → {fmtDate(lastDate)}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="secondary" className="text-xs tabular-nums">{group.items.length} fechas</Badge>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-muted-foreground font-medium">FECHAS PROGRAMADAS</span>
                  <Button variant="outline" size="sm" className="h-7 text-xs text-red-500 border-red-200 hover:bg-red-50 hover:text-red-700"
                    disabled={isPending}
                    onClick={(e) => { e.stopPropagation(); if (confirm(`¿Eliminar los ${group.items.length} requerimientos?`)) { for (const i of group.items) onDelete(i.id); } }}>
                    <Trash2 className="h-3 w-3 mr-1" /> Eliminar grupo
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.items.map((item: any) => {
                    const d = new Date(item.date + 'T00:00:00');
                    return (
                      <div key={item.id} className="group relative">
                        <Badge variant="outline" className="text-xs font-normal py-1 px-2.5 bg-white dark:bg-slate-900 hover:border-red-300 transition-colors">
                          <span className="font-semibold text-orange-600 dark:text-orange-400 mr-1">{DAY_NAMES[d.getDay()]}</span>
                          {d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                        </Badge>
                        <button className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-500 text-white items-center justify-center text-[9px] hidden group-hover:flex shadow-sm hover:bg-red-600"
                          onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}>×</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function fmtDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}
