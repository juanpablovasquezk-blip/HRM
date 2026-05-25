'use client';

import { useState, useTransition, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Printer, Download, Search, Loader2, Camera } from 'lucide-react';
import { getIndividualRoster } from './actions';
import { toast } from 'sonner';

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

  // Create a map for quick position -> area lookup
  const positionAreaMap = Object.fromEntries(positions.map(p => [p.id, p.area_id]));

  // Filter personnel based on selected area
  const filteredPersonnel = personnelList.filter(p => {
    if (selectedAreaId === 'all') return true;
    const areaId = positionAreaMap[p.main_position];
    return areaId === selectedAreaId;
  });

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

    // To match the screenshot (Mon-Sun), we find the Monday of the first day
    // even if it's outside the range, to complete the first row.
    const weeks = [];
    let currentWeek: Date[] = [];
    
    // We start from the Monday of the week containing startDate
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

  return (
    <div className="space-y-6">
      {/* Controls - Hidden during print */}
      <Card className="print:hidden border-slate-200/60 shadow-sm">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 items-end">
            <div className="space-y-2 min-w-0">
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Área (Opcional)</Label>
              <Select value={selectedAreaId} onValueChange={(val) => {
                setSelectedAreaId(val || 'all');
                setSelectedId(''); 
              }}>
                <SelectTrigger className="h-9 border-slate-200 text-xs w-full overflow-hidden">
                  <SelectValue placeholder="Todas las áreas" className="truncate" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las áreas</SelectItem>
                  {areas && areas.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 min-w-0">
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Trabajador</Label>
              <Select value={selectedId} onValueChange={(val) => setSelectedId(val || '')}>
                <SelectTrigger className="h-9 border-slate-200 text-xs w-full overflow-hidden">
                  <SelectValue placeholder={filteredPersonnel.length > 0 ? "Seleccionar..." : "No hay personal"} className="truncate" />
                </SelectTrigger>
                <SelectContent>
                  {filteredPersonnel.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.first_name} {p.last_name_father}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              {data && (
                <>
                  <Button variant="outline" size="icon" onClick={handlePrint} title="Imprimir" className="h-9 w-9 border-slate-200 shrink-0">
                    <Printer className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={handleCopyScreenshot} title="Copiar Captura" className="h-9 w-9 border-slate-200 shrink-0 text-slate-600 hover:text-slate-900">
                    <Camera className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
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
                        
                        let content = '-';
                        if (leave) content = 'L';
                        else if (asg) content = asg.shift?.name || 'OT';
                        else content = 'L'; // Libre if no assignment and in range? 
                        
                        return (
                          <td key={dIdx} className="border border-black p-1 text-center font-bold">
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
                        
                        let content = '';
                        if (leave) content = leave.type === 'VACATION' ? 'VACACIONES' : 'LICENCIA';
                        else if (asg) {
                          const areaName = asg.area?.name || '';
                          const posName = asg.position?.name || '';
                          
                          if (areaName.toLowerCase().includes('bodega')) {
                            // Clean up "Operador Fedex" -> "FEDEX"
                            content = posName.replace(/operador\s+/gi, '').toUpperCase();
                          } else {
                            content = areaName.toUpperCase();
                          }
                        } else {
                          content = 'LIBRE';
                        }
                        
                        return (
                          <td key={dIdx} className="border border-black p-1 text-center text-[9px] uppercase">
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
                        return (
                          <td key={dIdx} className="border border-black p-1 text-center font-mono">
                            {asg?.shift?.start_time?.slice(0, 5) || ''}
                          </td>
                        );
                      })}
                    </tr>
                    {/* FIN */}
                    <tr>
                      <td className="border border-black p-1 font-bold bg-slate-50">FIN</td>
                      {week.map((day, dIdx) => {
                        const asg = data.assignments.find((a: any) => isSameDay(parseISO(a.date), day));
                        return (
                          <td key={dIdx} className="border border-black p-1 text-center font-mono">
                            {asg?.shift?.end_time?.slice(0, 5) || ''}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* Footer Print Info */}
          <div className="mt-8 text-[9px] text-slate-400 hidden print:block border-t pt-2">
            Documento generado automáticamente por HRM Roster Manager el {format(new Date(), 'PPpp', { locale: es })}
          </div>
        </div>
      )}

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
