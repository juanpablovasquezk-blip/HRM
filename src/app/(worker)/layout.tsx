'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  CalendarDays, 
  Clock, 
  Bus, 
  LogOut,
  User,
  FileText,
  Users
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { logoutWorker } from './actions';
import { createClient } from '@/lib/supabase/client';
import { useState, useEffect } from 'react';

export default function WorkerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/worker/login';

  if (isLoginPage) return <>{children}</>;

  const [role, setRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [fichaIncomplete, setFichaIncomplete] = useState(false);

  useEffect(() => {
    const getRole = async () => {
      const { getUserRole } = await import('@/app/role-actions');
      const { getWorkerSession } = await import('./actions');
      const [currentRole, session] = await Promise.all([
        getUserRole(),
        getWorkerSession()
      ]);
      setRole(currentRole || 'USER');
      setUserName(session?.first_name || '');
      
      if (session) {
        setFichaIncomplete(
          !session.afp || !session.health_system || !session.bank_account_number || 
          !session.emergency_contact_phone || !session.gender || !session.marital_status || !session.phone
        );
      }
    };
    getRole();
  }, []);

  const navItems = [
    { label: 'Mañana', href: '/worker', icon: Clock },
    { label: 'Mi Mes', href: '/worker/roster', icon: CalendarDays },
    { label: 'Mis Docs', href: '/worker/documents', icon: FileText },
    { label: 'Mi Ficha', href: '/worker/profile', icon: User },
    { label: 'Movilidad', href: '/worker/transport', icon: Bus },
  ];

  if (role === 'SUPERVISOR' || role === 'ADMIN' || role === 'AIRPORT_ASSISTANT' || role === 'HR') {
    const targetPath = (role === 'ADMIN' || role === 'HR' || role === 'AIRPORT_ASSISTANT') ? '/dashboard' : '/supervisor';
    navItems.push({ label: 'Gestión', href: targetPath, icon: Users });
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Header Mobile */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg overflow-hidden">
            <img src="/icon.jpg" alt="Logo" className="h-full w-full object-cover" />
          </div>
          <span className="font-black text-sm uppercase tracking-tight text-slate-800">Mi Turno</span>
        </div>
        <button 
          onClick={async () => {
            await logoutWorker();
            window.location.href = '/login';
          }} 
          className="flex items-center gap-2 px-3 py-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all font-bold text-xs"
        >
          <LogOut className="h-4 w-4" />
          <span>Cerrar Sesión</span>
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 pb-24 overflow-x-hidden">
        {children}
      </main>

      {/* Bottom Navigation (Mobile Style) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-lg border-t border-slate-100 px-2 pb-safe pt-2 shadow-[0_-5px_15px_-5px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-around max-w-lg mx-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex flex-col items-center gap-1 py-2 px-4 rounded-2xl transition-all duration-300",
                  isActive 
                    ? "text-orange-600 bg-orange-50 scale-110" 
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                {fichaIncomplete && item.href === '/worker/profile' && (
                  <span className="absolute -top-0.5 right-2 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                  </span>
                )}
                <Icon className={cn("h-6 w-6", isActive && "stroke-[2.5px]")} />
                <span className={cn("text-[10px] font-bold uppercase tracking-wider", isActive ? "opacity-100" : "opacity-70")}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
