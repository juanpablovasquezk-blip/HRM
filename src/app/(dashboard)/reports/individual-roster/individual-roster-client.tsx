'use client';

import { useState, useTransition, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isSameDay,
  addDays,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { Printer, Download, Search, Loader2, Camera, MessageSquare, Check, Users, Send } from 'lucide-react';
import { getIndividualRoster, sendRosterWhatsApp } from './actions';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface IndividualRosterClientProps {
  personnelList: any[];
  areas: any[];
  positions: any[];
}

export function IndividualRosterClient({ personnelList, areas, positions }: IndividualRosterClientProps) {
  const [selectedAreaId, setSelectedAreaId] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string>('');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [data, setData] = useState<any>(null);
  const [isPending, startTransition] = useTransition();
  const rosterRef = useRef<HTMLDivElement>(null);

  // Individual WhatsApp send state
  const [isSendingIndividual, setIsSendingIndividual] = useState(false);

  // Bulk WhatsApp Sending State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkAreaId, setBulkAreaId] = useState<string>('all');
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; status: string } | null>(null);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);

  const handleCopyScreenshot = async () => {
    if (!rosterRef.current) return;
    const toastId = toast.loading("Generando captura del roster...");
    try {
      const html2canvas = (await import('html2canvas-pro')).default;
      const canvas = await html2canvas(rosterRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        windowWidth: 1024,
        ignoreElements: (element) => {
          return element.classList.contains('no-print');
        }
      });
      
      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast.error("No se pudo generar la imagen.", { id: toastId });
          return;
        }
        
        try {
          const dataItem = [new ClipboardItem({ 'image/png': blob })];
          await navigator.clipboard.write(dataItem);
          toast.success("¡Captura copiada al portapapeles! Puedes pegarla directamente.", { id: toastId });
        } catch (clipErr) {
          console.error("Clipboard copy failed, offering fallback download:", clipErr);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const namePart = `${data?.personnel?.first_name || 'roster'}_${data?.personnel?.last_name_father || ''}`;
          a.download = `roster_individual_${namePart.replace(/\s+/g, '_')}.png`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success("Captura generada y descargada (copiar al portapapeles no soportado en este navegador).", { id: toastId });
        }
      }, 'image/png');
    } catch (err: any) {
      console.error(err);
      toast.error("Error al generar la captura.", { id: toastId });
    }
  };

  // ── Individual WhatsApp send ──────────────────────────────────────────────────
  const handleSendIndividualWhatsApp = async () => {
    if (!data || !rosterRef.current) return;
    const workerName = `${data.personnel.first_name} ${data.personnel.last_name_father}`;
    if (!confirm(`¿Enviar el roster de ${workerName} por WhatsApp?`)) return;

    setIsSendingIndividual(true);
    const toastId = toast.loading(`Generando captura para ${workerName}...`);
    try {
      const html2canvas = (await import('html2canvas-pro')).default;
      const canvas = await html2canvas(rosterRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        windowWidth: 1024,
        ignoreElements: (el) => el.classList.contains('no-print'),
      });

      const base64Image = canvas.toDataURL('image/png');
      toast.loading(`Enviando WhatsApp a ${workerName}...`, { id: toastId });

      const res = await sendRosterWhatsApp(selectedId, base64Image, startDate, endDate);
      if (res.success) {
        toast.success(`✅ Roster enviado por WhatsApp a ${workerName}`, { id: toastId, duration: 5000 });
      } else {
        toast.error(res.error || 'Error al enviar', { id: toastId });
      }
    } catch (err: any) {
      toast.error(`Error: ${err?.message || 'Error inesperado'}`, { id: toastId });
    } finally {
      setIsSendingIndividual(false);
    }
  };

  // Create a map for quick position -> area lookup
  const positionAreaMap = Object.fromEntries(positions.map(p => [p.id, p.area_id]));

  // Filter personnel based on selected area
  const filteredPersonnel = personnelList.filter(p => {
    if (selectedAreaId === 'all') return true;
    const areaId = positionAreaMap[p.main_position];
    return areaId === selectedAreaId;
  });

  // Filter workers inside bulk modal based on bulkAreaId
  const bulkFilteredPersonnel = personnelList.filter(p => {
    if (bulkAreaId === 'all') return true;
    const areaId = positionAreaMap[p.main_position];
    return areaId === bulkAreaId;
  });

  const toggleWorkerSelection = (id: string) => {
    setSelectedWorkers(prev => 
      prev.includes(id) ? prev.filter(wId => wId !== id) : [...prev, id]
    );
  };

  const handleSelectAllBulk = (checked: boolean) => {
    if (checked) {
      setSelectedWorkers(bulkFilteredPersonnel.map(p => p.id));
    } else {
      setSelectedWorkers([]);
    }
  };

  const runBulkSend = async () => {
    if (selectedWorkers.length === 0) {
      toast.error('Selecciona al menos un trabajador');
      return;
    }

    setIsSendingBulk(true);
    setBulkErrors([]);
    setBulkProgress({ current: 0, total: selectedWorkers.length, status: 'Iniciando proceso...' });

    // Store the original state so we can restore it at the end
    const originalSelectedId = selectedId;
    const originalData = data;
    const errorsList: string[] = [];

    try {
      const html2canvas = (await import('html2canvas-pro')).default;

      for (let i = 0; i < selectedWorkers.length; i++) {
        const workerId = selectedWorkers[i];
        const worker = personnelList.find(p => p.id === workerId);
        const workerName = worker ? `${worker.first_name} ${worker.last_name_father}` : 'Trabajador';

        setBulkProgress({
          current: i + 1,
          total: selectedWorkers.length,
          status: `Cargando datos de ${workerName}...`
        });

        // 1. Fetch roster data for this worker
        const result = await getIndividualRoster(workerId, startDate, endDate);
        if (result.error) {
          console.error(`Error loading data for ${workerName}:`, result.error);
          errorsList.push(`${workerName}: ${result.error}`);
          continue;
        }

        // 2. Render roster locally (this updates the data prop in React, which re-renders the container)
        setData(result);
        setSelectedId(workerId);

        // 3. Wait for DOM to update and render completely
        await new Promise(resolve => setTimeout(resolve, 500));

        // 4. Capture screenshot
        if (!rosterRef.current) {
          console.error('Roster reference container is missing');
          errorsList.push(`${workerName}: Contenedor del Roster no disponible en el DOM`);
          continue;
        }

        setBulkProgress({
          current: i + 1,
          total: selectedWorkers.length,
          status: `Generando captura de pantalla para ${workerName}...`
        });

        try {
          const canvas = await html2canvas(rosterRef.current, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            windowWidth: 1024,
            ignoreElements: (element) => element.classList.contains('no-print')
          });

          const base64Image = canvas.toDataURL('image/png');

          // 5. Send via server action
          setBulkProgress({
            current: i + 1,
            total: selectedWorkers.length,
            status: `Enviando WhatsApp a ${workerName}...`
          });

          const sendRes = await sendRosterWhatsApp(workerId, base64Image, startDate, endDate);
          if (!sendRes.success) {
            console.error(`Error sending WhatsApp for ${workerName}:`, sendRes.error);
            errorsList.push(`${workerName}: ${sendRes.error}`);
          }
        } catch (captureErr: any) {
          console.error(`Error capturing or sending for ${workerName}:`, captureErr);
          errorsList.push(`${workerName}: Error de captura: ${captureErr.message || String(captureErr)}`);
        }
      }

      if (errorsList.length > 0) {
        setBulkErrors(errorsList);
        toast.error('El envío masivo finalizó con algunos errores. Revisa la lista en el modal.');
      } else {
        toast.success('Envío masivo finalizado con éxito');
        setIsBulkModalOpen(false);
        setSelectedWorkers([]);
        setBulkProgress(null);
      }
    } catch (err: any) {
      console.error('Error in bulk send loop:', err);
      toast.error('Ocurrió un error inesperado durante el envío masivo');
    } finally {
      setIsSendingBulk(false);
      // Restore original selection
      setSelectedId(originalSelectedId);
      setData(originalData);
    }
  };

  const handleFetch = () => {
    if (!selectedId) {
      toast.error('Selecciona un trabajador');
      return;
    }

    startTransition(async () => {
      const result = await getIndividualRoster(selectedId, startDate, endDate);
      if (result.error) {
        toast.error(result.error);
      } else {
        setData(result);
      }
    });
  };

  const handlePrint = () => {
    window.print();
  };


  // Helper to group days by week (Monday to Sunday)
  const getWeeks = () => {
    if (!data) return [];
    
    const allDays = eachDayOfInterval({
      start: parseISO(startDate),
      end: parseISO(endDate)
    });

    const weeks = [];
    let currentWeek: Date[] = [];
    
    let iterDate = startOfWeek(allDays[0], { weekStartsOn: 1 });
    const lastDay = endOfWeek(allDays[allDays.length - 1], { weekStartsOn: 1 });

    while (iterDate <= lastDay) {
      currentWeek.push(new Date(iterDate));
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      iterDate = addDays(iterDate, 1);
    }
    
    return weeks;
  };

  const weeks = getWeeks();

  // Count manually changed assignments for the legend
  const manualChangesCount = data?.assignments?.filter((a: any) => a.is_manual).length ?? 0;

  // Helper: a day is a "post-publish change" if there's a published assignment
  // AND a leave that overlaps that day (leave submitted after shift was published)
  const isPostPublishLeave = (day: Date) => {
    if (!data) return false;
    const asg = data.assignments.find((a: any) => isSameDay(parseISO(a.date), day));
    if (!asg?.is_published) return false;
    return data.leaves.some((l: any) => day >= parseISO(l.start_date) && day <= parseISO(l.end_date));
  };

  return (
    <div className="space-y-6">
      {/* Controls - Hidden during print */}
      <Card className="print:hidden border-slate-200/60 shadow-sm">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 items-end">
            <div className="space-y-2 min-w-0">
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Área (Opcional)</Label>
              <select
                value={selectedAreaId}
                onChange={(e) => {
                  setSelectedAreaId(e.target.value || 'all');
                  setSelectedId('');
                }}
                className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 border-slate-200 text-slate-700 cursor-pointer"
              >
                <option value="all">Todas las áreas</option>
                {areas && areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 min-w-0">
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Trabajador</Label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value || '')}
                className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 border-slate-200 text-slate-700 cursor-pointer"
              >
                <option value="">{filteredPersonnel.length > 0 ? "Seleccionar..." : "No hay personal"}</option>
                {filteredPersonnel.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.first_name} {p.last_name_father}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Desde</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 border-slate-200 text-xs px-2" />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Hasta</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 border-slate-200 text-xs px-2" />
            </div>

            <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
              <Button onClick={handleFetch} disabled={isPending} size="sm" className="flex-1 h-9 bg-orange-600 hover:bg-orange-700 shadow-sm text-xs">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                Generar
              </Button>

              {/* Masivo — disabled while an individual roster is loaded */}
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setBulkAreaId(selectedAreaId);
                  setSelectedWorkers([]);
                  setIsBulkModalOpen(true);
                }}
                disabled={!!data}
                className="h-9 border-slate-200 text-xs px-3 text-slate-700 hover:bg-slate-50 gap-1.5 bg-white shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                title={data ? "Cierra el roster individual antes de usar el envío masivo" : "Envío Masivo WhatsApp"}
              >
                <Users className="h-4 w-4 text-emerald-500" />
                Masivo
              </Button>

              {data && (
                <>
                  {/* Individual WhatsApp button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSendIndividualWhatsApp}
                    disabled={isSendingIndividual}
                    title={`Enviar roster de ${data.personnel.first_name} por WhatsApp`}
                    className="h-9 border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs px-3 shrink-0 gap-1.5 font-semibold"
                  >
                    {isSendingIndividual
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <MessageSquare className="h-4 w-4" />
                    }
                    {isSendingIndividual ? 'Enviando...' : 'WhatsApp'}
                  </Button>
                  <Button variant="outline" size="icon" onClick={handlePrint} title="Imprimir" className="h-9 w-9 border-slate-200 shrink-0 bg-white">
                    <Printer className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={handleCopyScreenshot} title="Copiar Captura" className="h-9 w-9 border-slate-200 shrink-0 text-slate-600 hover:text-slate-900 bg-white">
                    <Camera className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Legend: manual changes or post-publish leaves */}
          {data && (manualChangesCount > 0 || data.leaves?.some((l: any) =>
            data.assignments?.some((a: any) => a.is_published &&
              parseISO(a.date) >= parseISO(l.start_date) &&
              parseISO(a.date) <= parseISO(l.end_date))
          )) && (
            <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5 w-fit">
              <span className="inline-block w-3 h-3 rounded-sm bg-amber-400 border border-amber-500 shrink-0" />
              <span>
                Días resaltados en ámbar: turno modificado manualmente o solicitud de ausencia sobre turno publicado
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Roster View */}
      {data && (
        <div ref={rosterRef} className="bg-white p-8 border rounded-lg shadow-sm print:shadow-none print:border-none print:p-0">
          {/* Header */}
          <div className="grid grid-cols-3 border-2 border-black mb-6 text-center font-bold uppercase text-sm">
            <div className="border-r-2 border-black py-2 bg-slate-50">MES: {format(parseISO(startDate), 'MMMM yy', { locale: es })}</div>
            <div className="border-r-2 border-black py-2">NOMBRE: {data.personnel.first_name} {data.personnel.last_name_father}</div>
            <div className="py-2 bg-slate-50">{data.personnel.position?.name || 'TRABAJADOR'}</div>
          </div>

          {/* Weekly Tables */}
          <div className="space-y-8">
            {weeks.map((week, weekIdx) => (
              <div key={weekIdx} className="overflow-x-auto">
                <table className="w-full border-collapse border-2 border-black text-[10px] sm:text-xs">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-black p-1 w-20 bg-white"></th>
                      {week.map((day, dIdx) => (
                        <th key={dIdx} className="border border-black p-1 uppercase text-center w-[12%]">
                          {format(day, 'EEEE', { locale: es })}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* FECHA */}
                    <tr>
                      <td className="border border-black p-1 font-bold bg-slate-50">FECHA</td>
                      {week.map((day, dIdx) => (
                        <td key={dIdx} className="border border-black p-1 text-center font-mono">
                          {format(day, 'dd-MM-yyyy')}
                        </td>
                      ))}
                    </tr>
                    {/* TURNO */}
                    <tr>
                      <td className="border border-black p-1 font-bold bg-slate-50">TURNO</td>
                      {week.map((day, dIdx) => {
                        const asg = data.assignments.find((a: any) => isSameDay(parseISO(a.date), day));
                        const leave = data.leaves.find((l: any) => day >= parseISO(l.start_date) && day <= parseISO(l.end_date));
                        const isManual = asg?.is_manual && !leave;
                        const isPostLeave = isPostPublishLeave(day);
                        const isChanged = isManual || isPostLeave;

                        // Label: VAC for vacation, LIC for other leaves, shift name, or LIBRE
                        let content: string;
                        if (leave) content = leave.type === 'VACATION' ? 'VAC' : 'LIC';
                        else if (asg) content = asg.shift?.name || 'OT';
                        else content = 'LIBRE';

                        return (
                          <td
                            key={dIdx}
                            className={cn(
                              "border border-black p-1 text-center font-bold",
                              isChanged && "bg-amber-100 text-amber-900 print:bg-amber-100"
                            )}
                            title={
                              isManual ? "Turno modificado manualmente"
                              : isPostLeave ? "Solicitud de ausencia sobre turno publicado"
                              : undefined
                            }
                          >
                            {isChanged && (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-0.5 align-middle -mt-0.5" />
                            )}
                            {content}
                          </td>
                        );
                      })}
                    </tr>
                    {/* ASIGNACIÓN (AREA) */}
                    <tr>
                      <td className="border border-black p-1 font-bold bg-slate-50">ASIGNACIÓN</td>
                      {week.map((day, dIdx) => {
                        const asg = data.assignments.find((a: any) => isSameDay(parseISO(a.date), day));
                        const leave = data.leaves.find((l: any) => day >= parseISO(l.start_date) && day <= parseISO(l.end_date));
                        const isManual = asg?.is_manual && !leave;
                        const isPostLeave = isPostPublishLeave(day);
                        const isChanged = isManual || isPostLeave;

                        let content = '';
                        if (leave) content = leave.type === 'VACATION' ? 'VACACIONES' : 'LICENCIA';
                        else if (asg) {
                          const areaName = asg.area?.name || '';
                          const posName = asg.position?.name || '';
                          if (areaName.toLowerCase().includes('bodega')) {
                            content = posName.replace(/operador\s+/gi, '').toUpperCase();
                          } else {
                            content = areaName.toUpperCase();
                          }
                        } else {
                          content = 'LIBRE';
                        }

                        return (
                          <td
                            key={dIdx}
                            className={cn(
                              "border border-black p-1 text-center text-[9px] uppercase",
                              isChanged && "bg-amber-50 text-amber-900 print:bg-amber-50"
                            )}
                          >
                            {content}
                          </td>
                        );
                      })}
                    </tr>
                    {/* INICIO */}
                    <tr>
                      <td className="border border-black p-1 font-bold bg-slate-50">INICIO</td>
                      {week.map((day, dIdx) => {
                        const asg = data.assignments.find((a: any) => isSameDay(parseISO(a.date), day));
                        const leave = data.leaves.find((l: any) => day >= parseISO(l.start_date) && day <= parseISO(l.end_date));
                        const isManual = asg?.is_manual && !leave;
                        const isPostLeave = isPostPublishLeave(day);
                        const isChanged = isManual || isPostLeave;
                        return (
                          <td
                            key={dIdx}
                            className={cn(
                              "border border-black p-1 text-center font-mono",
                              isChanged && "bg-amber-50 text-amber-900 print:bg-amber-50"
                            )}
                          >
                            {/* Empty when leave covers this day */}
                            {!leave && (asg?.shift?.start_time?.slice(0, 5) || '')}
                          </td>
                        );
                      })}
                    </tr>
                    {/* FIN */}
                    <tr>
                      <td className="border border-black p-1 font-bold bg-slate-50">FIN</td>
                      {week.map((day, dIdx) => {
                        const asg = data.assignments.find((a: any) => isSameDay(parseISO(a.date), day));
                        const leave = data.leaves.find((l: any) => day >= parseISO(l.start_date) && day <= parseISO(l.end_date));
                        const isManual = asg?.is_manual && !leave;
                        const isPostLeave = isPostPublishLeave(day);
                        const isChanged = isManual || isPostLeave;
                        return (
                          <td
                            key={dIdx}
                            className={cn(
                              "border border-black p-1 text-center font-mono",
                              isChanged && "bg-amber-50 text-amber-900 print:bg-amber-50"
                            )}
                          >
                            {/* Empty when leave covers this day */}
                            {!leave && (asg?.shift?.end_time?.slice(0, 5) || '')}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* Legend in print */}
          <div className="mt-4 hidden print:flex items-center gap-2 text-[9px] text-amber-800">
            <span className="inline-block w-3 h-3 bg-amber-200 border border-amber-400 shrink-0" />
            Modificación: turno cambiado manualmente o solicitud de ausencia sobre turno publicado
          </div>

          {/* Footer Print Info */}
          <div className="mt-8 text-[9px] text-slate-400 hidden print:block border-t pt-2">
            Documento generado automáticamente por HRM Roster Manager el {format(new Date(), 'PPpp', { locale: es })}
          </div>
        </div>
      )}

      {/* Bulk WhatsApp Dialog */}
      <Dialog 
        open={isBulkModalOpen} 
        onOpenChange={(open) => {
          if (!isSendingBulk) {
            setIsBulkModalOpen(open);
            if (!open) setBulkErrors([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-[480px]" showCloseButton={!isSendingBulk}>
          <DialogHeader>
            <DialogTitle>Envío Masivo de Roster por WhatsApp</DialogTitle>
            <DialogDescription>
              Seleccione el área y los trabajadores a los que desea enviar sus roles por WhatsApp. El sistema capturará cada roster individual y lo enviará automáticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Filtrar por Área</Label>
              <select
                value={bulkAreaId}
                onChange={(e) => {
                  const areaId = e.target.value || 'all';
                  setBulkAreaId(areaId);
                  setSelectedWorkers([]);
                }}
                disabled={isSendingBulk}
                className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 border-slate-200 text-slate-700 cursor-pointer"
              >
                <option value="all">Todas las áreas</option>
                {areas && areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Trabajadores</Label>
                {bulkFilteredPersonnel.length > 0 && !isSendingBulk && (
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={selectedWorkers.length === bulkFilteredPersonnel.length && bulkFilteredPersonnel.length > 0}
                      onChange={(e) => handleSelectAllBulk(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                    />
                    <span>Seleccionar Todos</span>
                  </label>
                )}
              </div>

              <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-md p-3 space-y-2 bg-slate-50/50">
                {bulkFilteredPersonnel.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">No hay trabajadores registrados en esta área.</p>
                ) : (
                  bulkFilteredPersonnel.map((p) => {
                    const isSelected = selectedWorkers.includes(p.id);
                    const positionName = positions.find(pos => pos.id === p.main_position)?.name || 'Sin cargo';
                    return (
                      <label
                        key={p.id}
                        className={cn(
                          "flex items-center justify-between p-2 rounded-md border transition-all cursor-pointer text-xs select-none",
                          isSelected 
                            ? "bg-emerald-50/40 border-emerald-200 text-emerald-950" 
                            : "bg-white border-slate-100 hover:border-slate-200 text-slate-700",
                          isSendingBulk && "opacity-60 cursor-not-allowed"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => !isSendingBulk && toggleWorkerSelection(p.id)}
                            disabled={isSendingBulk}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                          />
                          <div>
                            <p className="font-medium">{p.first_name} {p.last_name_father}</p>
                            <p className="text-[10px] text-slate-400">{positionName}</p>
                          </div>
                        </div>
                        {p.phone ? (
                          <span className="text-[10px] text-slate-500 font-mono">{p.phone}</span>
                        ) : (
                          <span className="text-[10px] text-red-500 font-medium bg-red-50 px-1.5 py-0.5 rounded">Sin Teléfono</span>
                        )}
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Bulk Errors Warning */}
            {bulkErrors.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-800 space-y-1.5 max-h-40 overflow-y-auto">
                <p className="font-bold">Errores durante el envío:</p>
                <ul className="list-disc list-inside space-y-1">
                  {bulkErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Progress indicator */}
            {isSendingBulk && bulkProgress && (
              <div className="space-y-2 border-t pt-3 mt-3">
                <div className="flex justify-between text-xs font-semibold text-slate-700">
                  <span>Progreso de envío</span>
                  <span>{bulkProgress.current} / {bulkProgress.total}</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-emerald-500 h-full transition-all duration-300"
                    style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-500 italic animate-pulse flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin text-emerald-600" />
                  {bulkProgress.status}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              disabled={isSendingBulk}
              onClick={() => {
                setIsBulkModalOpen(false);
                setBulkErrors([]);
              }}
              className="text-xs h-9"
            >
              Cancelar
            </Button>
            <Button
              onClick={runBulkSend}
              disabled={isSendingBulk || selectedWorkers.length === 0}
              className="text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              {isSendingBulk ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <MessageSquare className="h-3.5 w-3.5" />
                  Enviar ({selectedWorkers.length} seleccionados)
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Global CSS for Print */}
      <style jsx global>{`
        @media print {
          @page {
            size: landscape;
            margin: 1cm;
          }
          body {
            background: white !important;
          }
          nav, header, footer, .sidebar {
            display: none !important;
          }
          .container {
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
