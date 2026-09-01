'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { format, parseISO, addDays, subDays } from 'date-fns';

import { es } from 'date-fns/locale';
import { 
  Calendar, 
  Users, 
  Plus, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  ChevronLeft, 
  ChevronRight,
  Truck,
  Warehouse,
  Plane,
  ShieldCheck,
  UserPlus,
  Dna,
  Star,
  Loader2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import type { 
  ShiftAssignmentWithDetails, 
  ShiftRequirementWithDetails, 
  Area, 
  Position, 
  Shift 
} from '@/types/database';
import { deleteAssignment, deleteRequirement } from '../actions';
import { getAvailableForExtra, addExtraRequirement, assignExtraPersonnel, confirmPlan, cancelAssignment, resetDailyPlan, updateAssignmentShift, updateAssignmentDetails } from './actions';
import { sendDailyPlanScreenshotAction } from './publish-actions';
import { RotateCcw, Mail, Copy, Camera } from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface Props {
  initialAssignments: ShiftAssignmentWithDetails[];
  initialRequirements: ShiftRequirementWithDetails[];
  areas: Area[];
  positions: Position[];
  shifts: Shift[];
  selectedDate: string;
  readOnly?: boolean;
}

export default function DailyPlanningClient({
  initialAssignments,
  initialRequirements,
  areas,
  positions,
  shifts,
  selectedDate,
  readOnly = false
}: Props) {
  const router = useRouter();
  const reportRef = useRef<HTMLDivElement>(null);
  const [isAddingExtra, setIsAddingExtra] = useState(false);
  const [loadingAvailable, setLoadingAvailable] = useState<string | null>(null);
  const [availablePersonnel, setAvailablePersonnel] = useState<Record<string, any[]>>({});
  const [isConfirmed, setIsConfirmed] = useState(initialAssignments.some(a => a.is_confirmed));
  const [isConfirming, setIsConfirming] = useState(false);
  
  // State for quick edit modal
  const [editingAssignment, setEditingAssignment] = useState<ShiftAssignmentWithDetails | null>(null);
  const [editShiftId, setEditShiftId] = useState<string>('');
  const [editPositionId, setEditPositionId] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const availableWorkerPositions = useMemo(() => {
    if (!editingAssignment?.personnel) return positions;
    const p = editingAssignment.personnel;
    const allowedIds = new Set<string>();
    
    if (p.main_position) allowedIds.add(p.main_position);
    if (Array.isArray(p.secondary_positions)) {
      p.secondary_positions.forEach(id => allowedIds.add(id));
    }
    if (editingAssignment.position_id) {
      allowedIds.add(editingAssignment.position_id);
    }

    if (allowedIds.size === 0) return positions;

    const filtered = positions.filter(pos => allowedIds.has(pos.id));
    return filtered.length > 0 ? filtered : positions;
  }, [editingAssignment, positions]);


  const handleOpenEdit = (assignment: ShiftAssignmentWithDetails) => {
    if (readOnly) return;
    setEditingAssignment(assignment);
    setEditShiftId(assignment.shift_id);
    setEditPositionId(assignment.position_id);
  };

  const handleSaveEdit = async () => {
    if (!editingAssignment || !editShiftId || !editPositionId) return;
    setIsSavingEdit(true);
    const toastId = toast.loading('Guardando y publicando cambio...');
    try {
      const selectedPos = positions.find(p => p.id === editPositionId);
      const targetAreaId = selectedPos?.area_id || editingAssignment.area_id;

      const res = await updateAssignmentDetails(
        editingAssignment.id,
        editShiftId,
        editPositionId,
        targetAreaId
      );

      if (res.success) {
        toast.success('Asignación actualizada y publicada (sin WhatsApp)', { id: toastId });
        setEditingAssignment(null);
        router.refresh();
      } else {
        toast.error(`Error: ${res.error}`, { id: toastId });
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message || String(err)}`, { id: toastId });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const getPersonnelStyles = (assignment: ShiftAssignmentWithDetails) => {
    const isExtra = assignment.is_extra;
    const isAbsent = assignment.attendance_status === 'absent';

    let styles = ' inline-block rounded px-2 py-0.5 select-none whitespace-nowrap ';

    if (!readOnly) {
      styles += ' cursor-pointer hover:underline hover:bg-blue-100/80 text-blue-900 ';
    }

    if (isAbsent) {
      styles += ' line-through text-red-500 bg-red-50 border border-red-200 ';
    } else if (isExtra) {
      styles += ' bg-rose-100 border border-rose-300 text-rose-950 font-bold ';
    } else {
      styles += ' border border-transparent ';
    }
    return styles;
  };

  const getPersonnelInlineStyle = (assignment?: ShiftAssignmentWithDetails | null) => {
    if (!assignment) return undefined;
    const isExtra = assignment.is_extra;
    const isAbsent = assignment.attendance_status === 'absent';

    if (isAbsent) {
      return {
        backgroundColor: '#fef2f2',
        borderColor: '#fecaca',
        color: '#ef4444',
        borderWidth: '1px',
        borderStyle: 'solid',
      };
    }
    if (isExtra) {
      return {
        backgroundColor: '#ffe4e6',
        borderColor: '#fda4af',
        color: '#881337',
        borderWidth: '1px',
        borderStyle: 'solid',
        fontWeight: 'bold',
      };
    }
    return undefined;
  };

  
  // Update local state if date or assignments change
  // Initial redirect ONLY if no date in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('date')) {
      const lastDate = localStorage.getItem('hrm_last_daily_date');
      if (lastDate && lastDate !== selectedDate) {
        router.push(`/shifts/daily?date=${lastDate}`);
      }
    }
  }, []);

  const handleDateChange = (newDate: string) => {
    if (!newDate) return;
    router.push(`/shifts/daily?date=${newDate}`);
    router.refresh();
  };

  // Update localStorage ONLY on explicit selectedDate change
  useEffect(() => {
    if (selectedDate) {
      localStorage.setItem('hrm_last_daily_date', selectedDate);
    }
  }, [selectedDate]);

  useEffect(() => {
    setIsConfirmed(initialAssignments.some(a => a.is_confirmed));
  }, [initialAssignments]);

  const handleConfirm = async () => {
    setIsConfirming(true);
    const id = toast.loading("Confirmando planificación y generando transporte...");
    try {
      const { success, error, count } = (await confirmPlan(selectedDate)) as any;
      if (success) {
        setIsConfirmed(true);
        toast.success(`Planificación actualizada. Se generaron/verificaron ${count || 0} rutas de transporte.`, { id });

        // Capture screenshot BEFORE router.refresh() to avoid ref becoming null after remount
        const wToastId = toast.loading("Capturando y enviando planificación a WhatsApp...");
        try {
          if (!reportRef.current) throw new Error("Referencia de reporte no disponible");
          const html2canvas = (await import('html2canvas-pro')).default;
          const canvas = await html2canvas(reportRef.current, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            windowWidth: 940,
            ignoreElements: (element) => {
              return element.classList.contains('no-print');
            }
          });
          
          const base64Image = canvas.toDataURL('image/png');
          
          // Send to WhatsApp asynchronously (don't block router refresh)
          sendDailyPlanScreenshotAction(base64Image, selectedDate).then((sendResult) => {
            if (sendResult.success) {
              toast.success("¡Planificación enviada exitosamente a los grupos de WhatsApp!", { id: wToastId });
            } else {
              toast.error(`No se pudo enviar a WhatsApp: ${sendResult.error}`, { id: wToastId });
            }
          }).catch((err: any) => {
            console.error("WhatsApp plan share failed:", err);
            toast.error(`Error al enviar a WhatsApp: ${err.message || String(err)}`, { id: wToastId });
          });
        } catch (err: any) {
          console.error("Screenshot capture failed:", err);
          toast.error(`Error al capturar planificación: ${err.message || String(err)}`, { id: wToastId });
        }

        // Refresh page data after screenshot is captured
        router.refresh();
      } else {
        toast.error(error || "No se pudo confirmar la planificación.", { id });
      }
    } catch (err) {
      toast.error("Error al confirmar la planificación.", { id });
    } finally {
      setIsConfirming(false);
    }
  };

  const handleReset = async () => {
    if (confirm("¿Estás seguro de restaurar la planificación original? Se perderán todos los cambios manuales y cancelaciones de este día.")) {
      const id = toast.loading("Restaurando desde Roster Maestro...");
      const res = await resetDailyPlan(selectedDate);
      if (res.success) {
        toast.success("Planificación restaurada correctamente", { id });
        router.refresh();
      } else {
        toast.error("Error al restaurar", { id });
      }
    }
  };

  // Helper for short names (First Name + First Last Name)
  const formatName = (p: any) => {
    if (!p) return '-';
    const firstName = p.first_name ? p.first_name.split(' ')[0] : '';
    return `${firstName} ${p.last_name_father || ''}`;
  };

  const renderPersonnelName = (a: any) => {
    if (!a?.personnel) return '-';
    return (
      <>
        {a.attendance_status === 'absent' && <span className="inline-block mr-1 text-red-600 select-none">❌</span>}
        {formatName(a.personnel)}
      </>
    );
  };

  // Helper to sort by shift start time
  const sortByTime = (list: any[]) => {
    return [...list].sort((a, b) => {
       const timeA = a.shift?.start_time || '99:99';
       const timeB = b.shift?.start_time || '99:99';
       return timeA.localeCompare(timeB);
    });
  };

  // Helper to group by shift and position
  const groupBySlot = (list: any[]) => {
    const groups: Record<string, any[]> = {};
    list.forEach(a => {
      const key = `${a.shift_id}-${a.position_id}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });
    return Object.values(groups).sort((a, b) => {
      const timeA = a[0].shift?.start_time || '99:99';
      const timeB = b[0].shift?.start_time || '99:99';
      return timeA.localeCompare(timeB);
    });
  };

  // Filter out cancelled assignments for operational report display
  const activeAssignments = initialAssignments.filter(a => a.status !== 'cancelled');

  // GROUPING LOGIC (Mutually Exclusive) using activeAssignments
  const supervisors = sortByTime(activeAssignments.filter(a => a.position?.name.toUpperCase().includes('SUPERVISOR')));
  const supervisorIds = new Set(supervisors.map(s => s.personnel_id));

  const canes = sortByTime(activeAssignments.filter(a => 
    !supervisorIds.has(a.personnel_id) && 
    a.position?.name.toUpperCase().includes('CANES')
  ));
  const canesIds = new Set(canes.map(c => c.personnel_id));

  const cranes = sortByTime(activeAssignments.filter(a => 
    !supervisorIds.has(a.personnel_id) && 
    !canesIds.has(a.personnel_id) &&
    (a.area?.name.toUpperCase().includes('ATREX') || 
     a.area?.name.toUpperCase().includes('BASE') || 
     a.position?.name.toUpperCase().includes('GRUA'))
  ));
  const cranesIds = new Set(cranes.map(c => c.personnel_id));

  const aeropuerto = sortByTime(activeAssignments.filter(a => 
    !supervisorIds.has(a.personnel_id) && 
    !canesIds.has(a.personnel_id) &&
    !cranesIds.has(a.personnel_id) &&
    a.area?.name.toUpperCase().includes('AEROPUERTO')
  ));

  const dhl = sortByTime(activeAssignments.filter(a => a.position?.name.toUpperCase().includes('DHL')));
  const fedex = sortByTime(activeAssignments.filter(a => a.position?.name.toUpperCase().includes('FEDEX')));
  
  const bodegasOthers = sortByTime(activeAssignments.filter(a => 
    a.area?.name.toUpperCase().includes('BODEGA') && 
    !a.position?.name.toUpperCase().includes('DHL') && 
    !a.position?.name.toUpperCase().includes('FEDEX')
  ));

  const handleDeleteAssignment = async (id: string) => {
    if (confirm('¿Estás seguro de CANCELAR esta asignación? (Se mantendrá en el Roster pero se liberará a la persona para hoy)')) {
      const res = await cancelAssignment(id);
      if (res.success) toast.success('Asignación cancelada');
      else toast.error('Error: ' + res.error);
    }
  };

  const handleDeleteRequirement = async (id: string) => {
    if (confirm('¿Estás seguro de eliminar este requerimiento extra?')) {
      const res = await deleteRequirement(id);
      if (res.success) toast.success('Requerimiento eliminado');
      else toast.error('Error: ' + res.error);
    }
  };
  
  const handleUpdateShift = async (assignmentId: string, shiftId: string) => {
    const res = await updateAssignmentShift(assignmentId, shiftId);
    if (res.success) toast.success('Turno actualizado');
    else toast.error('Error al actualizar turno');
  };

  // Corrected BlueExpress filtering (using activeAssignments to respect cancellations)
  const blueExpressRaw = activeAssignments.filter(a => (a.area?.name || '').toUpperCase().includes('BLUEEXPRESS'));

  // Logic to pair Blue Express (Conductor + Ayudante)
  const pairBlueExpress = () => {
    const sorted = sortByTime(blueExpressRaw);
    const pairs: any[] = [];
    const used = new Set();

    sorted.forEach(a => {
      if (used.has(a.id)) return;
      const isConductor = a.position?.name.toUpperCase().includes('CONDUCTOR');
      
      const partner = sorted.find(p => 
        p.id !== a.id && 
        !used.has(p.id) && 
        p.shift_id === a.shift_id &&
        (isConductor ? p.position?.name.toUpperCase().includes('AYUDANTE') : p.position?.name.toUpperCase().includes('CONDUCTOR'))
      );

      if (partner) {
        pairs.push({
          time: `${a.shift?.start_time.substring(0,5)} - ${a.shift?.end_time.substring(0,5)}`,
          conductor: isConductor ? a : partner,
          ayudante: isConductor ? partner : a,
          id: `${a.id}-${partner.id}`
        });
        used.add(a.id);
        used.add(partner.id);
      } else {
        pairs.push({
          time: `${a.shift?.start_time.substring(0,5)} - ${a.shift?.end_time.substring(0,5)}`,
          conductor: isConductor ? a : null,
          ayudante: isConductor ? null : a,
          id: a.id
        });
        used.add(a.id);
      }
    });
    return pairs;
  };

  const bluePairs = pairBlueExpress();
  
  const handleCopyEmailText = () => {
    const dateFormatted = format(parseISO(selectedDate), "EEEE dd-MM-yyyy", { locale: es });
    
    // 1. Group pairs by shift to count "Camiones"
    const shiftSummary: Record<string, { count: number, start: string, end: string }> = {};
    
    bluePairs.forEach(p => {
      if (!p.conductor && !p.ayudante) return;
      
      const startTime = p.conductor?.shift?.start_time?.substring(0, 5) || p.ayudante?.shift?.start_time?.substring(0, 5) || '00:00';
      let endTime = p.conductor?.shift?.end_time?.substring(0, 5) || p.ayudante?.shift?.end_time?.substring(0, 5) || '00:00';
      
      // Special Time Rules for Email
      if (startTime === '08:00') endTime = '18:00';
      if (startTime === '11:00') endTime = '21:00';
      
      const key = `${startTime}-${endTime}`;
      if (!shiftSummary[key]) {
        shiftSummary[key] = { count: 0, start: startTime, end: endTime };
      }
      shiftSummary[key].count++;
    });

    // 2. Build the message
    let message = `${dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1)}\n\n`;
    
    Object.values(shiftSummary).forEach(s => {
      const truckLabel = s.count === 1 ? 'Camión' : 'Camiones';
      const countLabel = s.count < 10 ? `0${s.count}` : s.count;
      message += `${countLabel} ${truckLabel} desde ${s.start} hasta ${s.end}\n`;
    });
    
    message += `\nLos conductores y ayudantes, distribuidos de la siguiente manera:\n\n`;
    
    bluePairs.forEach(p => {
      const startTime = p.conductor?.shift?.start_time?.substring(0, 5) || p.ayudante?.shift?.start_time?.substring(0, 5) || '00:00';
      let endTime = p.conductor?.shift?.end_time?.substring(0, 5) || p.ayudante?.shift?.end_time?.substring(0, 5) || '00:00';
      
      if (startTime === '08:00') endTime = '18:00';
      if (startTime === '11:00') endTime = '21:00';
      
      const condName = p.conductor ? formatName(p.conductor.personnel) : 'PENDIENTE';
      const ayudName = p.ayudante ? formatName(p.ayudante.personnel) : 'PENDIENTE';
      
      message += `${startTime} - ${endTime} ${condName} - ${ayudName}\n`;
    });

    // 3. Add Supervisors section ONLY on Weekends (Saturday=6, Sunday=0)
    const dayOfWeek = parseISO(selectedDate).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      if (supervisors.length > 0) {
        message += `\nSupervisores en turno:\n`;
        supervisors.forEach(s => {
          const shiftName = s.shift?.name.toUpperCase() || '';
          const shiftAbbr = shiftName.includes('AM') ? 'AM' : (shiftName.includes('PM') ? 'PM' : '');
          const phone = s.personnel?.phone || '';
          message += `${shiftAbbr} ${formatName(s.personnel)} ${phone}\n`;
        });
      }
    }

    // 4. Copy to clipboard
    navigator.clipboard.writeText(message);
    toast.success('Texto para correo copiado al portapapeles');
  };

  const handleCopyScreenshot = async () => {
    if (!reportRef.current) return;
    const toastId = toast.loading("Generando captura de la planificación...");
    try {
      const html2canvas = (await import('html2canvas-pro')).default;
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        windowWidth: 940, // Force a desktop-like viewport width so it renders nicely even on mobile screens
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
          const data = [new ClipboardItem({ 'image/png': blob })];
          await navigator.clipboard.write(data);
          toast.success("¡Captura copiada al portapapeles! Puedes pegarla directamente.", { id: toastId });
        } catch (clipErr) {
          console.error("Clipboard copy failed, offering fallback download:", clipErr);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `planificacion_${selectedDate}.png`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success("Captura generada y descargada (copiar al portapapeles no soportado en este navegador).", { id: toastId });
        }
      }, 'image/png');
    } catch (err: any) {
      console.error(err);
      toast.error(`Error al generar la captura: ${err.message || String(err)}`, { id: toastId });
    }
  };

  const handleAddExtra = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.append('date', selectedDate);
    const res = await addExtraRequirement(formData);
    if (res.success) {
      toast.success('Requerimiento extra añadido');
      setIsAddingExtra(false);
    } else {
      toast.error('Error: ' + res.error);
    }
  };

  const loadAvailable = async (positionId: string, shiftId?: string) => {
    setLoadingAvailable(positionId);
    const res = await getAvailableForExtra(selectedDate, positionId, shiftId);
    if (res.data) {
      const getTier = (p: any) => {
        const hasWarning = Array.isArray(p.fatigue_warnings) && p.fatigue_warnings.length > 0;
        if (!p.already_assigned && !hasWarning) return 0;
        if (!p.already_assigned && hasWarning) return 1;
        if (p.already_assigned && !hasWarning) return 2;
        return 3;
      };

      const sortedData = [...res.data].sort((a, b) => {
        const tierA = getTier(a);
        const tierB = getTier(b);
        if (tierA !== tierB) return tierA - tierB;
        const nameA = `${a.first_name || ''} ${a.last_name_father || ''}`.trim();
        const nameB = `${b.first_name || ''} ${b.last_name_father || ''}`.trim();
        return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
      });

      setAvailablePersonnel(prev => ({ ...prev, [positionId]: sortedData }));
    }
    setLoadingAvailable(null);
  };

  const handleAssignExtra = async (posId: string, shiftId: string, areaId: string, persId: string) => {
    const res = await assignExtraPersonnel(selectedDate, shiftId, areaId, posId, persId);
    if (res.success) {
      toast.success('Personal asignado correctamente');
      // Force full browser reload to bypass all Next.js caches
      window.location.reload();
    } else {
      toast.error('Error al asignar: ' + res.error);
    }
  };


  const handlePrint = () => {
    const originalTitle = document.title;
    const formattedDate = format(parseISO(selectedDate), 'dd-MM-yyyy');
    document.title = `Planificación Diaria ${formattedDate}`;
    window.print();
    // Use a small timeout to ensure print dialog has captured the title before restoring
    setTimeout(() => {
      document.title = originalTitle;
    }, 100);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0 !important; /* Forces removal of URL and headers */
          }
          body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          /* Hide layout with maximum priority */
          aside, header, nav, footer, .no-print, [role="navigation"], #notifications-btn {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
            width: 0 !important;
            height: 0 !important;
            position: absolute !important;
            pointer-events: none !important;
          }
          
          html, body {
            height: 297mm !important;
            overflow: hidden !important;
          }
          
          #daily-report-content {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 230mm !important;
            max-height: 297mm !important; /* A4 Height limit */
            overflow: hidden !important;
            margin: 0 !important;
            padding: 10mm 15mm 0mm 15mm !important;
            box-shadow: none !important;
            border: none !important;
            min-height: 0 !important;
            background: white !important;
            visibility: visible !important;
            zoom: 0.9; 
          }
          #daily-report-content * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #print-header {
            display: flex !important;
            flex-direction: row !important;
            justify-content: space-between !important;
            align-items: flex-end !important;
            width: 100% !important;
            border-bottom: 2px solid #0f172a !important;
            padding-bottom: 3mm !important;
            margin-bottom: 6mm !important;
          }
          #print-header h2 {
            font-size: 18px !important;
            line-height: 1.2 !important;
            margin: 0 !important;
            max-width: 60% !important;
          }
          #print-logo-container {
            height: 48px !important;
            max-height: 48px !important;
            display: block !important;
          }
          #print-logo-container img {
            height: 48px !important;
            max-height: 48px !important;
            width: auto !important;
            object-fit: contain !important;
            display: block !important;
          }
          .flex { display: flex !important; }
          .grid { display: grid !important; }
          
          section {
            page-break-inside: avoid;
            margin-bottom: 2mm !important;
          }
        }
      `}</style>

      {/* TOOLBAR */}
      <div className="flex flex-nowrap items-center justify-between gap-2 bg-white p-3 rounded-xl shadow-sm border border-slate-200 no-print overflow-x-auto">
        <div className="flex items-center gap-1 no-print flex-shrink-0">
          <button onClick={() => handleDateChange(format(addDays(parseISO(selectedDate), -1), 'yyyy-MM-dd'))} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"><ChevronLeft className="w-4 h-4" /></button>
          <input 
            type="date" 
            value={selectedDate} 
            onChange={(e) => handleDateChange(e.target.value)}
            className="px-2 py-1.5 bg-white rounded-lg border border-slate-200 font-bold text-slate-800 text-xs shadow-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all cursor-pointer w-[120px]"
          />
          <button onClick={() => handleDateChange(format(addDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'))} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"><ChevronRight className="w-4 h-4" /></button>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {!readOnly && (
            <button 
              onClick={() => setIsAddingExtra(!isAddingExtra)} 
              className="flex flex-col items-center justify-center gap-1 w-28 h-16 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-bold uppercase tracking-tight text-[9px] shadow-sm active:scale-95 text-center leading-tight whitespace-normal p-2"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Dotación Extra</span>
            </button>
          )}

          {!readOnly && (
            <button 
              onClick={handleReset}
              className="flex flex-col items-center justify-center gap-1 w-28 h-16 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all font-bold uppercase tracking-tight text-[9px] shadow-sm text-center leading-tight whitespace-normal p-2"
              title="Borrar cambios manuales y volver al Roster Maestro"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar Original</span>
            </button>
          )}

          {isConfirmed && (
            <>
              <button 
                onClick={handleCopyEmailText} 
                className="flex flex-col items-center justify-center gap-1 w-28 h-16 bg-orange-100 text-orange-700 rounded-xl hover:bg-orange-200 transition-all font-bold uppercase tracking-tight text-[9px] shadow-sm text-center leading-tight whitespace-normal p-2"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar para Correo</span>
              </button>
              <button 
                onClick={handleCopyScreenshot} 
                className="flex flex-col items-center justify-center gap-1 w-28 h-16 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-200 transition-all font-bold uppercase tracking-tight text-[9px] shadow-sm text-center leading-tight whitespace-normal p-2"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Copiar Captura</span>
              </button>
            </>
          )}

          <button 
            onClick={handlePrint} 
            className="flex flex-col items-center justify-center gap-1 w-28 h-16 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 font-bold uppercase tracking-tight text-[9px] text-center leading-tight whitespace-normal p-2"
          >
            <Download className="w-3.5 h-3.5" /> 
            <span>Exportar Reporte PDF</span>
          </button>
          
          {!readOnly && (
            <button 
              onClick={handleConfirm} 
              disabled={isConfirming} 
              className={`flex flex-col items-center justify-center gap-1 w-28 h-16 rounded-xl shadow-lg font-bold uppercase tracking-tight text-[9px] transition-all active:scale-95 disabled:opacity-50 text-center leading-tight whitespace-normal p-2 ${
                isConfirmed 
                  ? 'bg-white text-emerald-700 border-2 border-emerald-500 hover:bg-emerald-50' 
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200'
              }`}
            >
              {isConfirming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              <span>{isConfirmed ? 'Actualizar Sincronización' : 'Confirmar Planificación'}</span>
            </button>
          )}
        </div>
      </div>

      {/* ADD EXTRA FORM */}
      {isAddingExtra && (
        <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100 shadow-inner animate-in slide-in-from-top duration-300 no-print">
          <h3 className="text-lg font-semibold text-indigo-900 mb-4 flex items-center gap-2"><UserPlus className="w-5 h-5" />Solicitar Dotación Adicional</h3>
          <form onSubmit={handleAddExtra} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div><label className="block text-xs font-medium text-indigo-700 uppercase mb-1">Área</label><select name="area_id" className="w-full p-2 bg-white rounded-md border border-indigo-200">{areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-indigo-700 uppercase mb-1">Cargo</label><select name="position_id" className="w-full p-2 bg-white rounded-md border border-indigo-200">{positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-indigo-700 uppercase mb-1">Horario</label><select name="shift_id" className="w-full p-2 bg-white rounded-md border border-indigo-200">{shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.start_time.substring(0,5)})</option>)}</select></div>
            <div className="flex items-end gap-2"><div className="flex-1"><label className="block text-xs font-medium text-indigo-700 uppercase mb-1">Cantidad</label><input type="number" name="count" defaultValue={1} min={1} className="w-full p-2 bg-white rounded-md border border-indigo-200" /></div><button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 font-medium">Agregar</button></div>
          </form>
        </div>
      )}

      {/* REPORT */}
      <div id="daily-report-content" ref={reportRef} className="bg-white p-5 md:p-6 rounded-xl shadow-xl border border-slate-100 text-slate-900 font-sans mx-auto w-full max-w-[920px] box-border">
        <div id="print-header" className="border-b-2 border-slate-900 pb-2 mb-4 flex justify-between items-end">
          <h2 className="text-lg font-black tracking-tight uppercase text-slate-900 leading-tight">
            Programación Operativa <br />
            <span className="text-slate-500 text-sm font-bold">
              {format(parseISO(selectedDate), "EEEE d 'de' MMMM 'de' yyyy", { locale: es })}
            </span>
          </h2>
          <div id="print-logo-container" className="h-10 overflow-hidden rounded-lg">
             <img src="/logo.jpg" alt="Minerquim Logo" className="h-full object-contain" />
          </div>
        </div>

        {/* SECTION: SUPERVISOR */}
        <section className="mb-3.5">
          <h3 className="text-xs font-bold border-b border-slate-300 pb-1 mb-1.5 flex items-center gap-1.5 text-indigo-700 uppercase tracking-wider"><ShieldCheck className="w-3.5 h-3.5" />Supervisor</h3>
          <div className="space-y-1 pl-2">
            {groupBySlot(supervisors).map((group, idx) => (
              <div key={idx} className="flex flex-wrap items-start gap-x-4 gap-y-1">
                <div className="w-[110px] flex-shrink-0 font-mono text-[11px] text-slate-500 pt-0.5">
                  {group[0].shift?.start_time.substring(0,5)} - {group[0].shift?.end_time.substring(0,5)}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 flex-1">
                  {group.map(a => (
                    <div key={a.id} className="flex items-center gap-1 group">
                      <span 
                        onClick={() => handleOpenEdit(a)}
                        className={`font-bold uppercase text-[11.5px] ${getPersonnelStyles(a)}`}
                        style={getPersonnelInlineStyle(a)}
                        title="Pincha para cambiar turno o cargo"
                      >
                        {renderPersonnelName(a)}
                      </span>
                      {!readOnly && (
                        <button onClick={() => handleDeleteAssignment(a.id)} className="opacity-0 group-hover:opacity-100 text-red-400 p-0.5 no-print" title="Cancelar asignación">
                          <AlertTriangle className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION: CANES */}
        <section className="mb-3.5">
          <h3 className="text-xs font-bold border-b border-slate-300 pb-1 mb-1.5 flex items-center gap-1.5 text-amber-700 uppercase tracking-wider"><Users className="w-3.5 h-3.5" />Canes</h3>
          <div className="space-y-1 pl-2">
            {groupBySlot(canes).map((group, idx) => (
              <div key={idx} className="flex flex-wrap items-start gap-x-4 gap-y-1">
                <div className="w-[110px] flex-shrink-0 font-mono text-[11px] text-slate-500 pt-0.5">
                  {group[0].shift?.start_time.substring(0,5)} - {group[0].shift?.end_time.substring(0,5)}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 flex-1">
                  {group.map(a => (
                    <div key={a.id} className="flex items-center gap-1 group">
                      <span 
                        onClick={() => handleOpenEdit(a)}
                        className={`font-bold uppercase text-[11.5px] ${getPersonnelStyles(a)}`}
                        style={getPersonnelInlineStyle(a)}
                        title="Pincha para cambiar turno o cargo"
                      >
                        {renderPersonnelName(a)}
                      </span>
                      {!readOnly && (
                        <button onClick={() => handleDeleteAssignment(a.id)} className="opacity-0 group-hover:opacity-100 text-red-400 p-0.5 no-print" title="Cancelar asignación">
                          <AlertTriangle className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION: GRÚAS / ATREX / BASE */}
        <section className="mb-3.5">
          <h3 className="text-xs font-bold border-b border-slate-300 pb-1 mb-1.5 flex items-center gap-1.5 text-emerald-700 uppercase tracking-wider"><Dna className="w-3.5 h-3.5" />Grúas / Atrex / Base</h3>
          <div className="space-y-1.5 pl-2">
            {groupBySlot(cranes).map((group, idx) => (
              <div key={idx} className="flex flex-wrap items-start gap-x-4 gap-y-1">
                <div className="w-[110px] flex-shrink-0 flex flex-col pt-0.5">
                  <span className="font-mono text-[11px] text-slate-500 leading-none">{group[0].shift?.start_time.substring(0,5)} - {group[0].shift?.end_time.substring(0,5)}</span>
                  <span className="text-[8px] text-slate-400 uppercase font-bold">{group[0].position?.name}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 flex-1">
                  {group.map(a => (
                    <div key={a.id} className="flex flex-col relative group">
                      <div className="flex items-center gap-1">
                        <span 
                          onClick={() => handleOpenEdit(a)}
                          className={`font-bold uppercase text-[11.5px] leading-tight ${getPersonnelStyles(a)}`}
                          style={getPersonnelInlineStyle(a)}
                          title="Pincha para cambiar turno o cargo"
                        >
                          {renderPersonnelName(a)}
                        </span>
                        <button onClick={() => handleDeleteAssignment(a.id)} className="opacity-0 group-hover:opacity-100 text-red-400 p-0.5 no-print" title="Cancelar asignación"><AlertTriangle className="w-3 h-3" /></button>
                      </div>
                      <span className="text-[7px] text-slate-300 uppercase leading-none">{a.area?.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION: AEROPUERTO */}
        <section className="mb-3.5">
          <h3 className="text-xs font-bold border-b border-slate-300 pb-1 mb-1.5 flex items-center gap-1.5 text-blue-700 uppercase tracking-wider"><Plane className="w-3.5 h-3.5" />Aeropuerto</h3>
          <div className="space-y-1.5 pl-2">
            {groupBySlot(aeropuerto).map((group, idx) => (
              <div key={idx} className="flex flex-wrap items-start gap-x-4 gap-y-1">
                <div className="w-[110px] flex-shrink-0 flex flex-col pt-0.5">
                  <span className="font-mono text-[11px] text-slate-500 leading-none">{group[0].shift?.start_time.substring(0,5)} - {group[0].shift?.end_time.substring(0,5)}</span>
                  <span className="text-[8px] text-slate-400 uppercase font-bold">{group[0].position?.name}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 flex-1">
                  {group.map(a => (
                    <div key={a.id} className="flex items-center gap-1 group">
                      <span 
                        onClick={() => handleOpenEdit(a)}
                        className={`font-bold uppercase text-[11.5px] ${getPersonnelStyles(a)}`}
                        style={getPersonnelInlineStyle(a)}
                        title="Pincha para cambiar turno o cargo"
                      >
                        {renderPersonnelName(a)}
                      </span>
                      <button onClick={() => handleDeleteAssignment(a.id)} className="opacity-0 group-hover:opacity-100 text-red-400 p-0.5 no-print" title="Cancelar asignación"><AlertTriangle className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION: BODEGAS */}
        <section className="mb-3.5">
          <h3 className="text-xs font-bold border-b border-slate-300 pb-1 mb-1.5 flex items-center gap-1.5 text-slate-800 uppercase tracking-wider"><Warehouse className="w-3.5 h-3.5" />Bodegas</h3>
          <div className="space-y-2.5 pl-2 mt-1.5">
            {/* DHL Grouping */}
            {dhl.length > 0 && (
              <div className="space-y-1">
                 <div className="flex items-center gap-2">
                   <span className="bg-slate-900 text-white text-[9px] font-black px-1.5 py-0.5 rounded">DHL</span>
                 </div>
                 <div className="flex flex-wrap gap-x-5 gap-y-2 pl-1">
                    {dhl.map(a => (
                      <div key={a.id} className="flex flex-col relative group min-w-[120px]">
                        <span 
                          onClick={() => handleOpenEdit(a)}
                          className={`font-bold uppercase text-[11.5px] leading-tight ${getPersonnelStyles(a)}`}
                          style={getPersonnelInlineStyle(a)}
                          title="Pincha para cambiar turno o cargo"
                        >
                          {renderPersonnelName(a)}
                        </span>
                        <span className="font-mono text-[8.5px] text-slate-400 leading-tight pl-0.5 mt-0.5">
                          {a.shift?.start_time.substring(0,5)} - {a.shift?.end_time.substring(0,5)}
                        </span>
                        {!readOnly && (
                          <select 
                            className="text-[8.5px] bg-slate-50 border-none p-0 h-3.5 w-24 text-slate-500 font-mono focus:ring-0 cursor-pointer no-print mt-0.5"
                            value={a.shift_id}
                            onChange={(e) => handleUpdateShift(a.id, e.target.value)}
                          >
                            {shifts.map(s => (
                              <option key={s.id} value={s.id}>{s.name} ({s.start_time.substring(0,5)})</option>
                            ))}
                          </select>
                        )}
                        <button onClick={() => handleDeleteAssignment(a.id)} className="absolute -top-1 -right-2 opacity-0 group-hover:opacity-100 text-red-400 p-1 no-print" title="Cancelar asignación">
                           <AlertTriangle className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                 </div>
              </div>
            )}
            {/* FEDEX Grouping */}
            {fedex.length > 0 && (
              <div className="space-y-1">
                 <div className="flex items-center gap-2">
                   <span className="bg-slate-900 text-white text-[9px] font-black px-1.5 py-0.5 rounded">FEDEX</span>
                 </div>
                 <div className="flex flex-wrap gap-x-5 gap-y-2 pl-1">
                    {fedex.map(a => (
                      <div key={a.id} className="flex flex-col relative group min-w-[120px]">
                        <span 
                          onClick={() => handleOpenEdit(a)}
                          className={`font-bold uppercase text-[11.5px] leading-tight ${getPersonnelStyles(a)}`}
                          style={getPersonnelInlineStyle(a)}
                          title="Pincha para cambiar turno o cargo"
                        >
                          {renderPersonnelName(a)}
                        </span>
                        <span className="font-mono text-[8.5px] text-slate-400 leading-tight pl-0.5 mt-0.5">
                          {a.shift?.start_time.substring(0,5)} - {a.shift?.end_time.substring(0,5)}
                        </span>
                        {!readOnly && (
                          <select 
                            className="text-[8.5px] bg-slate-50 border-none p-0 h-3.5 w-24 text-slate-500 font-mono focus:ring-0 cursor-pointer no-print mt-0.5"
                            value={a.shift_id}
                            onChange={(e) => handleUpdateShift(a.id, e.target.value)}
                          >
                            {shifts.map(s => (
                              <option key={s.id} value={s.id}>{s.name} ({s.start_time.substring(0,5)})</option>
                            ))}
                          </select>
                        )}
                        <button onClick={() => handleDeleteAssignment(a.id)} className="absolute -top-1 -right-2 opacity-0 group-hover:opacity-100 text-red-400 p-1 no-print" title="Cancelar asignación">
                           <AlertTriangle className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                 </div>
              </div>
            )}
            {/* OTHERS */}
            {bodegasOthers.length > 0 && (
              <div className="space-y-1">
                 <div className="flex items-center gap-2">
                   <span className="bg-yellow-400 text-yellow-900 text-[9px] font-black px-1.5 py-0.5 rounded uppercase">OTROS BODEGA</span>
                 </div>
                 <div className="flex flex-wrap gap-x-5 gap-y-2 pl-1">
                    {bodegasOthers.map(a => (
                      <div key={a.id} className="flex flex-col min-w-[120px]">
                        <span 
                          onClick={() => handleOpenEdit(a)}
                          className={`font-bold uppercase text-[11.5px] leading-tight ${getPersonnelStyles(a)}`}
                          style={getPersonnelInlineStyle(a)}
                          title="Pincha para cambiar turno o cargo"
                        >
                          {renderPersonnelName(a)}
                        </span>
                        <span className="font-mono text-[8.5px] text-slate-400 leading-tight pl-0.5 mt-0.5">{a.shift?.start_time.substring(0,5)} - {a.shift?.end_time.substring(0,5)}</span>
                      </div>
                    ))}
                 </div>
              </div>
            )}
          </div>
        </section>

        {/* SECTION: BLUE EXPRESS */}
        <section className="mb-3.5">
          <h3 className="text-xs font-bold border-b border-slate-300 pb-1 mb-1.5 flex items-center gap-1.5 text-indigo-800 uppercase tracking-wider"><Truck className="w-3.5 h-3.5" />Transporte Blue Express</h3>
          <table className="w-full text-left mt-1 border-collapse">
            <thead>
              <tr className="text-[9px] uppercase text-slate-400 border-b border-slate-200">
                <th className="py-0.5 w-[110px]">Horario</th>
                <th className="py-0.5 w-[44%]">Conductor</th>
                <th className="py-0.5 w-[44%]">Ayudante</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bluePairs.map(pair => (
                <tr key={pair.id} className="group">
                  <td className="py-0.5 font-mono text-[10px] text-slate-500">{pair.time}</td>
                  <td className="py-0.5 font-bold uppercase text-[11.5px] relative">
                    <div className="flex flex-col gap-0.5">
                      {pair.conductor ? (
                        <span 
                          onClick={() => handleOpenEdit(pair.conductor)}
                          className={getPersonnelStyles(pair.conductor)}
                          style={getPersonnelInlineStyle(pair.conductor)}
                          title="Pincha para cambiar turno o cargo"
                        >
                          {renderPersonnelName(pair.conductor)}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-normal">-</span>
                      )}
                      {pair.conductor && !readOnly && (
                        <select 
                          className="text-[8.5px] bg-slate-50 border-none p-0 h-3.5 w-24 text-slate-500 font-mono focus:ring-0 cursor-pointer no-print"
                          value={pair.conductor.shift_id}
                          onChange={(e) => handleUpdateShift(pair.conductor.id, e.target.value)}
                        >
                          {shifts.map(s => (
                            <option key={s.id} value={s.id}>{s.name} ({s.start_time.substring(0,5)})</option>
                          ))}
                        </select>
                      )}
                    </div>
                    {pair.conductor && !readOnly && (
                      <button onClick={() => handleDeleteAssignment(pair.conductor.id)} className="absolute right-2 top-0.5 opacity-0 group-hover:opacity-100 text-red-400 no-print" title="Cancelar asignación">
                         <AlertTriangle className="w-3 h-3" />
                      </button>
                    )}
                  </td>
                  <td className="py-0.5 font-bold uppercase text-[11.5px] relative">
                    <div className="flex flex-col gap-0.5">
                      {pair.ayudante ? (
                        <span 
                          onClick={() => handleOpenEdit(pair.ayudante)}
                          className={getPersonnelStyles(pair.ayudante)}
                          style={getPersonnelInlineStyle(pair.ayudante)}
                          title="Pincha para cambiar turno o cargo"
                        >
                          {renderPersonnelName(pair.ayudante)}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-normal">-</span>
                      )}
                      {pair.ayudante && !readOnly && (
                        <select 
                          className="text-[8.5px] bg-slate-50 border-none p-0 h-3.5 w-24 text-slate-500 font-mono focus:ring-0 cursor-pointer no-print"
                          value={pair.ayudante.shift_id}
                          onChange={(e) => handleUpdateShift(pair.ayudante.id, e.target.value)}
                        >
                          {shifts.map(s => (
                            <option key={s.id} value={s.id}>{s.name} ({s.start_time.substring(0,5)})</option>
                          ))}
                        </select>
                      )}
                    </div>
                    {pair.ayudante && !readOnly && (
                      <button onClick={() => handleDeleteAssignment(pair.ayudante.id)} className="absolute right-2 top-0.5 opacity-0 group-hover:opacity-100 text-red-400 no-print" title="Cancelar asignación">
                         <AlertTriangle className="w-3 h-3" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {bluePairs.length === 0 && <p className="text-slate-400 italic text-center py-2 text-xs">No hay rutas planificadas para hoy</p>}
        </section>

        {/* EXTRA SLOTS */}
        {initialRequirements.filter(r => r.is_extra).map(req => {
          const filled = (req as any).filled_count ?? activeAssignments.filter(a => (a as any).is_extra && a.shift_id === req.shift_id && a.position_id === req.position_id && a.area_id === req.area_id).length;
          const left = req.required_count - filled;
          if (left <= 0) return null;
          return (
            <div key={req.id} className="mt-4 p-3 border-2 border-dashed border-indigo-200 rounded-xl bg-indigo-50/20 no-print">
               <div className="flex items-center justify-between mb-1.5">
                  <div className="text-indigo-800 font-bold text-xs">DOTACIÓN EXTRA: {req.area?.name} - {req.position?.name} ({req.shift?.name})</div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full uppercase">{left} pendientes</span>
                    {!readOnly && (
                      <button onClick={() => handleDeleteRequirement(req.id)} className="text-red-400 hover:text-red-600 p-1" title="Eliminar requerimiento completo">
                        <AlertTriangle className="w-3 h-3" />
                      </button>
                    )}
                  </div>
               </div>
               {!readOnly && (
                  <div className="grid grid-cols-2 gap-3">
                    {Array.from({ length: left }).map((_, i) => (
                      <select key={i} className="w-full p-1.5 bg-white rounded border border-indigo-200 text-xs font-bold uppercase" onFocus={() => loadAvailable(req.position_id, req.shift_id)} onChange={(e) => handleAssignExtra(req.position_id, req.shift_id, req.area_id, e.target.value)} defaultValue="">
                        <option value="" disabled>Seleccionar libre...</option>
                        {loadingAvailable === req.position_id ? (
                          <option>Cargando...</option>
                        ) : (
                          (availablePersonnel[req.position_id] || []).map(p => {
                            const displayName = `${p.first_name} ${p.last_name_father}${
                              p.already_assigned ? ` (EN TURNO: ${p.current_shift_name})` : ''
                            }${p.fatigue_warnings.length > 0 ? ' (⚠️)' : ''}`;

                            return (
                              <option 
                                key={p.id} 
                                value={p.id}
                                style={p.already_assigned ? { color: '#d97706', fontWeight: 'bold' } : undefined}
                              >
                                {displayName}
                              </option>
                            );
                          })
                        )}
                      </select>
                    ))}
                  </div>
               )}
            </div>
          );
        })}

        <div className="mt-4 text-[8.5px] text-slate-300 text-right uppercase tracking-widest border-t pt-1.5">Reporte generado HRM — {format(new Date(), "yyyy-MM-dd HH:mm")}</div>
      </div>

      {/* POPUP DE EDICIÓN RÁPIDA DE ASIGNACIÓN */}
      <Dialog open={!!editingAssignment} onOpenChange={(open) => { if (!open) setEditingAssignment(null); }}>
        <DialogContent className="max-w-md bg-white p-6 rounded-xl shadow-xl border border-slate-200">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-600" />
              Cambio de Turno / Cargo
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Modifica el turno o cargo asignado. Al guardar, quedará validado y publicado automáticamente (sin envío de WhatsApp).
            </DialogDescription>
          </DialogHeader>

          {editingAssignment && (
            <div className="space-y-4 py-3">
              {/* Información del trabajador */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Trabajador</div>
                <div className="text-base font-bold text-slate-800 uppercase mt-0.5">
                  {editingAssignment.personnel?.first_name} {editingAssignment.personnel?.last_name_father} {editingAssignment.personnel?.last_name_mother || ''}
                </div>
                <div className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                  <span><strong className="text-slate-700">RUT:</strong> {editingAssignment.personnel?.rut || '-'}</span>
                  <span><strong className="text-slate-700">Cargo actual:</strong> {editingAssignment.position?.name || '-'}</span>
                </div>
              </div>

              {/* Selector de Turno */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Nuevo Turno</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editShiftId}
                  onChange={(e) => setEditShiftId(e.target.value)}
                >
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.start_time.substring(0, 5)} - {s.end_time.substring(0, 5)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Selector de Cargo (Posición) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Nuevo Cargo (Posición)</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editPositionId}
                  onChange={(e) => setEditPositionId(e.target.value)}
                >
                  {availableWorkerPositions.map((p) => {
                    const area = areas.find(a => a.id === p.area_id);
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} {area ? `— ${area.name}` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          )}

          <DialogFooter className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button
              variant="outline"
              onClick={() => setEditingAssignment(null)}
              disabled={isSavingEdit}
            >
              Cancelar
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              onClick={handleSaveEdit}
              disabled={isSavingEdit}
            >
              {isSavingEdit ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Aceptar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

