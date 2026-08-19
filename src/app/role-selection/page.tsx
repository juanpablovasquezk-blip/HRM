'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Users, User, ArrowRight, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { globalLogout } from '../auth-actions';

export default function RoleSelectionPage() {
  const [loading, setLoading] = useState(true);
  const [canSupervisor, setCanSupervisor] = useState(false);
  const [canWorker, setCanWorker] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function checkRoles() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login');
          return;
        }

        // Fetch latest role from server (securely fetches from DB via Admin Client)
        const { getUserRole } = await import('@/app/role-actions');
        const role = await getUserRole() || 'USER';
        const isManagement = ['ADMIN', 'SUPERVISOR', 'HR', 'AIRPORT_ASSISTANT', 'ASSISTANT', 'SAFETY_OFFICER'].includes(role);

        // Check if exists in personnel table
        const { data: personnel } = await supabase
          .from('personnel')
          .select('id')
          .eq('email', user.email?.trim().toLowerCase())
          .maybeSingle();

        const hasWorkerRole = !!personnel;
        const hasManagementRole = isManagement;

        setCanSupervisor(hasManagementRole);
        setCanWorker(hasWorkerRole);

        // Smart Redirection
        if (hasManagementRole && !hasWorkerRole) {
          router.push((role === 'ADMIN' || role === 'HR' || role === 'AIRPORT_ASSISTANT' || role === 'SAFETY_OFFICER') ? '/dashboard' : '/supervisor');
        } else if (hasWorkerRole && !hasManagementRole) {
          router.push('/worker');
        } else if (!hasManagementRole && !hasWorkerRole) {
          // Fallback: If no role detected, assume worker (safety) or logout
          router.push('/worker');
        } else {
          // User has BOTH, stay here and show selection
          setLoading(false);
        }
      } catch (error) {
        console.error('Role check error:', error);
        setLoading(false);
      }
    }

    checkRoles();
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 text-orange-500 animate-spin" />
          <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Verificando accesos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto mb-4 relative h-[80px] w-auto inline-flex items-center justify-center">
            <img src="/logo.png" alt="Logo" className="h-full w-auto object-contain" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Detectamos dos roles</h1>
          <p className="text-slate-500 text-sm font-medium">Eres trabajador y supervisor. Elige cómo entrar:</p>
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
          <button 
            onClick={() => globalLogout()}
            className="text-slate-400 hover:text-red-500 text-xs font-bold uppercase tracking-widest transition-colors"
          >
            Cerrar Sesión
          </button>
        </div>
      </div>
    </div>
  );
}
