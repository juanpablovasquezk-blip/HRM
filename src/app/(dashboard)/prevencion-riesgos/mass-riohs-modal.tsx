'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Download, ShieldCheck, Filter, Loader2, CheckCircle2, AlertCircle, User } from 'lucide-react';
import { toast } from 'sonner';
import { generateAuthorizationPDF } from '@/lib/riohs/generate-authorization-pdf';
import { markBatchAuthGenerated, RiohsDashboardWorker } from './actions';

interface MassRiohsModalProps {
  workers: RiohsDashboardWorker[];
  companies: { id: string; name: string; rut?: string }[];
  positions: { id: string; name: string }[];
  canExecute: boolean;
  onSuccess?: () => void;
}

export function MassRiohsModal({
  workers,
  companies,
  positions,
  canExecute,
  onSuccess,
}: MassRiohsModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [selectedPositionId, setSelectedPositionId] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  // Filtered workers inside modal
  const filteredWorkers = workers.filter((w) => {
    if (selectedCompanyId && w.company_id !== selectedCompanyId) return false;
    if (selectedPositionId && w.position_id !== selectedPositionId) return false;
    return true;
  });

  // Workers who are eligible for Auth generation (PENDING or AUTH_GENERATED)
  const eligibleWorkers = filteredWorkers.filter(
    (w) => w.riohs_status === 'PENDING' || w.riohs_status === 'AUTH_GENERATED'
  );

  // Initialize selection when filters or modal open state change
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(eligibleWorkers.map((w) => w.id)));
    }
  }, [open, selectedCompanyId, selectedPositionId]);

  const toggleSelectAllEligible = () => {
    if (selectedIds.size === eligibleWorkers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligibleWorkers.map((w) => w.id)));
    }
  };

  const toggleWorker = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleGenerateBatch = async () => {
    const selectedWorkersList = eligibleWorkers.filter((w) => selectedIds.has(w.id));
    if (selectedWorkersList.length === 0) {
      toast.error('No has seleccionado ningún trabajador elegible.');
      return;
    }

    setGenerating(true);
    setProgress({ current: 0, total: selectedWorkersList.length });

    const batchItems: { personnelId: string; companyId: string }[] = [];
    let successCount = 0;

    for (let i = 0; i < selectedWorkersList.length; i++) {
      const worker = selectedWorkersList[i];
      try {
        await generateAuthorizationPDF({
          workerName: worker.fullName,
          workerRut: worker.rut,
          workerEmail: worker.email || '',
          companyName: worker.company_name,
          companyRut: worker.company_rut,
        });

        batchItems.push({
          personnelId: worker.id,
          companyId: worker.company_id,
        });

        successCount++;
        setProgress({ current: i + 1, total: selectedWorkersList.length });

        // Small delay to prevent browser locking up during multi-download
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (err) {
        console.error(`Error generating PDF for ${worker.fullName}:`, err);
      }
    }

    if (batchItems.length > 0) {
      const res = await markBatchAuthGenerated(batchItems);
      if (res.success) {
        toast.success(`Se generaron y descargaron ${successCount} autorizaciones RIOHS correctamente.`);
      } else {
        toast.error(`Se descargaron los PDFs pero hubo un error actualizando la base de datos: ${res.error}`);
      }
    }

    setGenerating(false);
    setOpen(false);
    if (onSuccess) onSuccess();
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !generating && setOpen(val)}>
      <DialogTrigger render={
        <Button
          disabled={!canExecute}
          className="bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white font-semibold shadow-md gap-2 rounded-xl"
        >
          <Download className="h-4 w-4" />
          Generar Autorizaciones Masivas
        </Button>
      } />

      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto rounded-3xl border-slate-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
            <ShieldCheck className="h-6 w-6 text-orange-600" />
            Generación Masiva de Autorizaciones RIOHS
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Genera y descarga individualmente los PDFs de autorización (Paso 1) pre-llenados para los trabajadores seleccionados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Step 1: Filter */}
          <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-orange-600" />
              1. Filtrar Trabajadores
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-500 uppercase">Empresa</Label>
                <select
                  className="flex h-9 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                >
                  <option value="">Todas las empresas</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-500 uppercase">Cargo</Label>
                <select
                  className="flex h-9 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                  value={selectedPositionId}
                  onChange={(e) => setSelectedPositionId(e.target.value)}
                >
                  <option value="">Todos los cargos</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Step 2: Selection List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <User className="h-4 w-4 text-emerald-600" />
                2. Seleccionar Destinatarios ({selectedIds.size} de {eligibleWorkers.length} elegibles)
              </Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleSelectAllEligible}
                disabled={generating || eligibleWorkers.length === 0}
                className="text-[10px] uppercase font-bold text-slate-500 hover:text-orange-600 h-7"
              >
                {selectedIds.size === eligibleWorkers.length ? 'Deseleccionar Todos' : 'Seleccionar Todos Elegibles'}
              </Button>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 max-h-[260px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredWorkers.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 italic">
                  No hay trabajadores que coincidan con los filtros seleccionados.
                </div>
              ) : (
                filteredWorkers.map((worker) => {
                  const isEligible = worker.riohs_status === 'PENDING' || worker.riohs_status === 'AUTH_GENERATED';
                  const isChecked = isEligible && selectedIds.has(worker.id);

                  return (
                    <div
                      key={worker.id}
                      onClick={() => isEligible && !generating && toggleWorker(worker.id)}
                      className={`flex items-center justify-between p-2.5 transition-colors ${
                        isEligible
                          ? 'hover:bg-orange-50/50 dark:hover:bg-slate-800/40 cursor-pointer'
                          : 'bg-slate-50/70 dark:bg-slate-950/40 opacity-70 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={isChecked}
                          disabled={!isEligible || generating}
                          onCheckedChange={() => isEligible && toggleWorker(worker.id)}
                          className="rounded-md border-slate-300 data-[state=checked]:bg-orange-600 data-[state=checked]:border-orange-600"
                        />
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {worker.fullName}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            RUT: {worker.rut} • {worker.position_name} ({worker.company_name})
                          </span>
                        </div>
                      </div>

                      <div>
                        {worker.riohs_status === 'COMPLETED' && (
                          <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300">
                            ✅ Completado
                          </Badge>
                        )}
                        {worker.riohs_status === 'RIOHS_SENT' && (
                          <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-300">
                            ✉️ RIOHS Enviado
                          </Badge>
                        )}
                        {worker.riohs_status === 'AUTH_UPLOADED' && (
                          <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-300">
                            📄 Autorización Firmada
                          </Badge>
                        )}
                        {worker.riohs_status === 'AUTH_GENERATED' && (
                          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300">
                            ⏳ Auth Generada
                          </Badge>
                        )}
                        {worker.riohs_status === 'PENDING' && (
                          <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-600 border-slate-300">
                            ⚪ Pendiente
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Progress Indicator */}
          {generating && (
            <div className="p-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-orange-900 dark:text-orange-300">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-4 w-4 animate-spin text-orange-600" />
                  Generando y descargando autorizaciones...
                </span>
                <span>
                  {progress.current} / {progress.total}
                </span>
              </div>
              <div className="w-full bg-orange-200 dark:bg-orange-900 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-orange-600 h-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={generating}
            className="rounded-xl"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleGenerateBatch}
            disabled={generating || selectedIds.size === 0}
            className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generando... ({progress.current}/{progress.total})
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Generar y Descargar {selectedIds.size} PDFs
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
