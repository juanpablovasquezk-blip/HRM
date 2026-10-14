'use client';

import React from 'react';
import { ShieldCheck, Users, Truck, Dna, Building2, Star } from 'lucide-react';
import type { ProyeccionDailyData } from '../actions';

interface ProyeccionDailyProps {
  data: ProyeccionDailyData;
}

export function ProyeccionDaily({ data }: ProyeccionDailyProps) {
  const { assignments, date } = data;

  // Filter out any cancelled assignments (just in case)
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

  // ── GROUPING SECTIONS ──
  const supervisors = sortByTime(
    activeAssignments.filter(a => a.position?.name?.toUpperCase().includes('SUPERVISOR'))
  );
  const supervisorIds = new Set(supervisors.map(s => s.personnel_id));

  const canes = sortByTime(
    activeAssignments.filter(
      a => !supervisorIds.has(a.personnel_id) && a.position?.name?.toUpperCase().includes('CANES')
    )
  );
  const canesIds = new Set(canes.map(c => c.personnel_id));

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

  // Blue Express Pairing
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

  // Bodegas, DHL, Fedex, Otros
  const otherAssignments = sortByTime(
    activeAssignments.filter(
      a =>
        !supervisorIds.has(a.personnel_id) &&
        !canesIds.has(a.personnel_id) &&
        !cranesIds.has(a.personnel_id) &&
        !blueIds.has(a.id)
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
        {isExtra && <Star className="w-2.5 h-2.5 fill-rose-600 text-rose-600 inline" />}
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
    <div className="w-[1280px] h-[720px] bg-white text-slate-900 p-7 flex flex-col justify-between font-sans box-border select-none rounded-2xl shadow-2xl border border-slate-200">
      {/* ── PRINT-STYLE HEADER ── */}
      <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3">
        <div className="flex items-center gap-4">
          <div className="h-11 w-32 bg-white rounded-lg p-1 flex items-center justify-center border border-slate-100 shadow-xs">
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

        <div className="flex items-center gap-4 text-right">
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

      {/* ── CONTENT BODY (2 COLUMNS TO MAXIMIZE 16:9 VIEW) ── */}
      <div className="grid grid-cols-12 gap-5 flex-1 my-3 min-h-0 overflow-hidden">
        {/* LEFT COLUMN: Camiones Blue Express (Main Operation) */}
        <div className="col-span-7 bg-slate-50/70 border border-slate-200 rounded-xl p-3.5 flex flex-col min-h-0">
          <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-2 shrink-0">
            <div className="flex items-center gap-2 text-indigo-800 font-black text-xs uppercase tracking-wider">
              <Truck className="w-4 h-4 text-indigo-600" />
              <span>Transporte Blue Express (Rutas y Camiones)</span>
            </div>
            <span className="text-[11px] font-bold text-slate-500">
              {bluePairs.length} parejas asignadas
            </span>
          </div>

          <div className="flex-1 overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="text-[10px] font-black uppercase text-slate-500 border-b border-slate-200">
                  <th className="py-1 w-[95px]">Horario</th>
                  <th className="py-1 w-[45%]">Conductor</th>
                  <th className="py-1 w-[45%]">Ayudante</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {bluePairs.slice(0, 10).map((pair) => (
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
              <p className="text-slate-400 text-xs italic text-center py-6">
                No hay rutas Blue Express planificadas para hoy
              </p>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Supervisores + Canes + Grúas + Áreas */}
        <div className="col-span-5 flex flex-col gap-3 min-h-0">
          {/* Supervisores */}
          <div className="bg-indigo-50/50 border border-indigo-200/80 rounded-xl p-3 shrink-0">
            <div className="flex items-center gap-1.5 text-indigo-900 font-black text-xs uppercase tracking-wider border-b border-indigo-200 pb-1 mb-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>Supervisión en Turno</span>
            </div>
            <div className="space-y-1">
              {groupBySlot(supervisors).map((group, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-indigo-700 font-bold w-20 shrink-0">
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

          {/* Canes & Grúas / Atrex */}
          <div className="bg-amber-50/40 border border-amber-200/80 rounded-xl p-3 shrink-0">
            <div className="flex items-center gap-1.5 text-amber-900 font-black text-xs uppercase tracking-wider border-b border-amber-200 pb-1 mb-1.5">
              <Dna className="w-3.5 h-3.5 text-amber-600" />
              <span>Canes, Grúas & Base</span>
            </div>
            <div className="space-y-1">
              {[...groupBySlot(canes), ...groupBySlot(cranes)].slice(0, 4).map((group, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-slate-500 font-bold w-20 shrink-0">
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

          {/* Otras Áreas (Bodegas, DHL, etc.) */}
          <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-3 flex-1 min-h-0 overflow-hidden flex flex-col">
            <div className="flex items-center gap-1.5 text-slate-800 font-black text-xs uppercase tracking-wider border-b border-slate-200 pb-1 mb-1.5 shrink-0">
              <Building2 className="w-3.5 h-3.5 text-slate-600" />
              <span>Otras Áreas Operativas</span>
            </div>
            <div className="flex-1 overflow-hidden space-y-1">
              {groupBySlot(otherAssignments).slice(0, 5).map((group, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs">
                  <div className="w-20 shrink-0">
                    <div className="font-mono text-[10px] font-bold text-slate-600">
                      {group[0].shift?.start_time?.substring(0, 5)} - {group[0].shift?.end_time?.substring(0, 5)}
                    </div>
                    <div className="text-[8px] uppercase text-slate-400 truncate">
                      {group[0].area?.name || group[0].position?.name}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.map(a => (
                      <span key={a.id}>{renderBadgeName(a)}</span>
                    ))}
                  </div>
                </div>
              ))}
              {otherAssignments.length === 0 && (
                <span className="text-xs text-slate-400 italic">Sin otras áreas asignadas</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── FOOTER BAR ── */}
      <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-[11px] text-slate-500">
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
        <div className="font-mono text-[10px] text-slate-400 uppercase tracking-widest">
          SISTEMA HRM • VISTA DE PROYECCIÓN AUTOMÁTICA
        </div>
      </div>
    </div>
  );
}
