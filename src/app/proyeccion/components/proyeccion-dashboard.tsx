'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Star, 
  AlertCircle, 
  CalendarOff, 
  Plane, 
  Car, 
  Bus, 
  Clock, 
  CheckCircle2,
  ShieldCheck,
  Building2
} from 'lucide-react';
import type { ProyeccionDashboardData } from '../actions';

interface ProyeccionDashboardProps {
  data: ProyeccionDashboardData;
}

export function ProyeccionDashboard({ data }: ProyeccionDashboardProps) {
  const [timeStr, setTimeStr] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString('es-CL', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const totalLeavesAndVacations = (data.leavesToday || []).length;
  const hasAbsences = (data.absentToday || []).length > 0;

  return (
    <div className="w-[1280px] h-[720px] bg-slate-950 text-slate-100 p-8 flex flex-col justify-between font-sans box-border select-none border border-slate-800/80 rounded-2xl shadow-2xl">
      {/* ── HEADER ── */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-32 bg-white rounded-xl p-1.5 flex items-center justify-center shadow-md">
            <img src="/logo.jpg" alt="Minerquim Logo" className="h-full w-auto object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-widest text-orange-500 uppercase bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">
                Minerquim Operaciones
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                En Vivo
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white uppercase mt-1">
              Dashboard Operativo del Día
            </h1>
          </div>
        </div>

        {/* Date & Clock */}
        <div className="text-right flex items-center gap-6">
          <div className="border-r border-slate-800 pr-6">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {data.dateFormatted}
            </div>
            <div className="text-sm font-bold text-slate-300">
              Operación Santiago
            </div>
          </div>
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl">
            <Clock className="w-6 h-6 text-orange-400 animate-pulse" />
            <span className="font-mono text-3xl font-black text-white tracking-wider">
              {timeStr || '--:--:--'}
            </span>
          </div>
        </div>
      </div>

      {/* ── ROW 1: 5 HIGH-IMPACT KPIS ── */}
      <div className="grid grid-cols-5 gap-4">
        {/* KPI 1: Personal en Turno */}
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">En Turno Hoy</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-4xl font-black text-white tracking-tight">
              {data.scheduledToday}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 font-medium">
              de {data.totalActivePersonnel} activos totales
            </p>
          </div>
        </div>

        {/* KPI 2: Turnos Extra */}
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Turnos Extra</span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <Star className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-4xl font-black text-rose-400 tracking-tight">
              {data.extrasToday}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 font-medium">
              cobertura adicional hoy
            </p>
          </div>
        </div>

        {/* KPI 3: Ausentismo Final Hoy */}
        <div className={`p-5 rounded-2xl flex flex-col justify-between border ${
          hasAbsences 
            ? 'bg-red-950/30 border-red-800/60' 
            : 'bg-slate-900/90 border-slate-800'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Faltas de Hoy</span>
            <div className={`p-2 rounded-xl border ${
              hasAbsences 
                ? 'bg-red-500/20 text-red-400 border-red-500/30' 
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            }`}>
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2">
            <div className={`text-4xl font-black tracking-tight ${hasAbsences ? 'text-red-400' : 'text-emerald-400'}`}>
              {data.absentToday.length}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 font-medium">
              {hasAbsences ? 'requieren atención' : 'asistencia completa'}
            </p>
          </div>
        </div>

        {/* KPI 4: Licencias y Vacaciones */}
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Licencias / Vac.</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <CalendarOff className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-4xl font-black text-amber-400 tracking-tight">
              {totalLeavesAndVacations}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 font-medium">
              personal fuera hoy
            </p>
          </div>
        </div>

        {/* KPI 5: Transporte Operativo */}
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Transporte Hoy</span>
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Bus className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-sky-400 tracking-tight">
                {data.transport.empresa}
              </span>
              <span className="text-sm font-bold text-slate-400">
                / {data.transport.propio} propio
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 font-medium">
              {data.transport.pendiente > 0 ? `⚠️ ${data.transport.pendiente} pendientes` : 'rutas confirmadas'}
            </p>
          </div>
        </div>
      </div>

      {/* ── ROW 2: DETAILED OPERATIONAL PANELS (2 COLUMNS) ── */}
      <div className="grid grid-cols-2 gap-6 flex-1 mt-4 min-h-0">
        {/* Left Column: Ausencias y Licencias con nombres */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col min-h-0">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3 shrink-0">
            <div className="flex items-center gap-2 text-red-400 font-bold text-sm uppercase tracking-wide">
              <AlertCircle className="w-4 h-4" />
              <span>Novedades de Asistencia (Hoy)</span>
            </div>
            <span className="text-xs text-slate-400 font-medium">
              {data.absentToday.length + totalLeavesAndVacations} registros
            </span>
          </div>

          <div className="flex-1 overflow-hidden space-y-2">
            {/* Ausentes sin aviso o justificación */}
            {data.absentToday.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                  Faltas Registradas ({data.absentToday.length})
                </div>
                {data.absentToday.slice(0, 4).map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between bg-red-950/40 border border-red-900/50 px-3 py-1.5 rounded-lg text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-red-300 uppercase">{a.name}</span>
                      <span className="text-[10px] text-slate-400">({a.areaName})</span>
                    </div>
                    <span className="text-[11px] text-red-400/90 italic truncate max-w-[200px]">
                      {a.comment}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Licencias / Vacaciones */}
            {data.leavesToday.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <div className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
                  Licencias y Permisos Vigentes ({data.leavesToday.length})
                </div>
                {data.leavesToday.slice(0, 4).map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between bg-amber-950/30 border border-amber-900/40 px-3 py-1.5 rounded-lg text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-amber-300 uppercase">{l.name}</span>
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                        {l.type === 'sick' ? 'Médica' : l.type === 'vacation' ? 'Vacaciones' : 'Permiso'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      Hasta {l.endDate}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {data.absentToday.length === 0 && data.leavesToday.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                <CheckCircle2 className="w-12 h-12 text-emerald-500/50 mb-2" />
                <p className="text-sm font-bold text-slate-300 uppercase">Sin Ausencias ni Licencias Hoy</p>
                <p className="text-xs text-slate-500 mt-1">El 100% del personal asignado está operativo</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Distribución por Turno y Transporte */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3 shrink-0">
            <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm uppercase tracking-wide">
              <Building2 className="w-4 h-4" />
              <span>Dotación por Horario (Hoy)</span>
            </div>
            <span className="text-xs text-slate-400 font-medium">
              {data.shiftsBreakdown.reduce((sum, s) => sum + s.count, 0)} puestos
            </span>
          </div>

          {/* Shift badges grid */}
          <div className="grid grid-cols-2 gap-3 flex-1 overflow-hidden">
            {data.shiftsBreakdown.slice(0, 6).map((sb, idx) => (
              <div
                key={idx}
                className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-black text-white uppercase">{sb.shiftName}</div>
                  <div className="text-[11px] font-mono text-slate-400">
                    {sb.startTime} - {sb.endTime}
                  </div>
                </div>
                <div className="text-2xl font-black text-orange-400 bg-orange-500/10 px-3 py-1 rounded-lg border border-orange-500/20">
                  {sb.count}
                </div>
              </div>
            ))}
            {data.shiftsBreakdown.length === 0 && (
              <div className="col-span-2 flex items-center justify-center text-slate-500 text-xs italic">
                No hay turnos registrados para hoy
              </div>
            )}
          </div>

          {/* Bottom status note */}
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Programación sincronizada con Supabase</span>
            </span>
            <span className="font-mono text-[10px] text-slate-500">
              Rotación automática activa
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
