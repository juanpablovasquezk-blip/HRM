'use client';

import React from 'react';
import { ShieldCheck, Users, Truck, Dna, Plane, Warehouse, Building2, Star } from 'lucide-react';
import type { ProyeccionDailyData } from '../actions';

interface ProyeccionDailyProps {
  data: ProyeccionDailyData;
}

export function ProyeccionDaily({ data }: ProyeccionDailyProps) {
  const { assignments, date } = data;

  // Filter out any cancelled assignments
  const activeAssignments = (assignments || []).filter(
    (a: any) => a.status !== 'cancelled'
  );

  // Helper for short names (First Name + Father's Last Name)
  const formatName = (p: any) => {
    if (!p) return '-';
    const firstName = p.first_name ? p.first_name.split(' ')[0] : '';
    return `${firstName} ${p.last_name_father || ''}`.trim();
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

  // ── 1. SUPERVISORES ──
  const supervisors = sortByTime(
    activeAssignments.filter(a => a.position?.name?.toUpperCase().includes('SUPERVISOR'))
  );
  const supervisorIds = new Set(supervisors.map(s => s.personnel_id));

  // ── 2. CANES ──
  const canes = sortByTime(
    activeAssignments.filter(
      a => !supervisorIds.has(a.personnel_id) && a.position?.name?.toUpperCase().includes('CANES')
    )
  );
  const canesIds = new Set(canes.map(c => c.personnel_id));

  // ── 3. GRÚAS / ATREX / BASE ──
  const cranes = sortByTime(
    activeAssignments.filter(
      a =>
        !supervisorIds.has(a.personnel_id) &&
        !canesIds.has(a.personnel_id) &&
        (a.area?.name?.toUpperCase().includes('ATREX') ||
          a.area?.name?.toUpperCase().includes('BASE') ||
          a.position?.name?.toUpperCase().includes('GRUA'))
    )
  );
  const cranesIds = new Set(cranes.map(c => c.personnel_id));

  // ── 4. AEROPUERTO (Operadores, Cazador, Noche) ──
  const aeropuerto = sortByTime(
    activeAssignments.filter(
      a =>
        !supervisorIds.has(a.personnel_id) &&
        !canesIds.has(a.personnel_id) &&
        !cranesIds.has(a.personnel_id) &&
        (a.area?.name?.toUpperCase().includes('AEROPUERTO') ||
          a.position?.name?.toUpperCase().includes('AEROPUERTO') ||
          a.position?.name?.toUpperCase().includes('CAZADOR'))
    )
  );
  const aeropuertoIds = new Set(aeropuerto.map(a => a.id));

  // ── 5. TRANSPORTE BLUE EXPRESS (PAREJAS) ──
  const blueExpressRaw = activeAssignments.filter(a =>
    (a.area?.name || '').toUpperCase().includes('BLUEEXPRESS')
  );

  const pairBlueExpress = () => {
    const sorted = sortByTime(blueExpressRaw);
    const pairs: any[] = [];
    const used = new Set();

    sorted.forEach(a => {
      if (used.has(a.id)) return;
      const isConductor = a.position?.name?.toUpperCase().includes('CONDUCTOR');

      const partner = sorted.find(
        p =>
          p.id !== a.id &&
          !used.has(p.id) &&
          p.shift_id === a.shift_id &&
          (isConductor
            ? p.position?.name?.toUpperCase().includes('AYUDANTE')
            : p.position?.name?.toUpperCase().includes('CONDUCTOR'))
      );

      if (partner) {
        pairs.push({
          time: `${a.shift?.start_time?.substring(0, 5)} - ${a.shift?.end_time?.substring(0, 5)}`,
          conductor: isConductor ? a : partner,
          ayudante: isConductor ? partner : a,
          id: `${a.id}-${partner.id}`,
        });
        used.add(a.id);
        used.add(partner.id);
      } else {
        pairs.push({
          time: `${a.shift?.start_time?.substring(0, 5)} - ${a.shift?.end_time?.substring(0, 5)}`,
          conductor: isConductor ? a : null,
          ayudante: isConductor ? null : a,
          id: a.id,
        });
        used.add(a.id);
      }
    });
    return pairs;
  };

  const bluePairs = pairBlueExpress();
  const blueIds = new Set(blueExpressRaw.map(a => a.id));

  // ── 6. BODEGAS (DHL, FEDEX, OTROS BODEGA) ──
  const dhl = sortByTime(
    activeAssignments.filter(
      a =>
        !blueIds.has(a.id) &&
        !aeropuertoIds.has(a.id) &&
        ((a.position?.name || '').toUpperCase().includes('DHL') ||
          (a.area?.name || '').toUpperCase().includes('DHL'))
    )
  );

  const fedex = sortByTime(
    activeAssignments.filter(
      a =>
        !blueIds.has(a.id) &&
        !aeropuertoIds.has(a.id) &&
        ((a.position?.name || '').toUpperCase().includes('FEDEX') ||
          (a.area?.name || '').toUpperCase().includes('FEDEX'))
    )
  );

  const dhlIds = new Set(dhl.map(a => a.id));
  const fedexIds = new Set(fedex.map(a => a.id));

  const bodegasOthers = sortByTime(
    activeAssignments.filter(
      a =>
        !blueIds.has(a.id) &&
        !aeropuertoIds.has(a.id) &&
        !dhlIds.has(a.id) &&
        !fedexIds.has(a.id) &&
        ((a.area?.name || '').toUpperCase().includes('BODEGA') ||
          (a.position?.name || '').toUpperCase().includes('BODEGA'))
    )
  );
  const bodegasIds = new Set([...dhlIds, ...fedexIds, ...bodegasOthers.map(a => a.id)]);

  // ── 7. OTRAS ÁREAS RESTANTES (Lavado, Taller, etc.) ──
  const remainingAssignments = sortByTime(
    activeAssignments.filter(
      a =>
        !supervisorIds.has(a.personnel_id) &&
        !canesIds.has(a.personnel_id) &&
        !cranesIds.has(a.personnel_id) &&
        !aeropuertoIds.has(a.id) &&
        !blueIds.has(a.id) &&
        !bodegasIds.has(a.id)
    )
  );

  const renderBadgeName = (a: any) => {
    if (!a?.personnel) return '-';
    const isExtra = a.is_extra;
    const isAbsent = a.attendance_status === 'absent';

    return (
      <span
        className={`inline-flex items-center gap-1 font-bold uppercase text-[11px] px-2 py-0.5 rounded ${
          isAbsent
            ? 'line-through text-red-500 bg-red-50 border border-red-200'
            : isExtra
            ? 'bg-rose-100 text-rose-950 border border-rose-300 shadow-xs'
            : 'text-slate-800 bg-slate-100/90'
        }`}
      >
        {isExtra && <Star className="w-2.5 h-2.5 fill-rose-600 text-rose-600 inline shrink-0" />}
        {formatName(a.personnel)}
      </span>
    );
  };

  const formattedDate = new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00`));

  return (
    <div className="w-[1280px] h-[720px] bg-white text-slate-900 p-6 flex flex-col justify-between font-sans box-border select-none rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
      {/* ── PRINT-STYLE HEADER ── */}
      <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2.5">
        <div className="flex items-center gap-4">
          <div className="h-10 w-32 bg-white rounded-lg p-1 flex items-center justify-center border border-slate-100 shadow-xs">
            <img src="/logo.jpg" alt="Minerquim Logo" className="h-full w-auto object-contain" />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase text-slate-950 tracking-tight leading-none">
              Programación Operativa Diaria
            </h1>
            <p className="text-xs font-bold text-slate-500 uppercase mt-1">
              {formattedDate} • Planta Pudahuel
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-right">
          <div className="bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 text-xs">
            <span className="font-bold text-slate-700 uppercase">Dotación Total: </span>
            <span className="font-black text-indigo-700 text-sm ml-1">{activeAssignments.length}</span>
          </div>
          <div className="bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg text-xs">
            <span className="font-bold text-rose-700 uppercase">Turnos Extra: </span>
            <span className="font-black text-rose-800 text-sm ml-1">
              {activeAssignments.filter(a => a.is_extra).length}
            </span>
          </div>
        </div>
      </div>

      {/* ── CONTENT BODY (2 BALANCED COLUMNS) ── */}
      <div className="grid grid-cols-12 gap-4 flex-1 my-2.5 min-h-0 overflow-hidden">
        
        {/* ── COLUMNA IZQUIERDA (6 cols): Transporte Blue Express & Bodegas ── */}
        <div className="col-span-6 flex flex-col gap-2.5 min-h-0">
          
          {/* Transporte Blue Express */}
          <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3 flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-1.5 shrink-0">
              <div className="flex items-center gap-1.5 text-indigo-800 font-black text-xs uppercase tracking-wider">
                <Truck className="w-4 h-4 text-indigo-600" />
                <span>Transporte Blue Express (Rutas y Camiones)</span>
              </div>
              <span className="text-[10px] font-bold text-slate-500">
                {bluePairs.length} parejas
              </span>
            </div>

            <div className="flex-1 overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="text-[9px] font-black uppercase text-slate-500 border-b border-slate-200">
                    <th className="py-0.5 w-[90px]">Horario</th>
                    <th className="py-0.5 w-[45%]">Conductor</th>
                    <th className="py-0.5 w-[45%]">Ayudante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70">
                  {bluePairs.map((pair) => (
                    <tr key={pair.id} className="hover:bg-slate-100/50">
                      <td className="py-1 font-mono text-[10px] text-slate-600 font-bold">
                        {pair.time}
                      </td>
                      <td className="py-1">
                        {pair.conductor ? renderBadgeName(pair.conductor) : <span className="text-slate-400 italic text-[10px]">-</span>}
                      </td>
                      <td className="py-1">
                        {pair.ayudante ? renderBadgeName(pair.ayudante) : <span className="text-slate-400 italic text-[10px]">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {bluePairs.length === 0 && (
                <p className="text-slate-400 text-xs italic text-center py-4">
                  No hay rutas Blue Express planificadas para hoy
                </p>
              )}
            </div>
          </div>

          {/* Bodegas (DHL, FEDEX, OTROS) */}
          <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3 flex flex-col shrink-0">
            <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-2">
              <div className="flex items-center gap-1.5 text-slate-800 font-black text-xs uppercase tracking-wider">
                <Warehouse className="w-4 h-4 text-slate-700" />
                <span>Bodegas ({dhl.length + fedex.length + bodegasOthers.length})</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400 font-bold">
                Asignación por Bodega
              </span>
            </div>

            <div className="space-y-2">
              {/* DHL */}
              {dhl.length > 0 && (
                <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="bg-slate-900 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                      DHL ({dhl.length})
                    </span>
                    <span className="font-mono text-[9px] text-slate-500 font-bold">
                      {dhl[0].shift?.start_time?.substring(0, 5)} - {dhl[0].shift?.end_time?.substring(0, 5)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {dhl.map(a => (
                      <span key={a.id}>{renderBadgeName(a)}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* FEDEX */}
              {fedex.length > 0 && (
                <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="bg-indigo-900 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                      FEDEX ({fedex.length})
                    </span>
                    <span className="font-mono text-[9px] text-slate-500 font-bold">
                      {fedex[0].shift?.start_time?.substring(0, 5)} - {fedex[0].shift?.end_time?.substring(0, 5)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {fedex.map(a => (
                      <span key={a.id}>{renderBadgeName(a)}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* OTROS BODEGA */}
              {bodegasOthers.length > 0 && (
                <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="bg-yellow-400 text-yellow-950 text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                      OTRAS BODEGAS ({bodegasOthers.length})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {bodegasOthers.map(a => (
                      <span key={a.id}>{renderBadgeName(a)}</span>
                    ))}
                  </div>
                </div>
              )}

              {dhl.length === 0 && fedex.length === 0 && bodegasOthers.length === 0 && (
                <span className="text-xs text-slate-400 italic">Sin personal asignado a bodegas hoy</span>
              )}
            </div>
          </div>
        </div>

        {/* ── COLUMNA DERECHA (6 cols): Supervisión, Canes, Aeropuerto & Restantes ── */}
        <div className="col-span-6 flex flex-col gap-2.5 min-h-0">
          
          {/* Supervisión en Turno */}
          <div className="bg-indigo-50/60 border border-indigo-200/90 rounded-xl p-2.5 shrink-0">
            <div className="flex items-center gap-1.5 text-indigo-900 font-black text-xs uppercase tracking-wider border-b border-indigo-200 pb-1 mb-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>Supervisión en Turno</span>
            </div>
            <div className="space-y-1">
              {groupBySlot(supervisors).map((group, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-indigo-700 font-bold w-24 shrink-0">
                    {group[0].shift?.start_time?.substring(0, 5)} - {group[0].shift?.end_time?.substring(0, 5)}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {group.map(a => (
                      <span key={a.id}>{renderBadgeName(a)}</span>
                    ))}
                  </div>
                </div>
              ))}
              {supervisors.length === 0 && (
                <span className="text-xs text-slate-400 italic">Sin supervisores asignados</span>
              )}
            </div>
          </div>

          {/* Canes, Grúas & Base */}
          <div className="bg-amber-50/50 border border-amber-200/90 rounded-xl p-2.5 shrink-0">
            <div className="flex items-center gap-1.5 text-amber-900 font-black text-xs uppercase tracking-wider border-b border-amber-200 pb-1 mb-1.5">
              <Dna className="w-3.5 h-3.5 text-amber-600" />
              <span>Canes, Grúas & Base</span>
            </div>
            <div className="space-y-1">
              {[...groupBySlot(canes), ...groupBySlot(cranes)].map((group, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-slate-600 font-bold w-24 shrink-0">
                    {group[0].shift?.start_time?.substring(0, 5)} - {group[0].shift?.end_time?.substring(0, 5)}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {group.map(a => (
                      <span key={a.id}>{renderBadgeName(a)}</span>
                    ))}
                  </div>
                </div>
              ))}
              {canes.length === 0 && cranes.length === 0 && (
                <span className="text-xs text-slate-400 italic">Sin asignaciones en estas áreas</span>
              )}
            </div>
          </div>

          {/* Aeropuerto (Operadores, Cazador, Noche) COMPLETO SIN RECORTES */}
          <div className="bg-blue-50/60 border border-blue-200/90 rounded-xl p-2.5 flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between border-b border-blue-200 pb-1 mb-1.5 shrink-0">
              <div className="flex items-center gap-1.5 text-blue-900 font-black text-xs uppercase tracking-wider">
                <Plane className="w-3.5 h-3.5 text-blue-600" />
                <span>Aeropuerto (Operadores, Cazador & Turno Noche)</span>
              </div>
              <span className="text-[10px] font-bold text-blue-700">
                {aeropuerto.length} asignaciones
              </span>
            </div>

            <div className="flex-1 overflow-hidden space-y-1">
              {groupBySlot(aeropuerto).map((group, idx) => (
                <div key={idx} className="flex items-center gap-2 py-0.5">
                  <div className="w-28 shrink-0 flex flex-col">
                    <span className="font-mono text-[10px] font-bold text-slate-700 leading-tight">
                      {group[0].shift?.start_time?.substring(0, 5)} - {group[0].shift?.end_time?.substring(0, 5)}
                    </span>
                    <span className="text-[8px] font-bold uppercase text-blue-600 leading-tight">
                      {group[0].position?.name || 'OPERADOR'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {group.map(a => (
                      <span key={a.id}>{renderBadgeName(a)}</span>
                    ))}
                  </div>
                </div>
              ))}
              {aeropuerto.length === 0 && (
                <span className="text-xs text-slate-400 italic">Sin personal asignado en Aeropuerto hoy</span>
              )}
            </div>
          </div>

          {/* Otras Áreas Operativas si quedan restantes (Lavado, Taller, etc.) */}
          {remainingAssignments.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 shrink-0">
              <div className="text-[9px] font-black uppercase text-slate-600 mb-1">
                Otras Áreas Operativas ({remainingAssignments.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {remainingAssignments.map(a => (
                  <span key={a.id}>{renderBadgeName(a)}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── FOOTER BAR ── */}
      <div className="border-t border-slate-200 pt-1.5 flex items-center justify-between text-[10px] text-slate-500">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <strong className="text-rose-700">Turno Extra</strong>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span>Turno Regular</span>
          </span>
        </div>
        <div className="font-mono text-[10px] text-slate-400 uppercase tracking-widest font-bold">
          v1.4.0 • Programación Operativa Minerquim
        </div>
      </div>
    </div>
  );
}
