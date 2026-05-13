'use client';

import React, { useState, useTransition, useMemo, useEffect, useRef } from 'react';
import { updateTransportObservation, updateTransportMobilization, updateArrivalStatus } from '../../actions';
import { Badge } from '@/components/ui/badge';
import { 
  Bus, 
  Car, 
  MessageSquare, 
  Search,
  CalendarDays,
  ChevronRight,
  Briefcase,
  Clock,
  User,
  Truck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Hash,
  HelpCircle,
  MapPin
} from 'lucide-react';
import { toast } from 'sonner';
import { format, addDays, subDays } from 'date-fns';
import { useRouter } from 'next/navigation';
import { es } from 'date-fns/locale';

export default function TransportClient({ initialData }: { initialData: any }) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [isPending, startTransition] = useTransition();
  const [searchTerm, setSearchTerm] = useState('');
  
  // Anti-Reversion Shield: Stores local changes to override stale server data
  const localOverrides = useRef<Record<string, any>>({});

  // When server data arrives, merge it with our local overrides
  useEffect(() => {
    const mergedTransport = initialData.transport.map((t: any) => {
      const key = t.assignment_id ? String(t.assignment_id) : `p_${t.personnel_id}`;
      if (localOverrides.current[key]) {
        return { ...t, ...localOverrides.current[key] };
      }
      return t;
    });

    // Also add records that might not be in initialData yet
    const existingKeys = new Set(mergedTransport.map((t: any) => t.assignment_id ? String(t.assignment_id) : `p_${t.personnel_id}`));
    Object.keys(localOverrides.current).forEach(key => {
      if (!existingKeys.has(key)) {
        mergedTransport.push(localOverrides.current[key]);
      }
    });

    setData({ ...initialData, transport: mergedTransport });
  }, [initialData]);

  const isWithinWindow = (timeStr: string) => {
    if (!timeStr) return false;
    const hour = parseInt(timeStr.split(':')[0], 10);
    const minute = parseInt(timeStr.split(':')[1], 10);
    const timeVal = hour * 100 + minute;
    return (timeVal >= 2300 || timeVal <= 630);
  };

  const transportPersonnel = useMemo(() => {
    const requests = data.transport || [];
    const assignments = data.assignments || [];
    
    const reqMap: Record<string, any> = {};
    requests.forEach((r: any) => { 
      if (r.type === 'ENTRADA') {
        const key = r.assignment_id ? String(r.assignment_id) : `p_${r.personnel_id}`;
        reqMap[key] = r; 
      }
    });

    return assignments.filter((asg: any) => {
      const shift = asg.shift;
      if (!shift) return false;
      return isWithinWindow(shift.start_time) || isWithinWindow(shift.end_time);
    }).map((asg: any) => {
      const transportData = reqMap[String(asg.id)] || reqMap[`p_${asg.personnel_id}`] || { 
        transport_type: 'PENDIENTE', 
        observations: '',
        arrival_status: null
      };

      return { ...asg, transport_data: transportData };
    });
  }, [data.transport, data.assignments]);

  const sortedData = useMemo(() => {
    let filtered = transportPersonnel.filter((p: any) => {
      const fullName = `${p.personnel?.first_name} ${p.personnel?.last_name_father}`.toLowerCase();
      return fullName.includes(searchTerm.toLowerCase());
    });

    return filtered.sort((a: any, b: any) => {
      const timeA = a.shift?.start_time || '00:00';
      const timeB = b.shift?.start_time || '00:00';
      return timeA.localeCompare(timeB);
    });
  }, [transportPersonnel, searchTerm]);

  const stats = useMemo(() => {
    const empresaCount = transportPersonnel.filter((p: any) => p.transport_data.transport_type === 'REQUERIDO' || p.transport_data.transport_type === 'Empresa').length;
    const propioCount = transportPersonnel.filter((p: any) => p.transport_data.transport_type === 'PROPIO' || p.transport_data.transport_type === 'Propio').length;
    const pendienteCount = transportPersonnel.filter((p: any) => p.transport_data.transport_type === 'PENDIENTE').length;
    return { total: transportPersonnel.length, empresaCount, propioCount, pendienteCount };
  }, [transportPersonnel]);

  const handleSetMobilization = (personnelId: string, type: 'Empresa' | 'Propio', assignmentId: any) => {
    const dbType = type === 'Empresa' ? 'REQUERIDO' : 'PROPIO';
    const key = String(assignmentId);

    // 1. Record override
    localOverrides.current[key] = { 
      personnel_id: personnelId, 
      assignment_id: assignmentId, 
      date: data.date, 
      type: 'ENTRADA', 
      transport_type: dbType, 
      updated_by_name: 'Tú' 
    };

    // 2. Update local state immediately
    setData((prev: any) => {
      const newTransport = [
        ...prev.transport.filter((t: any) => String(t.assignment_id) !== key),
        localOverrides.current[key]
      ];
      return { ...prev, transport: newTransport };
    });

    startTransition(async () => {
      const res = await updateTransportMobilization(personnelId, data.date, dbType, String(assignmentId));
      if (res.success) {
        let msg = `Asignado: ${type}`;
        if (dbType === 'PROPIO' && res.whatsapp) {
          const { group, worker, groupError, workerError } = res.whatsapp;
          if (group && worker) {
            msg += ' | WhatsApp enviado a Grupo y Trabajador ✅';
          } else if (group) {
            msg += ` | Enviado a Grupo, falló Trabajador ⚠️ (${workerError || 'Error desconocido'})`;
          } else if (worker) {
            msg += ` | Enviado a Trabajador, falló Grupo ⚠️ (${groupError || 'Error desconocido'})`;
          } else {
            const errors = [];
            if (groupError) errors.push(`Grupo: ${groupError}`);
            if (workerError) errors.push(`Trabajador: ${workerError}`);
            
            const errorMsg = errors.join(' | ');
            if (errorMsg) {
              msg += ` | Fallaron ambos WhatsApp ❌ (${errorMsg})`;
            } else if (res.whatsapp.debug) {
              msg += ` | Error de servicio ❌ (${res.whatsapp.debug})`;
            } else {
              msg += ' | Fallaron ambos WhatsApp ❌ (Error de servicio)';
            }
          }
        }
        toast.success(msg);
      } else {
        delete localOverrides.current[key]; // Remove override on error
        toast.error(`Error: ${res.error || "No se pudo asignar"}`);
      }
    });
  };

  const handleUpdateArrival = (personnelId: string, status: string) => {
    // Update state immediately
    setData((prev: any) => ({
      ...prev,
      transport: prev.transport.map((t: any) => t.personnel_id === personnelId ? { ...t, arrival_status: status } : t)
    }));

    startTransition(async () => {
      const res = await updateArrivalStatus(personnelId, data.date, status);
      if (res.success) {
        toast.success(`Estado: ${status}`);
      }
    });
  };

  const handleUpdateObs = (personnelId: string, obs: string) => {
    startTransition(async () => {
      const res = await updateTransportObservation(personnelId, data.date, obs);
      if (res.success) {
        toast.success('Observación guardada');
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24 font-sans">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm p-4 space-y-4">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <h1 className="text-2xl font-black text-slate-900 tracking-tighter flex items-center gap-2">
            <Truck className="h-7 w-7 text-indigo-600" />
            Transporte
          </h1>
          <div className="flex items-center gap-1">
             <button 
              onClick={() => {
                const newDate = format(subDays(new Date(data.date + 'T12:00:00'), 1), 'yyyy-MM-dd');
                router.push(`/supervisor/transport?date=${newDate}`);
              }}
              className="p-1.5 hover:bg-slate-100 rounded-full transition-colors"
            >
              <ChevronRight className="h-4 w-4 text-slate-400 rotate-180" />
            </button>
            <div className="relative">
              <div className="flex items-center gap-2 bg-indigo-50 px-3 py-2 rounded-2xl border border-indigo-100 shadow-inner">
                <CalendarDays className="h-4 w-4 text-indigo-600" />
                <span className="text-[10px] font-black text-indigo-900 uppercase">
                  {format(new Date(data.date + 'T12:00:00'), "eee d 'MMM'", { locale: es })}
                </span>
              </div>
              <input 
                type="date" 
                value={data.date} 
                onChange={(e) => router.push(`/supervisor/transport?date=${e.target.value}`)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>
            <button 
              onClick={() => {
                const newDate = format(addDays(new Date(data.date + 'T12:00:00'), 1), 'yyyy-MM-dd');
                router.push(`/supervisor/transport?date=${newDate}`);
              }}
              className="p-1.5 hover:bg-slate-100 rounded-full transition-colors"
            >
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-2 max-w-lg mx-auto">
          <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-lg shadow-indigo-100 flex flex-col items-center">
            <Bus className="h-4 w-4 text-white/70 mb-1" />
            <p className="text-[14px] font-black text-white leading-none">{stats.empresaCount}</p>
            <p className="text-[7px] font-black text-white/50 uppercase tracking-widest mt-1">Empresa</p>
          </div>
          <div className="bg-amber-500 p-2.5 rounded-2xl shadow-lg shadow-amber-100 flex flex-col items-center">
            <Car className="h-4 w-4 text-white/70 mb-1" />
            <p className="text-[14px] font-black text-white leading-none">{stats.propioCount}</p>
            <p className="text-[7px] font-black text-white/50 uppercase tracking-widest mt-1">Propio</p>
          </div>
          <div className="bg-white p-2.5 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center">
            <HelpCircle className="h-4 w-4 text-slate-300 mb-1" />
            <p className="text-[14px] font-black text-slate-900 leading-none">{stats.pendienteCount}</p>
            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-1">Pendiente</p>
          </div>
        </div>

        <div className="relative max-w-lg mx-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input type="text" placeholder="Buscar por nombre..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-slate-50 border-none text-sm font-bold focus:ring-2 focus:ring-indigo-600 outline-none placeholder:text-slate-300" />
        </div>
      </div>

      {/* List */}
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {sortedData.length > 0 ? (
          sortedData.map((p: any) => (
            <div key={p.id} className={`bg-white p-5 rounded-[2.5rem] border-2 shadow-sm space-y-5 transition-all relative
              ${p.transport_data.transport_type === 'PENDIENTE' ? 'border-dashed border-slate-200' : 
                (p.transport_data.transport_type === 'REQUERIDO' || p.transport_data.transport_type === 'Empresa') ? 'border-indigo-100' : 'border-amber-100'}
            `}>
              {/* ... existing card content ... */}
              <div className="absolute top-0 right-0">
                <div className="bg-slate-900 text-white text-[11px] font-black px-5 py-2 rounded-bl-[1.5rem] flex items-center gap-2 shadow-xl">
                  <Clock className="h-3.5 w-3.5 text-orange-400" />
                  {p.shift?.start_time?.substring(0,5)}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`h-14 w-14 rounded-3xl flex items-center justify-center transition-all duration-500
                    ${(p.transport_data.transport_type === 'REQUERIDO' || p.transport_data.transport_type === 'Empresa') ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200 scale-110' : 
                      (p.transport_data.transport_type === 'PROPIO' || p.transport_data.transport_type === 'Propio') ? 'bg-amber-500 text-white shadow-xl shadow-amber-200 scale-110' : 
                      'bg-slate-50 text-slate-300 border border-slate-100'}
                  `}>
                    {(p.transport_data.transport_type === 'PROPIO' || p.transport_data.transport_type === 'Propio') ? <Car className="h-7 w-7" /> : <Bus className="h-7 w-7" />}
                  </div>
                  <div>
                    <p className="text-[13px] font-black text-slate-900 uppercase tracking-tight leading-none mb-1.5">
                      {p.personnel?.first_name} {p.personnel?.last_name_father}
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[8px] font-black uppercase py-0 px-2 border-slate-200 text-slate-400 rounded-md">
                        {p.area?.name}
                      </Badge>
                      <span className={`text-[9px] font-black uppercase tracking-widest
                        ${p.transport_data.transport_type === 'PENDIENTE' ? 'text-orange-500 animate-pulse' : 'text-slate-500'}
                      `}>
                        {(p.transport_data.transport_type === 'REQUERIDO' || p.transport_data.transport_type === 'Empresa') ? 'EMPRESA' : 
                         (p.transport_data.transport_type === 'PROPIO' || p.transport_data.transport_type === 'Propio') ? 'PROPIO' : 'PENDIENTE'}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col gap-2">
                  <button 
                    disabled={isPending}
                    onClick={() => handleSetMobilization(p.personnel_id, 'Empresa', p.id)} 
                    className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-all active:scale-90 border-2
                      ${(p.transport_data.transport_type === 'REQUERIDO' || p.transport_data.transport_type === 'Empresa') 
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200' 
                        : 'bg-white border-indigo-50 text-indigo-200 hover:border-indigo-200'}
                    `}
                  >
                    <Bus className="h-6 w-6" />
                  </button>
                  <button 
                    disabled={isPending}
                    onClick={() => handleSetMobilization(p.personnel_id, 'Propio', p.id)} 
                    className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-all active:scale-90 border-2
                      ${(p.transport_data.transport_type === 'PROPIO' || p.transport_data.transport_type === 'Propio') 
                        ? 'bg-amber-500 border-amber-600 text-white shadow-lg shadow-amber-200' 
                        : 'bg-white border-amber-50 text-amber-200 hover:border-amber-200'}
                    `}
                  >
                    <Car className="h-6 w-6" />
                  </button>
                </div>
              </div>

              {(p.transport_data.transport_type === 'REQUERIDO' || p.transport_data.transport_type === 'Empresa') && (p.transport_data.reservation_number || p.transport_data.pickup_time) && (
                <div className="bg-indigo-50 rounded-[1.5rem] p-4 border border-indigo-100 flex items-center justify-between shadow-inner">
                  <div className="flex flex-col items-center gap-1 flex-1">
                    <Hash className="h-4 w-4 text-indigo-400 mb-1" />
                    <span className="text-[12px] font-black text-indigo-900 uppercase leading-none">{p.transport_data.reservation_number || 'S/N'}</span>
                    <span className="text-[7px] font-black text-indigo-300 uppercase tracking-widest">Reserva</span>
                  </div>
                  <div className="h-8 w-px bg-indigo-200/50"></div>
                  <div className="flex flex-col items-center gap-1 flex-1">
                    <Clock className="h-4 w-4 text-indigo-400 mb-1" />
                    <span className="text-[12px] font-black text-indigo-900 uppercase leading-none">{p.transport_data.pickup_time || '--:--'}</span>
                    <span className="text-[7px] font-black text-indigo-300 uppercase tracking-widest">Recogida</span>
                  </div>
                </div>
              )}

              {(p.transport_data.transport_type === 'REQUERIDO' || p.transport_data.transport_type === 'Empresa') && (
                <div className="grid grid-cols-3 gap-2 px-1">
                  <button onClick={() => handleUpdateArrival(p.personnel_id, 'Sin Novedad')} className={`py-3 rounded-2xl border-2 flex flex-col items-center gap-1.5 transition-all ${p.transport_data.arrival_status === 'Sin Novedad' ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-100 scale-105' : 'bg-white border-slate-50 text-slate-300'}`}><CheckCircle2 className="h-5 w-5" /><span className="text-[8px] font-black uppercase">O.K.</span></button>
                  <button onClick={() => handleUpdateArrival(p.personnel_id, 'Atrasado')} className={`py-3 rounded-2xl border-2 flex flex-col items-center gap-1.5 transition-all ${p.transport_data.arrival_status === 'Atrasado' ? 'bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-100 scale-105' : 'bg-white border-slate-50 text-slate-300'}`}><AlertTriangle className="h-5 w-5" /><span className="text-[8px] font-black uppercase">Atraso</span></button>
                  <button onClick={() => handleUpdateArrival(p.personnel_id, 'No lo buscaron')} className={`py-3 rounded-2xl border-2 flex flex-col items-center gap-1.5 transition-all ${p.transport_data.arrival_status === 'No lo buscaron' ? 'bg-red-500 border-red-500 text-white shadow-lg shadow-red-100 scale-105' : 'bg-white border-slate-50 text-slate-300'}`}><XCircle className="h-5 w-5" /><span className="text-[8px] font-black uppercase">Falla</span></button>
                </div>
              )}

              <div className="relative flex items-center gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-100 shadow-inner">
                <MessageSquare className="h-4 w-4 text-slate-400 flex-shrink-0" />
                <input type="text" placeholder="Añadir nota final..." defaultValue={p.transport_data.observations} onBlur={(e) => handleUpdateObs(p.personnel_id, e.target.value)} className="w-full bg-transparent border-none text-[11px] font-bold text-slate-700 outline-none placeholder:text-slate-300" />
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-4">
            <div className="h-20 w-20 bg-amber-50 rounded-[2.5rem] flex items-center justify-center border-2 border-dashed border-amber-200">
              <AlertTriangle className="h-10 w-10 text-amber-500" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Planificación no validada</h3>
              <p className="text-xs font-bold text-slate-400 leading-relaxed uppercase">
                Administración aún no confirma el roster de este día. <br /> 
                Por favor, espera la validación para coordinar el transporte.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
