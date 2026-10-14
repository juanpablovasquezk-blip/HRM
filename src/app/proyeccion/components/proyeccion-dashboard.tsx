'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Star, 
  AlertCircle, 
  CalendarOff, 
  Bus, 
  Clock, 
  CheckCircle2,
  Building2,
  Cake,
  FileWarning,
  Sparkles,
  AlertTriangle
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
  const hasBirthdaysToday = (data.birthdays?.todayBirthdays || []).length > 0;
  const hasExpiredDocs = (data.documents?.expiredCount || 0) > 0;
  const totalDocAlerts = (data.documents?.expiredCount || 0) + (data.documents?.expiringSoonCount || 0) + (data.documents?.missingCount || 0);

  return (
    <div className="w-[1280px] h-[720px] bg-slate-950 text-slate-100 p-6 flex flex-col justify-between font-sans box-border select-none border border-slate-800/80 rounded-2xl shadow-2xl overflow-hidden">
      {/* ── HEADER ── */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-4">
          <div className="h-11 w-32 bg-white rounded-xl p-1.5 flex items-center justify-center shadow-md">
            <img src="/logo.jpg" alt="Minerquim Logo" className="h-full w-auto object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black tracking-widest text-orange-500 uppercase bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">
                Minerquim Operaciones
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                En Vivo
              </span>
            </div>
            <h1 className="text-xl font-black tracking-tight text-white uppercase mt-0.5">
              Dashboard Operativo del Día
            </h1>
          </div>
        </div>

        {/* Date & Clock */}
        <div className="text-right flex items-center gap-5">
          <div className="border-r border-slate-800 pr-5">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {data.dateFormatted}
            </div>
            <div className="text-xs font-bold text-slate-300">
              Planta Pudahuel
            </div>
          </div>
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3.5 py-1.5 rounded-xl">
            <Clock className="w-5 h-5 text-orange-400 animate-pulse" />
            <span className="font-mono text-2xl font-black text-white tracking-wider">
              {timeStr || '--:--:--'}
            </span>
          </div>
        </div>
      </div>

      {/* ── FESTIVE BANNER: CUMPLEAÑOS DE HOY ── */}
      {hasBirthdaysToday && (
        <div className="my-1.5 bg-gradient-to-r from-pink-600/30 via-purple-600/30 to-amber-600/30 border border-pink-500/50 rounded-xl px-4 py-2 flex items-center justify-between shadow-lg animate-pulse">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-pink-500 rounded-lg text-white shadow-md">
              <Cake className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-pink-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                ¡HOY ESTÁ DE CUMPLEAÑOS!
              </span>
              <span className="text-sm font-bold text-white ml-1">
                {data.birthdays.todayBirthdays.map(b => b.name).join(' • ')}
              </span>
            </div>
          </div>
          <span className="text-xs font-bold text-pink-200/90 bg-pink-500/20 px-3 py-1 rounded-full border border-pink-400/30">
            🎉 ¡Felicidades de parte de todo el equipo! 🎂
          </span>
        </div>
      )}

      {/* ── ROW 1: 6 HIGH-IMPACT KPIS ── */}
      <div className="grid grid-cols-6 gap-3 my-2">
        {/* KPI 1: En Turno */}
        <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">En Turno</span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-1">
            <div className="text-3xl font-black text-white tracking-tight">
              {data.scheduledToday}
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              de {data.totalActivePersonnel} activos
            </p>
          </div>
        </div>

        {/* KPI 2: Extras */}
        <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Turnos Extra</span>
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <Star className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-1">
            <div className="text-3xl font-black text-rose-400 tracking-tight">
              {data.extrasToday}
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              cobertura adicional
            </p>
          </div>
        </div>

        {/* KPI 3: Faltas */}
        <div className={`p-3.5 rounded-xl flex flex-col justify-between border ${
          hasAbsences ? 'bg-red-950/30 border-red-800/60' : 'bg-slate-900/90 border-slate-800'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Faltas Hoy</span>
            <div className={`p-1.5 rounded-lg border ${
              hasAbsences 
                ? 'bg-red-500/20 text-red-400 border-red-500/30' 
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            }`}>
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-1">
            <div className={`text-3xl font-black tracking-tight ${hasAbsences ? 'text-red-400' : 'text-emerald-400'}`}>
              {data.absentToday.length}
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              {hasAbsences ? 'requiere aviso' : '100% presentes'}
            </p>
          </div>
        </div>

        {/* KPI 4: Licencias / Vac. */}
        <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Licencias / Vac.</span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <CalendarOff className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-1">
            <div className="text-3xl font-black text-amber-400 tracking-tight">
              {totalLeavesAndVacations}
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              fuera de turno
            </p>
          </div>
        </div>

        {/* KPI 5: Documentos Críticos (Vencidos / Faltantes) */}
        <div className={`p-3.5 rounded-xl flex flex-col justify-between border ${
          hasExpiredDocs ? 'bg-red-950/30 border-red-800/60' : 'bg-slate-900/90 border-slate-800'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Doc. Críticos</span>
            <div className={`p-1.5 rounded-lg border ${
              hasExpiredDocs 
                ? 'bg-red-500/20 text-red-400 border-red-500/30' 
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}>
              <FileWarning className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-1">
            <div className="flex items-baseline gap-1.5">
              <span className={`text-3xl font-black tracking-tight ${hasExpiredDocs ? 'text-red-400' : 'text-amber-400'}`}>
                {data.documents?.expiredCount || 0}
              </span>
              <span className="text-xs font-bold text-slate-400">
                vencidos
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              +{data.documents?.expiringSoonCount || 0} por vencer
            </p>
          </div>
        </div>

        {/* KPI 6: Cumpleaños Mes */}
        <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Cumpleaños {data.birthdays?.monthName}</span>
            <div className="p-1.5 rounded-lg bg-pink-500/10 text-pink-400 border border-pink-500/20">
              <Cake className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-1">
            <div className="text-3xl font-black text-pink-400 tracking-tight">
              {data.birthdays?.monthBirthdays?.length || 0}
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              {hasBirthdaysToday ? `🎉 ${data.birthdays.todayBirthdays.length} hoy` : 'en este mes'}
            </p>
          </div>
        </div>
      </div>

      {/* ── ROW 2: 3 BALANCED OPERATIONAL COLUMNS ── */}
      <div className="grid grid-cols-12 gap-3.5 flex-1 min-h-0 my-1">
        {/* COL 1 (4 cols): Novedades de Asistencia (Hoy) */}
        <div className="col-span-4 bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col min-h-0">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 shrink-0">
            <div className="flex items-center gap-1.5 text-red-400 font-bold text-xs uppercase tracking-wide">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Asistencia & Licencias</span>
            </div>
            <span className="text-[10px] text-slate-400">
              {data.absentToday.length + totalLeavesAndVacations} en alerta
            </span>
          </div>

          <div className="flex-1 overflow-hidden space-y-2">
            {/* Faltas */}
            {data.absentToday.length > 0 && (
              <div className="space-y-1">
                <div className="text-[9px] font-black text-red-400 uppercase tracking-wider">
                  Faltas de Hoy ({data.absentToday.length})
                </div>
                {data.absentToday.slice(0, 3).map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between bg-red-950/40 border border-red-900/50 px-2.5 py-1 rounded-md text-[11px]"
                  >
                    <span className="font-bold text-red-300 uppercase truncate max-w-[150px]">{a.name}</span>
                    <span className="text-[10px] text-red-400/90 italic truncate max-w-[140px]">
                      {a.comment}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Licencias / Vacaciones */}
            {data.leavesToday.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="text-[9px] font-black text-amber-400 uppercase tracking-wider">
                  Licencias y Vacaciones ({data.leavesToday.length})
                </div>
                {data.leavesToday.slice(0, 3).map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between bg-amber-950/30 border border-amber-900/40 px-2.5 py-1 rounded-md text-[11px]"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-amber-300 uppercase truncate max-w-[140px]">{l.name}</span>
                      <span className="text-[9px] uppercase font-bold px-1 py-0.2 rounded bg-amber-500/20 text-amber-300">
                        {l.type === 'sick' ? 'Médica' : 'Vacaciones'}
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-slate-400">Hasta {l.endDate.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}

            {data.absentToday.length === 0 && data.leavesToday.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500">
                <CheckCircle2 className="w-10 h-10 text-emerald-500/40 mb-1" />
                <p className="text-xs font-bold text-slate-300 uppercase">Sin Ausencias Hoy</p>
                <p className="text-[10px] text-slate-500">100% de la dotación operativa</p>
              </div>
            )}
          </div>
        </div>

        {/* COL 2 (4 cols): Alertas de Documentos (Vencidos / Por Vencer / Faltantes) */}
        <div className="col-span-4 bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col min-h-0">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 shrink-0">
            <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs uppercase tracking-wide">
              <FileWarning className="w-3.5 h-3.5" />
              <span>Control Documental</span>
            </div>
            <div className="flex items-center gap-1.5 text-[9px] font-bold">
              {data.documents?.expiredCount > 0 && (
                <span className="bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded border border-red-500/30">
                  {data.documents.expiredCount} vencidos
                </span>
              )}
              {data.documents?.expiringSoonCount > 0 && (
                <span className="bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                  {data.documents.expiringSoonCount} por vencer
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-hidden space-y-1.5">
            {data.documents?.alerts && data.documents.alerts.length > 0 ? (
              data.documents.alerts.slice(0, 5).map((doc) => (
                <div
                  key={doc.id}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-md border text-[11px] ${
                    doc.type === 'expired'
                      ? 'bg-red-950/40 border-red-800/60 text-red-200'
                      : doc.type === 'expiring_soon'
                      ? 'bg-amber-950/30 border-amber-800/50 text-amber-200'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="truncate max-w-[210px]">
                    <div className="font-bold uppercase text-[11px] truncate">{doc.personnelName}</div>
                    <div className="text-[9px] text-slate-400 truncate">{doc.documentName}</div>
                  </div>
                  <span
                    className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                      doc.type === 'expired'
                        ? 'bg-red-500/20 text-red-300'
                        : doc.type === 'expiring_soon'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {doc.detail}
                  </span>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500">
                <CheckCircle2 className="w-10 h-10 text-emerald-500/40 mb-1" />
                <p className="text-xs font-bold text-slate-300 uppercase">Documentación al Día</p>
                <p className="text-[10px] text-slate-500">Sin documentos vencidos ni pendientes</p>
              </div>
            )}
          </div>
        </div>

        {/* COL 3 (4 cols): Cumpleaños & Horarios de Turno */}
        <div className="col-span-4 bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col min-h-0 justify-between">
          {/* Cumpleaños del Mes */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 shrink-0">
              <div className="flex items-center gap-1.5 text-pink-400 font-bold text-xs uppercase tracking-wide">
                <Cake className="w-3.5 h-3.5" />
                <span>Cumpleaños ({data.birthdays?.monthName})</span>
              </div>
              <span className="text-[10px] text-slate-400">
                {data.birthdays?.monthBirthdays?.length || 0} este mes
              </span>
            </div>

            <div className="flex-1 overflow-hidden space-y-1">
              {data.birthdays?.monthBirthdays && data.birthdays.monthBirthdays.length > 0 ? (
                data.birthdays.monthBirthdays.slice(0, 4).map((b) => (
                  <div
                    key={b.id}
                    className={`flex items-center justify-between px-2.5 py-1 rounded-md text-[11px] ${
                      b.isToday
                        ? 'bg-pink-950/60 border border-pink-500/60 text-pink-200 shadow-xs'
                        : 'bg-slate-950/50 border border-slate-800/80 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      {b.isToday && <span className="text-xs">🎂</span>}
                      <span className="font-bold uppercase truncate">{b.name}</span>
                    </div>
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded shrink-0 ${
                        b.isToday ? 'bg-pink-500 text-white' : 'text-slate-400 bg-slate-900'
                      }`}
                    >
                      {b.isToday ? '¡HOY!' : `${b.day} ${data.birthdays.monthName.slice(0, 3)}`}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center text-slate-500 text-xs py-3 italic">
                  Sin cumpleaños registrados este mes
                </div>
              )}
            </div>
          </div>

          {/* Resumen de Transporte y Turnos en footer */}
          <div className="mt-2 pt-2 border-t border-slate-800/80 shrink-0">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1 text-slate-400">
                <Bus className="w-3.5 h-3.5 text-sky-400" />
                <span>Transporte:</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] font-bold">
                <span className="text-sky-400">{data.transport.empresa} Empresa</span>
                <span className="text-slate-500">|</span>
                <span className="text-emerald-400">{data.transport.propio} Propio</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
