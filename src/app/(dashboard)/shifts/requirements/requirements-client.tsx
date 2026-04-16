'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Layers, Plus, Trash2, Calendar, MapPin, Briefcase, Clock, Loader2, RefreshCw, Shield, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { createTemplate, deleteTemplate, materializeTemplates, deleteRequirement } from '@/app/(dashboard)/shifts/actions';

interface ReqClientProps {
  initialReqs: any[];
  templates: any[];
  areas: any[];
  shifts: any[];
  companyId: string;
}

const DAY_NAMES: Record<number, string> = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' };
const DAY_LABELS_SHORT: Record<number, string> = { 0: 'D', 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S' };

export function RequirementsClient({ initialReqs, templates, areas, shifts, companyId }: ReqClientProps) {
  const [isPending, startTransition] = useTransition();
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [showGenerate, setShowGenerate] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAreaId, setFilterAreaId] = useState('all');
  const [filterPositionId, setFilterPositionId] = useState('all');
  const router = useRouter();

  const selectedArea = areas.find((a) => a.id === selectedAreaId);
  const availablePositions = selectedArea?.positions || [];

  const handleCreateTemplate = (formData: FormData) => {
    formData.set('company_id', companyId);
    startTransition(async () => {
      const result = await createTemplate(formData);
      if (result.error) toast.error('Error', { description: result.error });
      else {
        toast.success('Regla de dotación creada');
        setSelectedAreaId('');
        const form = document.getElementById('template-form') as HTMLFormElement;
        if (form) form.reset();
        router.refresh();
      }
    });
  };

  const handleDeleteTemplate = (id: string) => {
    startTransition(async () => {
      const result = await deleteTemplate(id);
      if (result.error) toast.error('Error', { description: result.error });
      else { toast.success('Regla eliminada'); router.refresh(); }
    });
  };

  const handleMaterialize = (formData: FormData) => {
    const startDate = formData.get('gen_start') as string;
    const endDate = formData.get('gen_end') as string;
    startTransition(async () => {
      const result = await materializeTemplates(startDate, endDate);
      if (result.error) toast.error('Error', { description: result.error });
      else {
        toast.success(`${result.count} requerimientos generados exitosamente`);
        setShowGenerate(false);
        router.refresh();
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
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-orange-500" />
          <h2 className="text-lg font-semibold">Reglas de Dotación Permanentes</h2>
        </div>

        {/* Create Template Form */}
        <Card className="border-orange-200 dark:border-orange-900 shadow-sm border-t-4 border-t-orange-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4 text-orange-600" />
              Nueva Regla
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form id="template-form" action={handleCreateTemplate} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="space-y-2">
                  <Label className="flex gap-1 items-center"><MapPin className="h-3 w-3"/>Área</Label>
                  <select name="area_id" required value={selectedAreaId} onChange={(e) => setSelectedAreaId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Seleccionar</option>
                    {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="flex gap-1 items-center"><Briefcase className="h-3 w-3"/>Cargo</Label>
                  <select name="position_id" required disabled={!selectedAreaId}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50">
                    <option value="">Seleccionar</option>
                    {availablePositions.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="flex gap-1 items-center"><Clock className="h-3 w-3"/>Turno</Label>
                  <select name="shift_id" required
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Seleccionar</option>
                    {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.duration_hours}h)</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Cant. Personas</Label>
                  <Input name="required_count" type="number" min="1" placeholder="Ej: 5" required className="font-bold" />
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
                        <input type="checkbox" name="days_of_week" value={day.val} defaultChecked={day.val >= 1 && day.val <= 5} className="accent-orange-600 w-4 h-4" />
                        <span className="text-sm font-medium">{day.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <Button type="submit" disabled={isPending} className="bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25 px-8">
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar Regla'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

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
              <option value="all">Todas las áreas</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
           </select>
           <select 
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-orange-500"
              value={filterPositionId}
              onChange={(e) => setFilterPositionId(e.target.value)}
           >
              <option value="all">Todos los cargos</option>
              {Array.from(new Set(templates.map(t => (t.position as any)?.name))).sort().map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
           </select>
        </div>

        {/* Templates List */}
        {(() => {
          const filtered = templates.filter(tmpl => {
            const areaName = (tmpl.area?.name || '').toLowerCase();
            const posName = (tmpl.position?.name || '').toLowerCase();
            const matchesSearch = areaName.includes(searchQuery.toLowerCase()) || posName.includes(searchQuery.toLowerCase());
            const matchesArea = filterAreaId === 'all' || tmpl.area_id === filterAreaId;
            const matchesPos = filterPositionId === 'all' || (tmpl.position as any)?.name === filterPositionId;
            return matchesSearch && matchesArea && matchesPos;
          });

          if (filtered.length === 0) {
            return (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  <Shield className="h-8 w-8 mx-auto mb-3 opacity-40" />
                  No se encontraron reglas con los filtros aplicados.
                </CardContent>
              </Card>
            );
          }

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map((tmpl: any) => {
                const days: number[] = tmpl.days_of_week || [];
                return (
                  <Card key={tmpl.id} className="border-slate-200/60 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
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

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-xl font-bold text-orange-600 dark:text-orange-400 leading-none">{tmpl.required_count}</div>
                          <div className="text-[9px] text-muted-foreground uppercase tracking-wider">pers.</div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => handleDeleteTemplate(tmpl.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
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
              <Button onClick={() => setShowGenerate(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={templates.length === 0}>
                <Calendar className="h-4 w-4 mr-2" /> Generar Mes
              </Button>
            )}
          </div>
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

  const groups: Record<string, { key: string; area: string; position: string; shift: string; count: number; items: any[] }> = {};
  for (const req of reqs) {
    const groupKey = `${req.area?.name}||${req.position?.name}||${req.shift?.name}||${req.required_count}`;
    if (!groups[groupKey]) {
      groups[groupKey] = { key: groupKey, area: req.area?.name || '—', position: req.position?.name || '—', shift: req.shift?.name || '—', count: req.required_count, items: [] };
    }
    groups[groupKey].items.push(req);
  }

  const groupList = Object.values(groups);
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
          <Card key={group.key} className="border-slate-200/60 dark:border-slate-800 shadow-sm hover:shadow-md transition-all overflow-hidden">
            <div className="p-4 cursor-pointer flex flex-col sm:flex-row sm:items-center gap-3 justify-between hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors"
              onClick={() => setExpandedGroup(isExpanded ? null : group.key)}>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 shrink-0">
                  <Layers className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{group.area}</div>
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
