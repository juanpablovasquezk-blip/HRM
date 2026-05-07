'use client';

import React, { useEffect, useState } from 'react';
import { getDailyPlanning, getSupervisorSession } from '../actions';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Users, 
  Clock, 
  Bus, 
  CalendarDays, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  TrendingUp
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';

export default function SupervisorDashboard() {
  const [data, setData] = useState<any>(null);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    async function load() {
      const s = await getSupervisorSession();
      if (!s) return;
      setSession(s);
      const d = await getDailyPlanning();
      setData(d);
    }
    load();
  }, []);

  if (!data || !session) return null;

  const totalPersonnel = data.assignments.length;
  const presentCount = data.assignments.filter((a: any) => a.attendance_status === 'present').length;
  const absentCount = data.assignments.filter((a: any) => a.attendance_status === 'absent').length;
  const pendingCount = totalPersonnel - presentCount - absentCount;

  const stats = [
    { label: 'Total Turnos', value: totalPersonnel, icon: Users, color: 'text-slate-900', bg: 'bg-slate-100' },
    { label: 'Presentes', value: presentCount, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Ausentes', value: absentCount, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Pendientes', value: pendingCount, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  return (
    <div className="p-6 space-y-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-slate-900 leading-tight">Panel de Control</h1>
          <p className="text-slate-500 font-medium">Supervisor: <span className="text-slate-900">{session.first_name} {session.last_name}</span></p>
        </div>
        <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-xl shadow-slate-200">
          <TrendingUp className="h-5 w-5" />
        </div>
      </div>

      {/* Date Banner */}
      <div className="bg-white border border-slate-100 p-4 rounded-3xl shadow-sm flex items-center gap-4">
        <div className="h-12 w-12 bg-indigo-50 rounded-2xl flex items-center justify-center shrink-0">
          <CalendarDays className="h-6 w-6 text-indigo-600" />
        </div>
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Hoy</p>
          <p className="font-bold text-slate-700 capitalize">{format(new Date(), "EEEE d 'de' MMMM", { locale: es })}</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        {stats.map((s, i) => (
          <Card key={i} className="border-none shadow-xl shadow-slate-200/40 rounded-3xl overflow-hidden">
            <CardContent className="p-5 space-y-3">
              <div className={`${s.bg} ${s.color} h-10 w-10 rounded-2xl flex items-center justify-center`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
                <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Acciones Rápidas</h2>
        
        <Link href="/supervisor/attendance" className="flex items-center gap-4 bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
          <div className="h-12 w-12 bg-orange-100 rounded-2xl flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-6 w-6 text-orange-600" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-slate-900 group-hover:text-orange-600 transition-colors">Pasar Asistencia</p>
            <p className="text-xs text-slate-400 font-medium italic">Control de llegada del personal</p>
          </div>
          <ChevronRight className="h-5 w-5 text-slate-300" />
        </Link>

        <Link href="/supervisor/transport" className="flex items-center gap-4 bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
          <div className="h-12 w-12 bg-indigo-100 rounded-2xl flex items-center justify-center shrink-0">
            <Bus className="h-6 w-6 text-indigo-600" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">Gestión Transporte</p>
            <p className="text-xs text-slate-400 font-medium italic">Cambios y observaciones de ruta</p>
          </div>
          <ChevronRight className="h-5 w-5 text-slate-300" />
        </Link>
      </div>

      {/* Info Card */}
      <div className="bg-slate-900 p-6 rounded-3xl text-white space-y-2 relative overflow-hidden shadow-2xl shadow-slate-300">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <ShieldCheck className="h-24 w-24" />
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">Recordatorio</p>
        <p className="text-sm font-bold leading-relaxed relative z-10">
          Recuerda marcar las inasistencias antes de las 09:00 AM para la correcta gestión de los turnos.
        </p>
      </div>
    </div>
  );
}

function ShieldCheck(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
