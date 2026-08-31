'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ShieldCheck,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronRight,
  X,
  FileText,
  Download,
  CheckSquare,
} from 'lucide-react';
import { MassRiohsModal } from './mass-riohs-modal';
import { RiohsDashboardWorker } from './actions';
import { MultiSelectFilter, FilterOption } from '@/components/ui/multi-select-filter';

interface PrevencionRiesgosClientProps {
  initialWorkers: RiohsDashboardWorker[];
  companies: { id: string; name: string; rut?: string }[];
  positions: { id: string; name: string }[];
  canExecute: boolean;
}

export function PrevencionRiesgosClient({
  initialWorkers,
  companies,
  positions,
  canExecute,
}: PrevencionRiesgosClientProps) {
  const [search, setSearch] = useState('');
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [selectedPositionNames, setSelectedPositionNames] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedSteps, setSelectedSteps] = useState<string[]>([]);

  // Selected workers state
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<Set<string>>(new Set());

  // Filter Options for MultiSelect
  const companyOptions: FilterOption[] = useMemo(() => {
    const counts = new Map<string, number>();
    initialWorkers.forEach((w) => {
      if (w.company_id) counts.set(w.company_id, (counts.get(w.company_id) || 0) + 1);
    });

    return companies
      .map((c) => ({
        value: c.id,
        label: c.name,
        count: counts.get(c.id) || 0,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [companies, initialWorkers]);

  const positionOptions: FilterOption[] = useMemo(() => {
    const counts = new Map<string, number>();
    initialWorkers.forEach((w) => {
      const name = w.position_name?.trim() || 'Sin Cargo';
      counts.set(name, (counts.get(name) || 0) + 1);
    });

    const namesSet = new Set<string>();
    positions.forEach((p) => {
      if (p.name?.trim()) namesSet.add(p.name.trim());
    });
    initialWorkers.forEach((w) => {
      if (w.position_name?.trim()) namesSet.add(w.position_name.trim());
    });

    return Array.from(namesSet)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({
        value: name,
        label: name,
        count: counts.get(name) || 0,
      }));
  }, [positions, initialWorkers]);

  const statusOptions: FilterOption[] = [
    { value: 'COMPLETED', label: '✅ Completados' },
    { value: 'IN_PROGRESS', label: '⏳ En Progreso (Pasos 1-3)' },
    { value: 'PENDING', label: '⚪ No Iniciados' },
  ];

  const stepOptions: FilterOption[] = [
    { value: 'AUTH_GENERATED', label: '1. Auth Generada (Pend. Firma)' },
    { value: 'AUTH_UPLOADED', label: '2. Auth Firmada (Listo p/ Envío)' },
    { value: 'RIOHS_SENT', label: '3. RIOHS Enviado (Pend. Recepción)' },
  ];

  // Summary Metrics
  const totalCount = initialWorkers.length;
  const completedCount = initialWorkers.filter((w) => w.riohs_status === 'COMPLETED').length;
  const pendingCount = initialWorkers.filter((w) => w.riohs_status === 'PENDING').length;
  const inProgressCount = totalCount - completedCount - pendingCount;

  const completedPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const inProgressPct = totalCount > 0 ? Math.round((inProgressCount / totalCount) * 100) : 0;
  const pendingPct = totalCount > 0 ? Math.round((pendingCount / totalCount) * 100) : 0;

  // Filtered Workers
  const filteredWorkers = useMemo(() => {
    return initialWorkers.filter((w) => {
      // Company filter
      if (selectedCompanyIds.length > 0 && !selectedCompanyIds.includes(w.company_id)) {
        return false;
      }

      // Position filter
      if (selectedPositionNames.length > 0 && !selectedPositionNames.includes(w.position_name)) {
        return false;
      }

      // Search filter (Name or RUT)
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const nameMatch = w.fullName.toLowerCase().includes(q);
        const rutMatch = w.rut.toLowerCase().includes(q);
        if (!nameMatch && !rutMatch) return false;
      }

      // Status filter
      if (selectedStatuses.length > 0) {
        const matchesStatus = selectedStatuses.some((st) => {
          if (st === 'COMPLETED') return w.riohs_status === 'COMPLETED';
          if (st === 'PENDING') return w.riohs_status === 'PENDING';
          if (st === 'IN_PROGRESS') {
            return ['AUTH_GENERATED', 'AUTH_UPLOADED', 'RIOHS_SENT'].includes(w.riohs_status);
          }
          return false;
        });
        if (!matchesStatus) return false;
      }

      // Sub-step filter
      if (selectedSteps.length > 0 && !selectedSteps.includes(w.riohs_status)) {
        return false;
      }

      return true;
    });
  }, [initialWorkers, selectedCompanyIds, selectedPositionNames, search, selectedStatuses, selectedSteps]);

  // Eligible workers among current filtered
  const visibleEligibleWorkers = filteredWorkers.filter(
    (w) => w.riohs_status === 'PENDING' || w.riohs_status === 'AUTH_GENERATED'
  );

  const isAllVisibleEligibleSelected =
    visibleEligibleWorkers.length > 0 &&
    visibleEligibleWorkers.every((w) => selectedWorkerIds.has(w.id));

  const toggleSelectAllVisibleEligible = () => {
    const next = new Set(selectedWorkerIds);
    if (isAllVisibleEligibleSelected) {
      visibleEligibleWorkers.forEach((w) => next.delete(w.id));
    } else {
      visibleEligibleWorkers.forEach((w) => next.add(w.id));
    }
    setSelectedWorkerIds(next);
  };

  const toggleWorkerSelection = (id: string) => {
    const next = new Set(selectedWorkerIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedWorkerIds(next);
  };

  const clearSelection = () => {
    setSelectedWorkerIds(new Set());
  };

  const clearFilters = () => {
    setSearch('');
    setSelectedCompanyIds([]);
    setSelectedPositionNames([]);
    setSelectedStatuses([]);
    setSelectedSteps([]);
  };

  const hasActiveFilters = Boolean(
    search ||
      selectedCompanyIds.length > 0 ||
      selectedPositionNames.length > 0 ||
      selectedStatuses.length > 0 ||
      selectedSteps.length > 0
  );

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
            Prevención de Riesgos — RIOHS
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gestión y seguimiento legal del Reglamento Interno de Orden, Higiene y Seguridad (Art. 156 Código del Trabajo)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <MassRiohsModal
            workers={initialWorkers}
            companies={companies}
            positions={positions}
            canExecute={canExecute}
            initialCompanyId={selectedCompanyIds.length === 1 ? selectedCompanyIds[0] : ''}
            initialPositionId=""
            preSelectedIds={selectedWorkerIds}
          />
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200/80 dark:border-slate-800 shadow-xs bg-white dark:bg-slate-900">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Personal Activo</p>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">{totalCount}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Trabajadores registrados</p>
            </div>
            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl text-slate-600 dark:text-slate-300">
              <FileText className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-200/80 dark:border-emerald-950/50 shadow-xs bg-emerald-50/30 dark:bg-emerald-950/10">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">
                ✅ RIOHS Completado
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{completedCount}</h3>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">({completedPct}%)</span>
              </div>
              <p className="text-[11px] text-emerald-600/80 dark:text-emerald-500 mt-0.5">Proceso legal finalizado</p>
            </div>
            <div className="p-3 bg-emerald-100 dark:bg-emerald-900/50 rounded-2xl text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-200/80 dark:border-amber-950/50 shadow-xs bg-amber-50/30 dark:bg-amber-950/10">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-400 uppercase tracking-wider">
                ⏳ En Progreso
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-2xl font-bold text-amber-700 dark:text-amber-300">{inProgressCount}</h3>
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">({inProgressPct}%)</span>
              </div>
              <p className="text-[11px] text-amber-600/80 dark:text-amber-500 mt-0.5">Pasos 1 a 3 avanzados</p>
            </div>
            <div className="p-3 bg-amber-100 dark:bg-amber-900/50 rounded-2xl text-amber-700 dark:text-amber-400">
              <Clock className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 dark:border-slate-800 shadow-xs bg-slate-50/50 dark:bg-slate-900/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                ⚪ No Iniciado
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-2xl font-bold text-slate-700 dark:text-slate-300">{pendingCount}</h3>
                <span className="text-xs font-semibold text-slate-500">({pendingPct}%)</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">Pendiente Paso 1 (Autorización)</p>
            </div>
            <div className="p-3 bg-slate-200/70 dark:bg-slate-800 rounded-2xl text-slate-500">
              <AlertCircle className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Card */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-xs">
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o RUT..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10 text-xs rounded-xl"
              />
            </div>

            {/* Company Filter */}
            <div>
              <MultiSelectFilter
                placeholder="Todas las empresas"
                singularName="empresa"
                pluralName="empresas"
                options={companyOptions}
                selectedValues={selectedCompanyIds}
                onChange={setSelectedCompanyIds}
                searchPlaceholder="Buscar empresa..."
              />
            </div>

            {/* Position Filter */}
            <div>
              <MultiSelectFilter
                placeholder="Todos los cargos"
                singularName="cargo"
                pluralName="cargos"
                options={positionOptions}
                selectedValues={selectedPositionNames}
                onChange={setSelectedPositionNames}
                searchPlaceholder="Buscar cargo..."
              />
            </div>

            {/* Status Main Filter */}
            <div>
              <MultiSelectFilter
                placeholder="Todos los estados RIOHS"
                singularName="estado"
                pluralName="estados"
                options={statusOptions}
                selectedValues={selectedStatuses}
                onChange={setSelectedStatuses}
                searchPlaceholder="Buscar estado..."
              />
            </div>

            {/* Sub-step Filter */}
            <div>
              <MultiSelectFilter
                placeholder="Todos los pasos intermedios"
                singularName="paso"
                pluralName="pasos"
                options={stepOptions}
                selectedValues={selectedSteps}
                onChange={setSelectedSteps}
                searchPlaceholder="Buscar paso..."
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-slate-500">
              Mostrando <strong className="text-slate-800 dark:text-slate-200">{filteredWorkers.length}</strong> de{' '}
              {totalCount} trabajadores
            </span>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-7 text-xs text-orange-600 hover:text-orange-700 gap-1 px-2"
              >
                <X className="h-3.5 w-3.5" />
                Limpiar Filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Floating Selection Bar */}
      {selectedWorkerIds.size > 0 && (
        <div className="p-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-2xl shadow-lg flex items-center justify-between animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-2 text-xs font-bold pl-2">
            <CheckSquare className="h-4 w-4" />
            {selectedWorkerIds.size} trabajador(es) seleccionado(s)
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              className="text-white/80 hover:text-white hover:bg-orange-600 text-xs h-8"
            >
              Desmarcar todos
            </Button>

            <MassRiohsModal
              workers={initialWorkers}
              companies={companies}
              positions={positions}
              canExecute={canExecute}
              initialCompanyId={selectedCompanyIds.length === 1 ? selectedCompanyIds[0] : ''}
              initialPositionId=""
              preSelectedIds={selectedWorkerIds}
              customTrigger={
                <Button size="sm" className="bg-white text-orange-700 hover:bg-orange-50 font-bold text-xs shadow-xs h-8 gap-1.5 rounded-xl">
                  <Download className="h-3.5 w-3.5" />
                  Generar Autorizaciones ({selectedWorkerIds.size})
                </Button>
              }
            />
          </div>
        </div>
      )}

      {/* Main Personnel RIOHS Table */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-xs overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/70 dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-3 w-10 text-center">
                    <Checkbox
                      checked={isAllVisibleEligibleSelected}
                      disabled={visibleEligibleWorkers.length === 0}
                      onCheckedChange={toggleSelectAllVisibleEligible}
                      className="rounded-md border-slate-300 data-[state=checked]:bg-orange-600 data-[state=checked]:border-orange-600"
                    />
                  </th>
                  <th className="py-3 px-4">Trabajador</th>
                  <th className="py-3 px-4">RUT</th>
                  <th className="py-3 px-4">Empresa / Cargo</th>
                  <th className="py-3 px-4">Estado RIOHS</th>
                  <th className="py-3 px-4">Paso Actual</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-normal">
                {filteredWorkers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 italic">
                      No se encontraron trabajadores que coincidan con los criterios de búsqueda.
                    </td>
                  </tr>
                ) : (
                  filteredWorkers.map((worker) => {
                    const isEligible = worker.riohs_status === 'PENDING' || worker.riohs_status === 'AUTH_GENERATED';
                    const isChecked = selectedWorkerIds.has(worker.id);

                    return (
                      <tr
                        key={worker.id}
                        className={`transition-colors ${
                          isChecked
                            ? 'bg-orange-50/60 dark:bg-orange-950/20'
                            : 'hover:bg-slate-50/80 dark:hover:bg-slate-900/50'
                        }`}
                      >
                        <td className="py-3 px-3 text-center">
                          <Checkbox
                            checked={isChecked}
                            disabled={!isEligible}
                            onCheckedChange={() => isEligible && toggleWorkerSelection(worker.id)}
                            className="rounded-md border-slate-300 data-[state=checked]:bg-orange-600 data-[state=checked]:border-orange-600"
                          />
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex flex-col">
                            <Link
                              href={`/personnel/${worker.id}`}
                              className="font-bold text-slate-900 dark:text-slate-100 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                            >
                              {worker.fullName}
                            </Link>
                            <span className="text-[11px] text-slate-400">{worker.email || 'Sin correo electrónico'}</span>
                          </div>
                        </td>

                        <td className="py-3 px-4 font-mono font-medium text-slate-700 dark:text-slate-300">
                          {worker.rut}
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{worker.company_name}</span>
                            <span className="text-[11px] text-slate-500">{worker.position_name}</span>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <Badge
                            className={
                              worker.riohs_status === 'COMPLETED'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300'
                                : worker.riohs_status === 'RIOHS_SENT'
                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-300'
                                : worker.riohs_status === 'AUTH_UPLOADED'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300'
                                : worker.riohs_status === 'AUTH_GENERATED'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300'
                            }
                          >
                            {worker.riohs_status === 'COMPLETED' && '✅ Completado'}
                            {worker.riohs_status === 'RIOHS_SENT' && '✉️ RIOHS Enviado'}
                            {worker.riohs_status === 'AUTH_UPLOADED' && '📄 Auth Firmada'}
                            {worker.riohs_status === 'AUTH_GENERATED' && '⏳ Auth Generada'}
                            {worker.riohs_status === 'PENDING' && '⚪ No Iniciado'}
                          </Badge>
                        </td>

                        <td className="py-3 px-4">
                          <div className="text-xs text-slate-600 dark:text-slate-400">
                            {worker.riohs_status === 'COMPLETED' && (
                              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                                Reglamento Entregado y Recepción Firmada
                              </span>
                            )}
                            {worker.riohs_status === 'RIOHS_SENT' && (
                              <span className="text-purple-700 dark:text-purple-400 font-medium">
                                Esperando firma de Comprobante de Recepción (Paso 4)
                              </span>
                            )}
                            {worker.riohs_status === 'AUTH_UPLOADED' && (
                              <span className="text-blue-700 dark:text-blue-400 font-medium">
                                Autorización firmada subida. Listo para enviar email (Paso 3)
                              </span>
                            )}
                            {worker.riohs_status === 'AUTH_GENERATED' && (
                              <span className="text-amber-700 dark:text-amber-400 font-medium">
                                PDF Autorización generado. Esperando firma física (Paso 2)
                              </span>
                            )}
                            {worker.riohs_status === 'PENDING' && (
                              <span className="text-slate-400 italic">
                                Pendiente de iniciar Paso 1
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <Link href={`/personnel/${worker.id}`}>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs font-semibold text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/30 gap-1 rounded-lg"
                            >
                              Gestionar
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
