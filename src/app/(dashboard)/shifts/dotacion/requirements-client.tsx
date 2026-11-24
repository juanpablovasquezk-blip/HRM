'use client';

import { useState, useTransition, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { createTemplate, deleteTemplate, materializeTemplates, deleteRequirement, updateTemplate, saveWeeklyMatrixChanges, previewAffectedGeneratedRequirements, applyRuleChangesToGeneratedRequirements, previewGenerateMonth, previewDeleteOrdinaryRequirementsByRange, deleteOrdinaryRequirementsByRange, type WeeklyMatrixRowChange, type AffectedGeneratedRequirementItem } from '@/app/(dashboard)/shifts/actions';
import { getInitialApprovedTrucksByWeekday, type BlueExpressNightProposal } from '@/lib/scheduler/v2/blue-express';
import type { GenerateMonthHolidayPreview } from '@/lib/scheduler/v2/chile-holidays';
import type { OrdinaryRequirementRangeDeletePreview } from './range-delete-utils';
import type { PriorityQuotaItem, TemplatePriorityQuotaRow } from './matrix-utils';
import { Layers, Plus, Trash2, Calendar, MapPin, Briefcase, Clock, Loader2, RefreshCw, Shield, ChevronDown, Edit2, X, TableProperties, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { WeeklyMatrixView } from './weekly-matrix-view';

interface ReqClientProps {
  initialReqs: any[];
  templates: any[];
  templateQuotas?: TemplatePriorityQuotaRow[];
  areas: any[];
  shifts: any[];
  positions?: any[];
  companyId: string;
  canEdit?: boolean;
}

const DAY_NAMES: Record<number, string> = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' };
const DAY_LABELS_SHORT: Record<number, string> = { 0: 'D', 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S' };

function formatQuotasSummary(quotas: PriorityQuotaItem[], fallbackCount: number): string {
  if (!quotas || quotas.length === 0) return `${fallbackCount}`;
  return quotas
    .map((q) => {
      const label = q.priority === 'CRITICAL' ? 'Crít' : q.priority === 'HIGH' ? 'Alt' : q.priority === 'NORMAL' ? 'Norm' : 'Baj';
      return `${q.required_count} ${label}`;
    })
    .join(' + ');
}

export function RequirementsClient({ initialReqs, templates, templateQuotas = [], areas, shifts, positions = [], companyId, canEdit = false }: ReqClientProps) {
  const [isPending, startTransition] = useTransition();
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [showGenerate, setShowGenerate] = useState(false);
  const [blueProposal, setBlueProposal] = useState<BlueExpressNightProposal | null>(null);
  const [holidayPreview, setHolidayPreview] = useState<GenerateMonthHolidayPreview | null>(null);
  const [blueApprovedByWeekday, setBlueApprovedByWeekday] = useState<Record<number, number>>({});
  const [blueStart, setBlueStart] = useState('2026-12-07');
  const [blueEnd, setBlueEnd] = useState('2027-01-03');

  const initBlueApproved = (proposal: BlueExpressNightProposal) => {
    setBlueApprovedByWeekday(getInitialApprovedTrucksByWeekday(proposal));
  };

  const loadBlueProposalForRange = (startDate: string, endDate: string) => {
    startTransition(async () => {
      const res = await previewGenerateMonth(startDate, endDate);
      setHolidayPreview(res.holidayPreview);
      if (!res.success || !res.blueProposal) {
        setBlueProposal(null);
        toast.error('No se pudo calcular la propuesta Blue Express AM 00', {
          description: res.error || 'Error desconocido',
        });
        return;
      }
      setBlueProposal(res.blueProposal);
      initBlueApproved(res.blueProposal);
    });
  };
  const [showRangeDelete, setShowRangeDelete] = useState(false);
  const [delStart, setDelStart] = useState('2026-12-07');
  const [delEnd, setDelEnd] = useState('2027-01-03');
  const [delAreaId, setDelAreaId] = useState('all');
  const [delPositionId, setDelPositionId] = useState('all');
  const [delShiftId, setDelShiftId] = useState('all');
  const [delPreview, setDelPreview] = useState<OrdinaryRequirementRangeDeletePreview | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAreaId, setFilterAreaId] = useState('all');
  const [filterPositionId, setFilterPositionId] = useState('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'matrix' | 'cards'>('matrix');
  const [affectedReqs, setAffectedReqs] = useState<AffectedGeneratedRequirementItem[]>([]);
  const [selectedAffectedIds, setSelectedAffectedIds] = useState<Set<string>>(new Set());
  const [isSyncingAffected, setIsSyncingAffected] = useState(false);
  
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
        // Paso 1: Si aún no hay vista previa calculada para este rango, calcular feriados + Blue Express antes de guardar
        if (
          !holidayPreview ||
          holidayPreview.start_date !== startDate ||
          holidayPreview.end_date !== endDate ||
          !blueProposal ||
          blueProposal.target_start_date !== startDate ||
          blueProposal.target_end_date !== endDate
        ) {
          const previewRes = await previewGenerateMonth(startDate, endDate);
          setHolidayPreview(previewRes.holidayPreview);
          if (!previewRes.success || !previewRes.blueProposal) {
            setBlueProposal(null);
            toast.error('No se pudo calcular la propuesta Blue Express AM 00', {
              description: previewRes.error || 'Error desconocido',
            });
            return;
          }
          setBlueProposal(previewRes.blueProposal);
          initBlueApproved(previewRes.blueProposal);
          return;
        }

        if (holidayPreview.has_unverified_years) {
          toast.error('Cobertura de feriados incompleta', {
            description:
              holidayPreview.warnings.join(' ') ||
              'No se puede guardar porque hay años sin calendario verificado de feriados.',
          });
          return;
        }

        // Paso 2: Confirmar y guardar Matriz Semanal + Blue Express AM 00 con cantidades en pantalla
        const result = (await materializeTemplates(startDate, endDate, {
          blueExpressApprovedByWeekday: blueApprovedByWeekday,
        })) as any;
        if (result.error) {
          toast.error('Error', { description: result.error });
        } else {
          const created = result.createdCount ?? result.count ?? 0;
          const skipped = result.skippedCount ?? 0;
          const blueSaved = result.blueExpressUpsertedCount ?? 0;

          if (created === 0 && skipped > 0 && blueSaved === 0) {
            toast.info('El período ya estaba generado', {
              description: `No se crearon nuevas necesidades (${skipped} existentes se mantuvieron intactas).`,
            });
          } else {
            toast.success(`${created} necesidades de Matriz Semanal y ${blueSaved} cupos Blue Express AM 00 guardados`, {
              description:
                skipped > 0
                  ? `${skipped} necesidades ya existentes de la Matriz Semanal fueron omitidas sin cambios.`
                  : undefined,
            });
          }
          if (Array.isArray(result.holidayWarnings) && result.holidayWarnings.length > 0) {
            toast.warning('Aviso de calendario de feriados', {
              description: result.holidayWarnings.join(' '),
            });
          }
          setBlueProposal(null);
          setHolidayPreview(null);
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

    const preview = await previewAffectedGeneratedRequirements(
      changes.map((c) => ({
        area_id: c.area_id,
        position_id: c.position_id,
        shift_id: c.shift_id,
      }))
    );
    if (preview.success && preview.affected.length > 0) {
      setAffectedReqs(preview.affected);
      setSelectedAffectedIds(new Set(preview.affected.map((a) => a.id)));
    }

    router.refresh();
    return { success: true, error: null };
  };

  const handleReviewGenerated = async (
    rowKeys: Array<{ area_id: string; position_id: string; shift_id: string }>
  ) => {
    const preview = await previewAffectedGeneratedRequirements(rowKeys);
    if (!preview.success) {
      toast.error('Error al revisar requerimientos', { description: preview.error || 'No se pudo consultar.' });
      return;
    }
    if (preview.affected.length === 0) {
      toast.info('Sin diferencias pendientes', {
        description: 'Los requerimientos ya generados coinciden con la Matriz Semanal actual.',
      });
      return;
    }
    setAffectedReqs(preview.affected);
    setSelectedAffectedIds(new Set(preview.affected.map((a) => a.id)));
  };

  const handleApplyAffectedSync = async () => {
    const ids = Array.from(selectedAffectedIds);
    if (ids.length === 0) {
      setAffectedReqs([]);
      return;
    }
    setIsSyncingAffected(true);
    try {
      const res = await applyRuleChangesToGeneratedRequirements(ids);
      if (res.error) {
        toast.error('Error al actualizar requerimientos generados', { description: res.error });
      } else {
        toast.success('Requerimientos fechados actualizados', {
          description: `Se actualizaron ${res.updatedCount} requerimiento(s) existente(s).`,
        });
        setAffectedReqs([]);
        router.refresh();
      }
    } finally {
      setIsSyncingAffected(false);
    }
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
            templateQuotas={templateQuotas}
            areas={areas}
            shifts={shifts}
            onSaveChanges={canEdit ? handleSaveMatrixChanges : undefined}
            onReviewGenerated={canEdit ? handleReviewGenerated : undefined}
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
              <form action={handleMaterialize} className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Desde</Label>
                  <Input
                    name="gen_start"
                    type="date"
                    required
                    className="h-9 w-36"
                    value={blueStart}
                    onChange={(e) => {
                      setBlueStart(e.target.value);
                      setBlueProposal(null);
                      setHolidayPreview(null);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Hasta</Label>
                  <Input
                    name="gen_end"
                    type="date"
                    required
                    className="h-9 w-36"
                    value={blueEnd}
                    onChange={(e) => {
                      setBlueEnd(e.target.value);
                      setBlueProposal(null);
                      setHolidayPreview(null);
                    }}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={
                    isPending ||
                    Boolean(
                      holidayPreview &&
                        holidayPreview.start_date === blueStart &&
                        holidayPreview.end_date === blueEnd &&
                        holidayPreview.has_unverified_years
                    )
                  }
                  className="bg-emerald-600 hover:bg-emerald-700 text-white h-9"
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : blueProposal && blueProposal.target_start_date === blueStart && blueProposal.target_end_date === blueEnd ? (
                    'Confirmar y Generar Mes'
                  ) : (
                    'Calcular Propuesta'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9"
                  onClick={() => {
                    setShowGenerate(false);
                    setBlueProposal(null);
                    setHolidayPreview(null);
                  }}
                >
                  Cancelar
                </Button>
              </form>
            ) : (
              <Button
                onClick={() => {
                  setShowGenerate(true);
                  loadBlueProposalForRange(blueStart, blueEnd);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={templates.length === 0}
              >
                <Calendar className="h-4 w-4 mr-2" /> Generar Mes
              </Button>
            )}
          </div>

          {showGenerate && holidayPreview && (
            <div className="mt-4 pt-4 border-t space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-semibold text-sm">
                  Feriados legales nacionales de Chile en el rango ({holidayPreview.start_date} al {holidayPreview.end_date})
                </h4>
                <span className="text-xs text-muted-foreground">
                  Dotación cero en feriados: Atrex — Operador de grúa · Base — Operador de grúa · Base — Supervisor
                </span>
              </div>

              {holidayPreview.has_unverified_years && (
                <div className="rounded-md bg-red-50 border border-red-300 px-3 py-2 text-xs text-red-900 font-medium">
                  {holidayPreview.warnings.join(' ')} El guardado queda bloqueado hasta contar con calendario verificado para no tratar esas fechas como días normales.
                </div>
              )}

              {holidayPreview.holidays.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {holidayPreview.holidays.map((h) => (
                    <div
                      key={h.date}
                      className="rounded-md border bg-slate-50 px-2.5 py-1 text-xs flex items-center gap-1.5"
                    >
                      <span className="font-mono font-semibold">{h.date}</span>
                      <span>{h.name}</span>
                      {h.irrenunciable && (
                        <Badge variant="outline" className="text-[10px] py-0 border-amber-400 text-amber-800">
                          Irrenunciable
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                !holidayPreview.has_unverified_years && (
                  <p className="text-xs text-muted-foreground">No hay feriados nacionales de Chile en este rango.</p>
                )
              )}

              {holidayPreview.existing_zero_staffing_to_fix.length > 0 && (
                <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 space-y-1">
                  <div className="font-semibold">
                    Cupos ordinarios existentes en feriado que se limpiarán al confirmar ({holidayPreview.existing_zero_staffing_to_fix.length}):
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {holidayPreview.existing_zero_staffing_to_fix.map((item) => (
                      <li key={item.id}>
                        <span className="font-mono">{item.date}</span> · {item.area_name} — {item.position_name} ({item.shift_name}, cupos actuales: {item.required_count})
                      </li>
                    ))}
                  </ul>
                  <div className="text-[11px] text-amber-800">
                    Se conservan Blue Express, los demás cargos, los extras manuales y las asignaciones del roster.
                  </div>
                </div>
              )}
            </div>
          )}

          {showGenerate && blueProposal && (
            <div className="mt-4 pt-4 border-t space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-semibold text-sm">
                    ROSTER-09 · Propuesta Nocturna {blueProposal.identifiers.areaName} ({blueProposal.identifiers.shiftName}) antes de guardar
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Rango objetivo: {blueProposal.target_start_date} al {blueProposal.target_end_date} · Historial evaluado (noches transcurridas): {blueProposal.history_start_date} al {blueProposal.history_end_date}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => loadBlueProposalForRange(blueStart, blueEnd)}
                >
                  Recalcular
                </Button>
              </div>

              {blueProposal.estimate_notice && (
                <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                  {blueProposal.estimate_notice}
                </div>
              )}

              {blueProposal.weekdays.some((w) => (blueApprovedByWeekday[w.isoWeekday] ?? w.recommended_trucks) !== w.recommended_trucks) && (
                <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-900">
                  Ajuste aprobado antes de guardar:{' '}
                  {blueProposal.weekdays
                    .filter((w) => (blueApprovedByWeekday[w.isoWeekday] ?? w.recommended_trucks) !== w.recommended_trucks)
                    .map((w) => `${w.label} ${w.recommended_trucks} → ${blueApprovedByWeekday[w.isoWeekday]}`)
                    .join(', ')}{' '}
                  · Total pauta aprobada:{' '}
                  {(() => {
                    const start = new Date(`${blueProposal.target_start_date}T00:00:00Z`);
                    const end = new Date(`${blueProposal.target_end_date}T00:00:00Z`);
                    let sum = 0;
                    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
                      const iso = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
                      const wObj = blueProposal.weekdays.find((x) => x.isoWeekday === iso);
                      sum += blueApprovedByWeekday[iso] ?? wObj?.recommended_trucks ?? 1;
                    }
                    return `${sum} cupos de Conductor y ${sum} de Ayudante`;
                  })()}.
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
                      <th className="p-2">Sugerido</th>
                      <th className="p-2">Aprobado (1–3)</th>
                      <th className="p-2">Cupos a guardar (Cond. / Ayud.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blueProposal.weekdays.map((w) => {
                      const approved = blueApprovedByWeekday[w.isoWeekday] ?? w.recommended_trucks;
                      return (
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
                          <td className="p-2">{w.recommended_trucks}</td>
                          <td className="p-2">
                            <select
                              aria-label={`Camiones aprobados ${w.label}`}
                              className="h-7 rounded border bg-background px-1.5 text-xs font-semibold"
                              value={approved}
                              onChange={(e) =>
                                setBlueApprovedByWeekday((prev) => ({
                                  ...prev,
                                  [w.isoWeekday]: Number(e.target.value),
                                }))
                              }
                            >
                              <option value={1}>1</option>
                              <option value={2}>2</option>
                              <option value={3}>3</option>
                            </select>
                          </td>
                          <td className="p-2 font-semibold">
                            {approved} / {approved}
                          </td>
                        </tr>
                      );
                    })}
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
      {canEdit && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-sm">Requerimientos Generados</h3>
                <p className="text-xs text-muted-foreground">
                  Elimina en una sola operación únicamente los requerimientos ordinarios fechados por rango y filtros.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-red-700 border-red-200 hover:bg-red-50"
                onClick={() => {
                  setShowRangeDelete((v) => !v);
                  setDelPreview(null);
                }}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Eliminar necesidades por rango
              </Button>
            </div>

            {showRangeDelete && (
              <div className="pt-3 border-t space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Desde (inclusivo)</Label>
                    <Input
                      type="date"
                      value={delStart}
                      onChange={(e) => {
                        setDelStart(e.target.value);
                        setDelPreview(null);
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Hasta (inclusivo)</Label>
                    <Input
                      type="date"
                      value={delEnd}
                      onChange={(e) => {
                        setDelEnd(e.target.value);
                        setDelPreview(null);
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Área</Label>
                    <select
                      className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                      value={delAreaId}
                      onChange={(e) => {
                        setDelAreaId(e.target.value);
                        setDelPreview(null);
                      }}
                    >
                      <option value="all">Todas las áreas</option>
                      {areas.map((a: any) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Cargo</Label>
                    <select
                      className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                      value={delPositionId}
                      onChange={(e) => {
                        setDelPositionId(e.target.value);
                        setDelPreview(null);
                      }}
                    >
                      <option value="all">Todos los cargos</option>
                      {positions.map((p: any) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Turno</Label>
                    <select
                      className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                      value={delShiftId}
                      onChange={(e) => {
                        setDelShiftId(e.target.value);
                        setDelPreview(null);
                      }}
                    >
                      <option value="all">Todos los turnos</option>
                      {shifts.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={isPending}
                    onClick={() => {
                      startTransition(async () => {
                        const res = await previewDeleteOrdinaryRequirementsByRange({
                          startDate: delStart,
                          endDate: delEnd,
                          areaId: delAreaId,
                          positionId: delPositionId,
                          shiftId: delShiftId,
                        });
                        if (!res.success || !res.preview) {
                          toast.error('No se pudo generar la vista previa', {
                            description: res.error || 'Error desconocido',
                          });
                          return;
                        }
                        setDelPreview(res.preview);
                      });
                    }}
                  >
                    {isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                    Vista previa
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowRangeDelete(false);
                      setDelPreview(null);
                    }}
                  >
                    Cancelar
                  </Button>
                </div>

                {delPreview && (
                  <div className="rounded-md border bg-muted/20 p-3 space-y-2.5">
                    {delPreview.allAreasSelected && (
                      <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs font-medium text-red-900">
                        Atención: seleccionaste TODAS las áreas. Verifica el desglose antes de confirmar la eliminación.
                      </div>
                    )}
                    <div className="text-xs font-medium">
                      Requerimientos ordinarios fechados afectados: <span className="font-bold">{delPreview.totalCount}</span> ({delPreview.startDate} al {delPreview.endDate})
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Se conservarán intactas las reglas de la Matriz Semanal, los requerimientos extra y todas las asignaciones del roster.
                    </p>

                    {delPreview.groups.length > 0 ? (
                      <div className="overflow-x-auto rounded border bg-background">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/50 text-left">
                            <tr>
                              <th className="p-2">Área</th>
                              <th className="p-2">Cargo</th>
                              <th className="p-2">Turno</th>
                              <th className="p-2">Rango afectado</th>
                              <th className="p-2 text-right">Registros</th>
                            </tr>
                          </thead>
                          <tbody>
                            {delPreview.groups.map((g) => (
                              <tr key={g.key} className="border-t">
                                <td className="p-2">{g.area_name}</td>
                                <td className="p-2">{g.position_name}</td>
                                <td className="p-2">{g.shift_name}</td>
                                <td className="p-2">{g.min_date} .. {g.max_date}</td>
                                <td className="p-2 text-right font-semibold">{g.count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        No hay requerimientos ordinarios fechados que coincidan con los filtros seleccionados.
                      </div>
                    )}

                    {delPreview.totalCount > 0 && (
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={isPending}
                          onClick={() => {
                            startTransition(async () => {
                              const res = await deleteOrdinaryRequirementsByRange({
                                startDate: delStart,
                                endDate: delEnd,
                                areaId: delAreaId,
                                positionId: delPositionId,
                                shiftId: delShiftId,
                              });
                              if (!res.success) {
                                toast.error('Error al eliminar necesidades', {
                                  description: res.error || 'Error desconocido',
                                });
                                return;
                              }
                              toast.success(`${res.deletedCount} requerimientos ordinarios eliminados`);
                              setDelPreview(null);
                              setShowRangeDelete(false);
                              router.refresh();
                            });
                          }}
                        >
                          {isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                          Confirmar y eliminar ({delPreview.totalCount})
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <GroupedRequirements reqs={initialReqs} onDelete={handleDeleteReq} isPending={isPending} />

      {affectedReqs.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-semibold">Requerimientos ya generados afectados</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Revisa los requerimientos fechados que cambiarían según la regla semanal actualizada antes de aplicar.
                  Blue Express AM 00, los cupos Extra y las asignaciones existentes se conservan intactos.
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setAffectedReqs([])} disabled={isSyncingAffected}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 px-5 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 text-xs">
              <span className="text-slate-500 font-medium">Selección rápida:</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => setSelectedAffectedIds(new Set(affectedReqs.map((a) => a.id)))}
              >
                Todos ({affectedReqs.length})
              </Button>
              {affectedReqs.some((a) => a.is_blue_am00) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px] border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                  onClick={() =>
                    setSelectedAffectedIds(
                      new Set(affectedReqs.filter((a) => a.is_blue_am00).map((a) => a.id))
                    )
                  }
                >
                  Solo Blue Express AM 00 ({affectedReqs.filter((a) => a.is_blue_am00).length})
                </Button>
              )}
              {affectedReqs.some((a) => a.position_name.toLowerCase().includes('dhl')) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px] border-orange-200 text-orange-700 hover:bg-orange-50"
                  onClick={() =>
                    setSelectedAffectedIds(
                      new Set(
                        affectedReqs
                          .filter((a) => a.position_name.toLowerCase().includes('dhl'))
                          .map((a) => a.id)
                      )
                    )
                  }
                >
                  Solo DHL ({affectedReqs.filter((a) => a.position_name.toLowerCase().includes('dhl')).length})
                </Button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto p-4">
              <table className="w-full text-xs">
                <thead className="text-[11px] uppercase text-slate-500 border-b">
                  <tr>
                    <th className="py-2 px-2 text-left">
                      <input
                        type="checkbox"
                        checked={selectedAffectedIds.size === affectedReqs.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedAffectedIds(new Set(affectedReqs.map((a) => a.id)));
                          } else {
                            setSelectedAffectedIds(new Set());
                          }
                        }}
                      />
                    </th>
                    <th className="py-2 px-2 text-left">Fecha</th>
                    <th className="py-2 px-2 text-left">Área / Cargo</th>
                    <th className="py-2 px-2 text-left">Turno</th>
                    <th className="py-2 px-2 text-left">Actual</th>
                    <th className="py-2 px-2 text-left">Nuevo (según regla)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {affectedReqs.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-2">
                        <input
                          type="checkbox"
                          checked={selectedAffectedIds.has(item.id)}
                          onChange={(e) => {
                            const next = new Set(selectedAffectedIds);
                            if (e.target.checked) next.add(item.id);
                            else next.delete(item.id);
                            setSelectedAffectedIds(next);
                          }}
                        />
                      </td>
                      <td className="py-2 px-2 font-mono">{item.date}</td>
                      <td className="py-2 px-2">
                        <span className="font-medium">{item.area_name}</span> · {item.position_name}
                      </td>
                      <td className="py-2 px-2">{item.shift_name}</td>
                      <td className="py-2 px-2 text-slate-600">
                        {formatQuotasSummary(item.current_quotas, item.current_count)}
                      </td>
                      <td className="py-2 px-2 font-semibold text-orange-700 dark:text-orange-300">
                        <div>{formatQuotasSummary(item.next_quotas, item.next_count)}</div>
                        {item.validation_error && (
                          <p className="text-[10px] text-red-600 font-medium mt-0.5">{item.validation_error}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {affectedReqs.some((a) => a.is_blue_am00) && (
              <div className="px-5 py-2 border-t border-indigo-100 bg-indigo-50/70 dark:bg-indigo-950/30 text-xs text-indigo-800 dark:text-indigo-200">
                Blue Express AM 00 (solo prioridad, cantidades intactas):{' '}
                <strong>
                  Conductor = {affectedReqs.filter((a) => a.is_blue_am00 && a.position_name.toLowerCase().includes('conductor')).reduce((s, a) => s + a.next_count, 0)}
                </strong>
                {' · '}
                <strong>
                  Ayudante = {affectedReqs.filter((a) => a.is_blue_am00 && a.position_name.toLowerCase().includes('ayudante')).reduce((s, a) => s + a.next_count, 0)}
                </strong>
              </div>
            )}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
              <Button variant="outline" size="sm" onClick={() => setAffectedReqs([])} disabled={isSyncingAffected}>
                Solo guardar regla semanal
              </Button>
              <Button
                size="sm"
                onClick={handleApplyAffectedSync}
                disabled={
                  isSyncingAffected ||
                  selectedAffectedIds.size === 0 ||
                  affectedReqs.some((a) => selectedAffectedIds.has(a.id) && Boolean(a.validation_error))
                }
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                {isSyncingAffected && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Aplicar cambios a {selectedAffectedIds.size} requerimiento(s)
              </Button>
            </div>
          </div>
        </div>
      )}
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
