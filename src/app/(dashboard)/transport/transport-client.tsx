'use client';

import React, { useState, useEffect } from 'react';
import { format, parseISO, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  ChevronLeft, 
  ChevronRight, 
  Copy, 
  Check, 
  Clock, 
  MapPin, 
  User, 
  Hash, 
  ThumbsUp, 
  ThumbsDown,
  Car,
  Info,
  CheckCircle2,
  RotateCcw,
  Send,
  Loader2,
  RefreshCw,
  Trash2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { TransportRequestWithDetails, Company, TransportType, TransportStatus } from '@/types/database';
import { 
  updateTransportRequest, 
  generateTransportRequests, 
  clearTransportRequests, 
  sendTransportNotification, 
  getAvailableShifts, 
  updateAssignmentShift,
  assignColleaguePickup,
  unassignColleaguePickup,
  updateTransportCost
} from './actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface RequestCardProps {
  req: TransportRequestWithDetails;
  allRequests: TransportRequestWithDetails[];
  onUpdate: (id: string, updates: any) => Promise<void>;
  onCopyToClipboard: (text: string, id: string) => void;
  copiedId: string | null;
  availableShifts: any[];
  onUpdateShift: (assignmentId: string, newShiftId: string) => Promise<void>;
  onRefresh: () => void;
}

// Ordenamiento por:
// 1. Horario de entrada / turno
// 2. Grupo o Cargo (DHL, FEDEX, BLUEEXPRESS, etc.)
// 3. Apellido del personal
function sortTransportRequests(a: TransportRequestWithDetails, b: TransportRequestWithDetails): number {
  // 1. Horario de turno (o recogida si aplica)
  const timeA = a.type === 'SALIDA' 
    ? (a.assignment?.shift?.end_time || a.assignment?.shift?.start_time || '99:99')
    : (a.assignment?.shift?.start_time || '99:99');
  const timeB = b.type === 'SALIDA' 
    ? (b.assignment?.shift?.end_time || b.assignment?.shift?.start_time || '99:99')
    : (b.assignment?.shift?.start_time || '99:99');

  const timeCompare = timeA.localeCompare(timeB);
  if (timeCompare !== 0) return timeCompare;

  // 2. Grupo o Cargo (DHL, FEDEX, BLUEEXPRESS, AEROPUERTO, etc.)
  const getGroupKey = (req: TransportRequestWithDetails) => {
    const area = (req.assignment?.area?.name || '').toUpperCase().trim();
    const pos = (req.assignment?.position?.name || '').toUpperCase().trim();

    if (area.includes('DHL') || pos.includes('DHL')) return `DHL - ${pos || area}`;
    if (area.includes('FEDEX') || pos.includes('FEDEX')) return `FEDEX - ${pos || area}`;
    if (area.includes('BLUE') || pos.includes('BLUE')) return `BLUE EXPRESS - ${pos || area}`;
    if (area.includes('AEROPUERTO') || pos.includes('AEROPUERTO')) return `AEROPUERTO - ${pos || area}`;

    return `${area} ${pos}`.trim() || 'OTROS';
  };

  const groupA = getGroupKey(a);
  const groupB = getGroupKey(b);
  const groupCompare = groupA.localeCompare(groupB, 'es', { sensitivity: 'base' });
  if (groupCompare !== 0) return groupCompare;

  // 3. Apellido (Paterno, Materno, Nombres)
  const nameA = `${a.personnel?.last_name_father || ''} ${a.personnel?.last_name_mother || ''} ${a.personnel?.first_name || ''}`.trim();
  const nameB = `${b.personnel?.last_name_father || ''} ${b.personnel?.last_name_mother || ''} ${b.personnel?.first_name || ''}`.trim();
  return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
}

const RequestCard = React.memo(({ req, allRequests, onUpdate, onCopyToClipboard, copiedId, availableShifts, onUpdateShift, onRefresh }: RequestCardProps) => {
  const [localData, setLocalData] = useState({
    reservation_number: req.reservation_number || '',
    pickup_time: req.pickup_time ? req.pickup_time.substring(0, 5) : '',
    observations: req.observations || '',
    cost: req.cost != null ? String(req.cost) : ''
  });
  const [providerName, setProviderName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isNotifying, setIsNotifying] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isTimePending, setIsTimePending] = useState(true);
  const [selectedShiftId, setSelectedShiftId] = useState(req.assignment?.shift_id || '');
  const [isUpdatingShift, setIsUpdatingShift] = useState(false);
  const [isAssigningDriver, setIsAssigningDriver] = useState(false);

  const isManaged = req.status === 'GESTIONADO' || req.status === 'CONFORME' || req.status === 'NO_CONFORME';

  // Extract Driver / Provider from observations
  const assignedDriverMatch = req.observations?.match(/Pasa a buscar:\s*([^|]+)/i);
  const assignedDriverName = assignedDriverMatch ? assignedDriverMatch[1].trim() : null;

  const providerMatch = req.observations?.match(/Proveedor:\s*([^|]+)/i);
  const extractedProvider = providerMatch ? providerMatch[1].trim() : '';

  useEffect(() => {
    setLocalData({
      reservation_number: req.reservation_number || '',
      pickup_time: req.pickup_time ? req.pickup_time.substring(0, 5) : '',
      observations: req.observations || '',
      cost: req.cost != null ? String(req.cost) : ''
    });
    setSelectedShiftId(req.assignment?.shift_id || '');
    if (extractedProvider) {
      setProviderName(extractedProvider);
    }
  }, [req.reservation_number, req.pickup_time, req.observations, req.cost, req.assignment?.shift_id, extractedProvider]);

  // List of potential drivers: strictly those who have transport_type === 'PROPIO' on the same date and type
  const potentialDrivers = React.useMemo(() => {
    const driversMap = new Map();
    allRequests.forEach(r => {
      const isPickupBonus = r.observations?.startsWith('Recogida a');
      if (
        r.personnel && 
        r.personnel.id !== req.personnel?.id && 
        r.transport_type === 'PROPIO' && 
        !isPickupBonus &&
        r.type === req.type
      ) {
        // Count how many passengers this driver currently picks up on this date/type
        const passengerCount = allRequests.filter(other => 
          other.transport_type === 'COLEGA' && 
          other.type === req.type &&
          other.observations?.includes(`DRIVER_ID:${r.personnel!.id}`)
        ).length;

        if (!driversMap.has(r.personnel.id)) {
          driversMap.set(r.personnel.id, {
            id: r.personnel.id,
            name: `${r.personnel.first_name} ${r.personnel.last_name_father}`.trim(),
            phone: r.personnel.phone,
            isOwnTransport: true,
            shiftTime: r.assignment?.shift?.start_time?.substring(0, 5) || '',
            areaName: r.assignment?.area?.name || '',
            passengerCount
          });
        }
      }
    });
    return Array.from(driversMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [allRequests, req.personnel?.id, req.type]);

  const hasChanges = 
    localData.reservation_number !== (req.reservation_number || '') ||
    localData.pickup_time !== (req.pickup_time ? req.pickup_time.substring(0, 5) : '') ||
    localData.observations !== (req.observations || '') ||
    localData.cost !== (req.cost != null ? String(req.cost) : '');

  const saveChanges = async () => {
    setIsSaving(true);
    let updatedObs = localData.observations;
    if (req.transport_type === 'OTRO_PROVEEDOR' && providerName.trim()) {
      updatedObs = `Proveedor: ${providerName.trim()}${localData.observations && !localData.observations.startsWith('Proveedor:') ? ` | ${localData.observations}` : ''}`;
    }
    
    await onUpdate(req.id, {
      ...localData,
      observations: updatedObs,
      cost: localData.cost ? Number(localData.cost) : null
    });
    setIsSaving(false);
  };

  const handleDriverSelect = async (driverId: string) => {
    if (!driverId) return;
    setIsAssigningDriver(true);
    const res = await assignColleaguePickup(req.id, driverId);
    if (res.success) {
      toast.success(`Pasajero asignado a ${res.driverName}. Bono creado.`);
      onRefresh();
    } else {
      toast.error('Error al asignar: ' + res.error);
    }
    setIsAssigningDriver(false);
  };

  const handleUnassignDriver = async () => {
    setIsAssigningDriver(true);
    const res = await unassignColleaguePickup(req.id);
    if (res.success) {
      toast.success('Colega desasignado. Transporte vuelto a Requerido.');
      onRefresh();
    } else {
      toast.error('Error al desasignar: ' + res.error);
    }
    setIsAssigningDriver(false);
  };

  const handleNotify = async () => {
    setIsNotifying(true);
    if (hasChanges) {
      await saveChanges();
    }
    const res = await sendTransportNotification(req.id, isTimePending);
    if (res.success) {
      toast.success(isManaged ? 'WhatsApp re-enviado correctamente' : 'WhatsApp enviado y movido a Gestionados');
      onRefresh();
    } else {
      toast.error('Error al enviar: ' + res.error);
    }
    setIsNotifying(false);
  };

  const handleResetToPending = async () => {
    setIsResetting(true);
    await onUpdate(req.id, { status: 'ABIERTO' });
    toast.success('Transporte devuelto a Pendientes');
    setIsResetting(false);
  };

  const handleShiftUpdate = async () => {
    if (!selectedShiftId || selectedShiftId === req.assignment?.shift_id || !req.assignment_id) return;
    setIsUpdatingShift(true);
    await onUpdateShift(req.assignment_id, selectedShiftId);
    setIsUpdatingShift(false);
  };

  const isDataComplete = 
    (req.transport_type === 'PROPIO') ||
    (req.transport_type === 'COLEGA' && Boolean(assignedDriverName)) ||
    (req.transport_type === 'OTRO_PROVEEDOR' && Boolean(providerName || req.observations)) ||
    (req.reservation_number && req.pickup_time && req.pickup_address && req.destination_address);

  const showNotifyButton = 
    req.transport_type === 'REQUERIDO' || 
    req.transport_type === 'EMPRESA' || 
    req.transport_type === 'PROPIO' || 
    req.transport_type === 'COLEGA' || 
    req.transport_type === 'OTRO_PROVEEDOR';
  
  const areaName = (req.assignment?.area?.name || '').toUpperCase();
  const posName = (req.assignment?.position?.name || '').toUpperCase();
  const isFedex = posName.includes('FEDEX') || areaName.includes('FEDEX');
  const isDriverPickupBonus = req.transport_type === 'PROPIO' && req.observations?.startsWith('Recogida a');

  return (
    <div className={`bg-white rounded-xl shadow-sm border transition-all overflow-hidden hover:shadow-md ${
      isManaged ? 'border-emerald-200 ring-1 ring-emerald-100' : 'border-slate-200'
    }`}>
      {/* Managed Banner / Badge */}
      {isManaged && (
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-3.5 py-1.5 text-white flex items-center justify-between text-xs font-bold shadow-inner">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-100" />
            <span className="tracking-wide uppercase text-[11px]">WhatsApp Enviado</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
              req.type === 'ENTRADA' ? 'bg-blue-900/60 text-blue-100' : 'bg-amber-900/60 text-amber-100'
            }`}>
              {req.type}
            </span>
            {req.status === 'CONFORME' && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-white text-emerald-800 uppercase flex items-center gap-0.5">
                <ThumbsUp className="w-2.5 h-2.5" /> Conforme
              </span>
            )}
            {req.status === 'NO_CONFORME' && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-600 text-white uppercase flex items-center gap-0.5">
                <ThumbsDown className="w-2.5 h-2.5" /> No Conforme
              </span>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${
            isManaged ? 'bg-emerald-100 text-emerald-700' : req.type === 'ENTRADA' ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'
          }`}>
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 uppercase text-sm flex items-center gap-2">
              {req.personnel?.first_name} {req.personnel?.last_name_father}
            </h3>
            {isFedex && req.type === 'ENTRADA' ? (
              <div className="flex items-center gap-1 mt-1">
                <select 
                  className="text-[10px] font-mono border-slate-200 rounded p-0.5 focus:ring-indigo-500 bg-slate-100"
                  value={selectedShiftId}
                  onChange={(e) => setSelectedShiftId(e.target.value)}
                >
                  {availableShifts.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.start_time.substring(0,5)} - {s.end_time.substring(0,5)}</option>
                  ))}
                </select>
                {selectedShiftId !== req.assignment?.shift_id && (
                  <button 
                    onClick={handleShiftUpdate}
                    disabled={isUpdatingShift}
                    className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold hover:bg-indigo-200"
                  >
                    {isUpdatingShift ? '...' : 'Guardar'}
                  </button>
                )}
                <span className="text-[10px] text-slate-500 font-mono uppercase ml-1">| {req.assignment?.area?.name}</span>
              </div>
            ) : (
              <p className="text-[10px] text-slate-500 font-mono uppercase mt-0.5">
                Turno: {req.assignment?.shift?.start_time.substring(0,5)} - {req.assignment?.shift?.end_time.substring(0,5)} | {req.assignment?.area?.name}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select 
            value={req.transport_type}
            onChange={(e) => onUpdate(req.id, { transport_type: e.target.value as TransportType })}
            className="text-xs font-bold border-slate-200 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white"
          >
            <option value="REQUERIDO">REQUIERE TRANSPORTE (Transvip)</option>
            <option value="PROPIO">MOVILIZACIÓN PROPIA</option>
            <option value="COLEGA">🚗 RECOGIDA POR COLEGA</option>
            <option value="OTRO_PROVEEDOR">🚖 OTRO PROVEEDOR</option>
            <option value="EMPRESA">MÓVIL EMPRESA</option>
            <option value="PENDIENTE">PENDIENTE</option>
          </select>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Special Banner for Driver Pickup Bonus */}
        {isDriverPickupBonus && (
          <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-lg flex items-center justify-between text-xs text-amber-900 font-bold">
            <span className="flex items-center gap-1.5">
              <Car className="w-4 h-4 text-amber-600" />
              {req.observations}
            </span>
            <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">
              +1 Bono Movilización
            </Badge>
          </div>
        )}

        {/* Addresses */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Origen
            </span>
            <div className="flex items-start gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100 group">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-700 leading-relaxed truncate group-hover:whitespace-normal transition-all">{req.pickup_address}</p>
                {req.pickup_address && !req.pickup_address.includes('FICHA') && (
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(req.pickup_address)}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[9px] text-indigo-500 hover:underline flex items-center gap-0.5 mt-0.5"
                  >
                    Ver en Mapa
                  </a>
                )}
              </div>
              <button 
                onClick={() => onCopyToClipboard(req.pickup_address || '', req.id + '-origin')}
                className="text-slate-400 hover:text-indigo-600 p-1 shrink-0"
              >
                {copiedId === req.id + '-origin' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Destino
            </span>
            <div className="flex items-start gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100 group">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-700 leading-relaxed truncate group-hover:whitespace-normal transition-all">{req.destination_address}</p>
                {req.destination_address && !req.destination_address.includes('FICHA') && (
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(req.destination_address)}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[9px] text-indigo-500 hover:underline flex items-center gap-0.5 mt-0.5"
                  >
                    Ver en Mapa
                  </a>
                )}
              </div>
              <button 
                onClick={() => onCopyToClipboard(req.destination_address || '', req.id + '-dest')}
                className="text-slate-400 hover:text-indigo-600 p-1 shrink-0"
              >
                {copiedId === req.id + '-dest' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Controls based on Transport Type */}

        {/* 1. CARPOOLING: COLEGA */}
        {req.transport_type === 'COLEGA' && (
          <div className="p-3 bg-purple-50/60 border border-purple-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-purple-900 flex items-center gap-1.5 uppercase">
                <Car className="w-4 h-4 text-purple-600" />
                Asignación de Conductor (Colega)
              </span>
              <span className="text-[10px] text-purple-600 font-semibold">Máx 3 pasajeros / conductor</span>
            </div>

            {assignedDriverName ? (
              <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-purple-200">
                <div>
                  <p className="text-xs font-bold text-slate-900 uppercase">
                    🚗 {assignedDriverName}
                  </p>
                  <p className="text-[10px] text-emerald-600 font-medium">
                    ✓ Bono de recogida asignado automáticamente
                  </p>
                </div>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={handleUnassignDriver}
                  disabled={isAssigningDriver}
                  className="h-7 text-[10px] text-red-600 border-red-200 hover:bg-red-50"
                >
                  {isAssigningDriver ? '...' : 'Cambiar / Quitar'}
                </Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-purple-800 uppercase">
                  Seleccionar compañero que lo pasa a buscar:
                </label>
                <select
                  onChange={(e) => handleDriverSelect(e.target.value)}
                  disabled={isAssigningDriver}
                  defaultValue=""
                  className="w-full text-xs p-2 rounded-lg border border-purple-300 bg-white font-medium focus:ring-purple-500"
                >
                  <option value="" disabled>Seleccionar conductor con Movilización Propia ({potentialDrivers.length} disponibles)...</option>
                  {potentialDrivers.map(d => (
                    <option 
                      key={d.id} 
                      value={d.id} 
                      disabled={d.passengerCount >= 3}
                    >
                      {d.name} ({d.shiftTime}) — {d.passengerCount}/3 pasajeros {d.passengerCount >= 3 ? '[LLENO]' : ''}
                    </option>
                  ))}
                </select>
                {potentialDrivers.length === 0 && (
                  <p className="text-[10px] text-purple-600 font-medium italic">No hay compañeros con Movilización Propia programados en este turno.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* 2. OTRO PROVEEDOR */}
        {req.transport_type === 'OTRO_PROVEEDOR' && (
          <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5 uppercase">
                <Hash className="w-4 h-4 text-amber-600" />
                Datos de Proveedor Alternativo
              </span>
              {req.cost == null || req.cost === 0 ? (
                <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] font-bold animate-pulse">
                  ⏳ Pendiente Valorizar
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] font-bold">
                  ✓ ${Number(req.cost).toLocaleString('es-CL')}
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-amber-800">Proveedor / Móvil</label>
                <input 
                  type="text" 
                  value={providerName}
                  onChange={(e) => setProviderName(e.target.value)}
                  placeholder="Ej: Radio Taxi Pudahuel"
                  className="w-full text-xs p-2 rounded bg-white border border-amber-200 focus:ring-amber-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-amber-800">N° Reserva / Teléfono</label>
                <input 
                  type="text" 
                  value={localData.reservation_number}
                  onChange={(e) => setLocalData({ ...localData, reservation_number: e.target.value })}
                  placeholder="N° móvil o contacto"
                  className="w-full text-xs p-2 rounded bg-white border border-amber-200 focus:ring-amber-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-amber-800">Hora Recogida</label>
                <input 
                  type="time" 
                  value={localData.pickup_time}
                  onChange={(e) => setLocalData({ ...localData, pickup_time: e.target.value })}
                  className="w-full text-xs p-2 rounded bg-white border border-amber-200 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-amber-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold uppercase text-slate-700 whitespace-nowrap">Valor Viaje ($ CLP):</label>
                <input 
                  type="number"
                  placeholder="Ej: 15000"
                  value={localData.cost}
                  onChange={(e) => setLocalData({ ...localData, cost: e.target.value })}
                  className="w-28 text-xs p-1.5 rounded bg-white border border-slate-300 font-bold text-slate-800 focus:ring-amber-500"
                />
              </div>
              {hasChanges && (
                <Button size="sm" onClick={saveChanges} disabled={isSaving} className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white">
                  {isSaving ? 'Guardando...' : 'Guardar Datos Proveedor'}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* 3. DEFAULT ADMIN INPUTS (Transvip / Propio) */}
        {showNotifyButton && req.transport_type !== 'COLEGA' && req.transport_type !== 'OTRO_PROVEEDOR' && (
          <div className={`p-3 rounded-lg border space-y-3 ${
            isManaged ? 'bg-emerald-50/40 border-emerald-100' : 'bg-indigo-50/50 border-indigo-100'
          }`}>
            {req.transport_type !== 'PROPIO' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className={`text-[10px] font-bold uppercase flex items-center gap-1 ${
                    isManaged ? 'text-emerald-800' : 'text-indigo-700'
                  }`}>
                    <Hash className="w-3 h-3" /> Nro Reserva
                  </label>
                  <input 
                    type="text" 
                    value={localData.reservation_number}
                    onChange={(e) => setLocalData({ ...localData, reservation_number: e.target.value })}
                    className={`w-full text-xs p-2 rounded focus:ring-indigo-500 focus:border-indigo-500 bg-white ${
                      isManaged ? 'border-emerald-200' : 'border-indigo-200'
                    }`}
                    placeholder="Ingresar reserva..."
                  />
                </div>
                <div className="space-y-1">
                  <label className={`text-[10px] font-bold uppercase flex items-center gap-1 ${
                    isManaged ? 'text-emerald-800' : 'text-indigo-700'
                  }`}>
                    <Clock className="w-3 h-3" /> Hora Recogida
                  </label>
                  <input 
                    type="time" 
                    value={localData.pickup_time}
                    onChange={(e) => setLocalData({ ...localData, pickup_time: e.target.value })}
                    className={`w-full text-xs p-2 rounded focus:ring-indigo-500 focus:border-indigo-500 bg-white ${
                      isManaged ? 'border-emerald-200' : 'border-indigo-200'
                    }`}
                  />
                </div>
              </div>
            )}
            
            {hasChanges && req.transport_type !== 'PROPIO' && (
              <button 
                onClick={saveChanges}
                disabled={isSaving}
                className="w-full py-2 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200 active:scale-95 disabled:opacity-50"
              >
                {isSaving ? 'Guardando...' : 'Guardar Cambios de Reserva'}
              </button>
            )}
          </div>
        )}

        {/* NOTIFY ACTIONS BAR */}
        {showNotifyButton && (
          <div className="flex flex-col gap-2 pt-1">
            {isFedex && req.transport_type !== 'COLEGA' && req.transport_type !== 'OTRO_PROVEEDOR' && (
              <label className="flex items-center gap-2 text-[10px] font-bold text-indigo-800 bg-indigo-100 p-2 rounded cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={isTimePending}
                  onChange={(e) => setIsTimePending(e.target.checked)}
                  className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                />
                Hora de ingreso por confirmar
              </label>
            )}
            
            <div className="flex items-center gap-2">
              <button 
                onClick={handleNotify}
                disabled={!isDataComplete || isNotifying}
                className={`flex-1 py-2 flex items-center justify-center gap-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-md active:scale-95 disabled:opacity-30 disabled:grayscale ${
                  isManaged 
                    ? 'bg-emerald-600 text-white shadow-emerald-200 hover:bg-emerald-700'
                    : isDataComplete 
                      ? req.transport_type === 'COLEGA' 
                        ? 'bg-purple-600 text-white shadow-purple-200 hover:bg-purple-700' 
                        : req.transport_type === 'OTRO_PROVEEDOR'
                          ? 'bg-amber-600 text-white shadow-amber-200 hover:bg-amber-700'
                          : 'bg-emerald-600 text-white shadow-emerald-200 hover:bg-emerald-700' 
                      : 'bg-slate-200 text-slate-500 shadow-none cursor-not-allowed'
                }`}
              >
                {isNotifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                {isManaged 
                  ? 'Re-enviar WhatsApp' 
                  : isDataComplete 
                    ? req.transport_type === 'COLEGA'
                      ? 'Notificar a Pasajero y Colega Conductor'
                      : req.transport_type === 'OTRO_PROVEEDOR'
                        ? 'Notificar Transporte Alternativo'
                        : req.transport_type === 'PROPIO'
                          ? 'Notificar Movilización Propia'
                          : 'Enviar Notificación WhatsApp' 
                    : req.transport_type === 'COLEGA'
                      ? 'Falta Seleccionar Conductor'
                      : 'Datos Incompletos para Notificar'}
              </button>

              {isManaged && (
                <button
                  onClick={handleResetToPending}
                  disabled={isResetting}
                  title="Mover de vuelta a lista de pendientes"
                  className="px-2.5 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800 rounded-lg text-[10px] font-bold transition-all border border-slate-200 flex items-center gap-1"
                >
                  {isResetting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                  <span className="hidden sm:inline">Revertir</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Observations & Confirmation */}
        <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-100">
           <div className="flex-1 flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-slate-400" />
              <input 
                type="text" 
                placeholder="Observaciones..."
                value={localData.observations}
                onChange={(e) => setLocalData({ ...localData, observations: e.target.value })}
                onBlur={() => hasChanges && !isSaving && saveChanges()}
                className="flex-1 text-[11px] border-none focus:ring-0 p-0 text-slate-600 placeholder:text-slate-300"
              />
           </div>
           
           <div className="flex items-center gap-2">
              <button 
                onClick={() => onUpdate(req.id, { status: 'CONFORME' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-[10px] font-bold uppercase ${
                  req.status === 'CONFORME' 
                    ? 'bg-emerald-600 text-white shadow-sm' 
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                <ThumbsUp className="w-3.5 h-3.5" /> Conforme
              </button>
              <button 
                onClick={() => onUpdate(req.id, { status: 'NO_CONFORME' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-[10px] font-bold uppercase ${
                  req.status === 'NO_CONFORME' 
                    ? 'bg-red-600 text-white shadow-sm' 
                    : 'bg-red-50 text-red-700 hover:bg-red-100'
                }`}
              >
                <ThumbsDown className="w-3.5 h-3.5" /> No Conforme
              </button>
           </div>
        </div>
      </div>
    </div>
  );
});

RequestCard.displayName = 'RequestCard';

RequestCard.displayName = 'RequestCard';

interface Props {
  initialRequests: TransportRequestWithDetails[];
  selectedDate: string;
  companies: Company[];
}

export default function TransportClient({
  initialRequests,
  selectedDate,
  companies
}: Props) {
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [requests, setRequests] = useState<TransportRequestWithDetails[]>(initialRequests);
  const [isSyncing, setIsSyncing] = useState(false);
  const [availableShifts, setAvailableShifts] = useState<any[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  useEffect(() => {
    async function loadShifts() {
      const res = await getAvailableShifts(selectedDate);
      if (res.success && res.data) {
        setAvailableShifts(res.data);
      }
    }
    loadShifts();
  }, [selectedDate]);

  // Persistence: Redirect if no date in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('date')) {
      const lastDate = localStorage.getItem('hrm_last_transport_date');
      if (lastDate && lastDate !== selectedDate) {
        router.push(`/transport?date=${lastDate}`);
      }
    }
  }, []);

  // Save date on change
  useEffect(() => {
    if (selectedDate) {
      localStorage.setItem('hrm_last_transport_date', selectedDate);
    }
  }, [selectedDate]);

  useEffect(() => {
    setRequests(initialRequests);
  }, [initialRequests]);

  const handleSync = async () => {
    setIsSyncing(true);
    const res = await generateTransportRequests(selectedDate);
    if (res.success) {
      toast.success('Transporte sincronizado');
      router.refresh();
    } else {
      toast.error('Error al sincronizar: ' + (res.error || 'Error desconocido'));
    }
    setIsSyncing(false);
  };

  const handleClear = async () => {
    if (confirm('¿Estás seguro de ELIMINAR TODAS las solicitudes de transporte de este día?')) {
      const res = await clearTransportRequests(selectedDate);
      if (res.success) {
        toast.success('Transporte limpiado');
        router.refresh();
      } else {
        toast.error('Error al limpiar: ' + (res.error || 'Error desconocido'));
      }
    }
  };

  const handleDateChange = (newDate: string) => {
    router.push(`/transport?date=${newDate}`);
  };

  const handleUpdate = async (id: string, updates: any) => {
    // Optimistic update
    setRequests(current => 
      current.map(r => r.id === id ? { ...r, ...updates } : r)
    );

    console.log('[TRANSPORT] Updating:', id, updates);
    const res = await updateTransportRequest(id, updates);
    if (res.success) {
      console.log('[TRANSPORT] Update Success');
      toast.success('Actualizado');
    } else {
      console.error('[TRANSPORT] Update Failed:', res.error);
      toast.error('Error: ' + res.error);
      setRequests(initialRequests);
    }
  };

  const handleShiftUpdate = async (assignmentId: string, newShiftId: string) => {
    const res = await updateAssignmentShift(assignmentId, newShiftId);
    if (res.success) {
      toast.success('Turno actualizado');
      router.refresh();
    } else {
      toast.error('Error al actualizar turno: ' + res.error);
    }
  };

  const handleBulkFedexShiftUpdate = async (newShiftId: string) => {
    const fedexEntries = entriesPending.filter(r => {
      const areaName = (r.assignment?.area?.name || '').toUpperCase();
      const posName = (r.assignment?.position?.name || '').toUpperCase();
      return posName.includes('FEDEX') || areaName.includes('FEDEX');
    });
    
    if (fedexEntries.length === 0) {
      toast.error('No hay entradas pendientes de Fedex para actualizar');
      return;
    }

    if (!confirm(`¿Actualizar el horario de ${fedexEntries.length} personas de Fedex al turno seleccionado?`)) return;

    setIsBulkUpdating(true);
    let successCount = 0;
    
    // Process in sequence to avoid DB locks and ensure clean updates
    for (const req of fedexEntries) {
      if (req.assignment_id) {
        const res = await updateAssignmentShift(req.assignment_id, newShiftId);
        if (res.success) successCount++;
      }
    }

    setIsBulkUpdating(false);
    toast.success(`Se actualizaron ${successCount} turnos correctamente`);
    router.refresh();
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success('Dirección copiada');
  };

  // 1. Entradas pendientes (status === 'ABIERTO')
  const entriesPending = [...requests]
    .filter(r => {
      if (r.type !== 'ENTRADA') return false;
      if (r.status !== 'ABIERTO') return false;
      
      // Los registros de bono de recogida del conductor no son solicitudes pendientes de coordinar
      if (r.observations?.startsWith('Recogida a')) return false;

      // Si es movilización propia, solo mostrar si es de Fedex (para coordinar horario)
      if (r.transport_type === 'PROPIO') {
        const areaName = (r.assignment?.area?.name || '').toUpperCase();
        const posName = (r.assignment?.position?.name || '').toUpperCase();
        return posName.includes('FEDEX') || areaName.includes('FEDEX');
      }
      return true;
    })
    .sort(sortTransportRequests);

  // 2. Salidas pendientes (status === 'ABIERTO')
  const exitsPending = [...requests]
    .filter(r => {
      if (r.type !== 'SALIDA') return false;
      if (r.status !== 'ABIERTO') return false;
      
      if (r.observations?.startsWith('Recogida a')) return false;

      if (r.transport_type === 'PROPIO') {
        const areaName = (r.assignment?.area?.name || '').toUpperCase();
        const posName = (r.assignment?.position?.name || '').toUpperCase();
        return posName.includes('FEDEX') || areaName.includes('FEDEX');
      }
      return true;
    })
    .sort(sortTransportRequests);

  // 3. Transportes gestionados / notificados
  const managedRequests = [...requests]
    .filter(r => {
      return r.status === 'GESTIONADO' || r.status === 'CONFORME' || r.status === 'NO_CONFORME';
    })
    .sort(sortTransportRequests);

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Date Toolbar - Sticky at the very top */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-md border border-slate-200 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button onClick={() => handleDateChange(format(addDays(parseISO(selectedDate), -1), 'yyyy-MM-dd'))} className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><ChevronLeft className="w-5 h-5" /></button>
          <input 
            type="date" 
            value={selectedDate} 
            onChange={(e) => handleDateChange(e.target.value)}
            className="px-4 py-2 bg-white rounded-lg border border-slate-200 font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer"
          />
          <button onClick={() => handleDateChange(format(addDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'))} className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><ChevronRight className="w-5 h-5" /></button>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleSync} 
            disabled={isSyncing}
            className="ml-4 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
          >
            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Sincronizar Planificación
          </Button>

          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleClear} 
            className="text-red-400 hover:text-red-600 hover:bg-red-50"
            title="Borrar todos los transportes de este día"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Limpiar Todo
          </Button>
        </div>
        
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-full font-bold uppercase">
             <span className="w-2 h-2 rounded-full bg-blue-500"></span>
             {entriesPending.length} Entradas Pendientes
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold uppercase">
             <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
             {managedRequests.length} Gestionados
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-700 border border-orange-100 rounded-full font-bold uppercase">
             <span className="w-2 h-2 rounded-full bg-orange-500"></span>
             {exitsPending.length} Salidas Pendientes
          </div>
        </div>
      </div>

      {/* 3 COLUMNS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0 overflow-hidden pb-4">
        {/* COL 1: ENTRADAS PENDIENTES */}
        <div className="flex flex-col min-h-0 bg-slate-50/50 rounded-2xl border border-slate-200 overflow-hidden shadow-inner">
          <div className="flex items-center gap-2 border-b border-slate-200 p-4 bg-white sticky top-0 z-20 shadow-sm">
             <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
             <div>
               <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">Entradas Pendientes</h2>
               <p className="text-[10px] text-slate-400 font-medium">Hacia la empresa</p>
             </div>
             <Badge variant="outline" className="ml-auto bg-blue-50 text-blue-700 border-blue-200">{entriesPending.length}</Badge>
             
             {entriesPending.some(r => {
               const areaName = (r.assignment?.area?.name || '').toUpperCase();
               const posName = (r.assignment?.position?.name || '').toUpperCase();
               return posName.includes('FEDEX') || areaName.includes('FEDEX');
             }) && (
               <div className="ml-2 flex items-center gap-1 border-l pl-2 border-slate-200">
                 <select 
                   className="text-[10px] font-bold border-slate-200 rounded p-1 bg-indigo-50 text-indigo-700 max-w-[130px]"
                   onChange={(e) => e.target.value && handleBulkFedexShiftUpdate(e.target.value)}
                   disabled={isBulkUpdating}
                   defaultValue=""
                 >
                   <option value="" disabled>MASIVO FEDEX...</option>
                   {availableShifts.map((s: any) => (
                     <option key={s.id} value={s.id}>{s.start_time.substring(0,5)} - {s.end_time.substring(0,5)}</option>
                   ))}
                 </select>
                 {isBulkUpdating && <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />}
               </div>
             )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {entriesPending.length > 0 ? entriesPending.map(req => (
              <RequestCard 
                key={req.id} 
                req={req} 
                allRequests={requests}
                onUpdate={handleUpdate} 
                onCopyToClipboard={copyToClipboard}
                copiedId={copiedId}
                availableShifts={availableShifts}
                onUpdateShift={handleShiftUpdate}
                onRefresh={() => router.refresh()}
              />
            )) : (
              <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 bg-white/50">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-20" />
                No hay entradas pendientes para esta fecha
              </div>
            )}
          </div>
        </div>

        {/* COL 2: TRANSPORTES GESTIONADOS */}
        <div className="flex flex-col min-h-0 bg-emerald-50/20 rounded-2xl border border-emerald-200 overflow-hidden shadow-inner">
          <div className="flex items-center gap-2 border-b border-emerald-100 p-4 bg-white sticky top-0 z-20 shadow-sm">
             <div className="w-1.5 h-6 bg-emerald-600 rounded-full" />
             <div>
               <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">Transporte Gestionado</h2>
               <p className="text-[10px] text-emerald-600 font-medium">Notificados por WhatsApp</p>
             </div>
             <Badge variant="outline" className="ml-auto bg-emerald-50 text-emerald-700 border-emerald-200">{managedRequests.length}</Badge>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {managedRequests.length > 0 ? managedRequests.map(req => (
              <RequestCard 
                key={req.id} 
                req={req} 
                allRequests={requests}
                onUpdate={handleUpdate} 
                onCopyToClipboard={copyToClipboard}
                copiedId={copiedId}
                availableShifts={availableShifts}
                onUpdateShift={handleShiftUpdate}
                onRefresh={() => router.refresh()}
              />
            )) : (
              <div className="p-12 text-center border-2 border-dashed border-emerald-200/60 rounded-xl text-emerald-700/60 bg-white/50">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-30 text-emerald-600" />
                <p className="font-medium text-xs">Sin transportes gestionados aún</p>
                <p className="text-[10px] text-slate-400 mt-1">Al ingresar datos y notificar por WhatsApp, las tarjetas pasarán aquí.</p>
              </div>
            )}
          </div>
        </div>

        {/* COL 3: SALIDAS PENDIENTES */}
        <div className="flex flex-col min-h-0 bg-slate-50/50 rounded-2xl border border-slate-200 overflow-hidden shadow-inner">
          <div className="flex items-center gap-2 border-b border-slate-200 p-4 bg-white sticky top-0 z-20 shadow-sm">
             <div className="w-1.5 h-6 bg-orange-600 rounded-full" />
             <div>
               <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">Salidas Pendientes</h2>
               <p className="text-[10px] text-slate-400 font-medium">A domicilio</p>
             </div>
             <Badge variant="outline" className="ml-auto bg-orange-50 text-orange-700 border-orange-200">{exitsPending.length}</Badge>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {exitsPending.length > 0 ? exitsPending.map(req => (
              <RequestCard 
                key={req.id} 
                req={req} 
                allRequests={requests}
                onUpdate={handleUpdate} 
                onCopyToClipboard={copyToClipboard}
                copiedId={copiedId}
                availableShifts={availableShifts}
                onUpdateShift={handleShiftUpdate}
                onRefresh={() => router.refresh()}
              />
            )) : (
              <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 bg-white/50">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-20" />
                No hay salidas pendientes para esta fecha
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
