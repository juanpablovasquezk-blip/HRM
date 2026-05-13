'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Users, User, ArrowRight } from 'lucide-react';

export default function RoleSelectionPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <img src="/logo.png" alt="Logo" className="h-16 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">¿Cómo quieres ingresar?</h1>
          <p className="text-slate-500 text-sm font-medium">Selecciona el modo de vista para continuar</p>
        </div>

        <div className="grid gap-4">
          <Link href="/supervisor">
            <Card className="hover:border-orange-500 hover:bg-orange-50/50 transition-all cursor-pointer group border-2 border-transparent bg-white shadow-xl shadow-slate-200/50 rounded-3xl overflow-hidden">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="h-14 w-14 rounded-2xl bg-orange-100 flex items-center justify-center text-orange-600 group-hover:bg-orange-500 group-hover:text-white transition-all duration-300">
                  <Users className="h-7 w-7" />
                </div>
                <div className="flex-1 text-left">
                  <h3 className="font-black text-slate-900 uppercase text-sm tracking-tight">Modo Supervisor</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Gestionar asistencia, transporte y personal del equipo.</p>
                </div>
                <ArrowRight className="h-5 w-5 text-slate-200 group-hover:text-orange-500 group-hover:translate-x-1 transition-all" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/worker">
            <Card className="hover:border-indigo-500 hover:bg-indigo-50/50 transition-all cursor-pointer group border-2 border-transparent bg-white shadow-xl shadow-slate-200/50 rounded-3xl overflow-hidden">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="h-14 w-14 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-500 group-hover:text-white transition-all duration-300">
                  <User className="h-7 w-7" />
                </div>
                <div className="flex-1 text-left">
                  <h3 className="font-black text-slate-900 uppercase text-sm tracking-tight">Mi Roster Personal</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Ver mis propios turnos, documentos y transporte solicitado.</p>
                </div>
                <ArrowRight className="h-5 w-5 text-slate-200 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="text-center pt-4">
          <Link href="/login">
            <button className="text-slate-400 hover:text-slate-600 text-xs font-bold uppercase tracking-widest">
              Volver al Login
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
