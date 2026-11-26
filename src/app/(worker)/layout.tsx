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
  Users,
  Coins,
  MoreHorizontal,
  X
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
  const [sizesIncomplete, setSizesIncomplete] = useState(false);
  const [docsIncomplete, setDocsIncomplete] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    const getRole = async () => {
      const { getUserRole } = await import('@/app/role-actions');
      const { getWorkerSession, getWorkerDocsStatus, getWorkerSizeRequirements } = await import('./actions');
      const [currentRole, session, docsStatus, sizeReqs] = await Promise.all([
        getUserRole(),
        getWorkerSession(),
        getWorkerDocsStatus(),
        getWorkerSizeRequirements(),
      ]);
      setRole(currentRole || 'USER');
      setUserName(session?.first_name || '');
      setDocsIncomplete(docsStatus.hasAlert);
      setSizesIncomplete(Boolean(sizeReqs?.hasMissingSizes));
      
      if (session) {
        setFichaIncomplete(
          !session.afp || !session.health_system || !session.bank_account_number || 
          !session.emergency_contact_phone || !session.gender || !session.marital_status || !session.phone
        );
      }
    };
    getRole();
  }, []);

  const primaryNavItems = [
    { label: 'Mañana', href: '/worker', icon: Clock },
    { label: 'Mi Mes', href: '/worker/roster', icon: CalendarDays },
    { label: 'Mis Bonos', href: '/worker/bonuses', icon: Coins },
    { label: 'Mis Docs', href: '/worker/documents', icon: FileText },
  ];

  const moreNavItems = [
    { label: 'Mi Ficha', href: '/worker/profile', icon: User },
    { label: 'Mi Movilidad', href: '/worker/transport', icon: Bus },
  ];

  if (role === 'SUPERVISOR' || role === 'ADMIN' || role === 'AIRPORT_ASSISTANT' || role === 'HR' || role === 'SAFETY_OFFICER') {
    const isMobile = typeof window !== 'undefined' && (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      window.innerWidth < 768
    );
    const targetPath = isMobile ? '/supervisor' : '/role-selection';
    moreNavItems.push({ label: 'Gestión', href: targetPath, icon: Users });
  }

  const isMoreRouteActive = moreNavItems.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );
  const moreHasAlert = fichaIncomplete || sizesIncomplete;

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

      {/* Menú desplegable "Más" */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-[1px]"
          onClick={() => setMoreOpen(false)}
          aria-hidden="true"
        />
      )}
      {moreOpen && (
        <div
          role="dialog"
          aria-label="Más opciones"
          className="fixed bottom-20 left-3 right-3 z-50 max-w-lg mx-auto bg-white border border-slate-200 rounded-2xl shadow-xl p-2 space-y-1"
        >
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Más opciones
            </span>
            <button
              type="button"
              onClick={() => setMoreOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              aria-label="Cerrar menú Más"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {moreNavItems.map((item) => {
            const isItemActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            const showAlert = moreHasAlert && item.href === '/worker/profile';

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  'relative flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold transition-colors',
                  isItemActive
                    ? 'bg-orange-50 text-orange-600'
                    : 'text-slate-700 hover:bg-slate-50'
                )}
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </span>
                {showAlert && (
                  <span className="flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* Bottom Navigation (Mobile Style - 5 accesos fijos sin scroll horizontal) */}
      <nav
        aria-label="Navegación principal del trabajador"
        className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-slate-100 px-1.5 pb-safe pt-1.5 shadow-[0_-5px_15px_-5px_rgba(0,0,0,0.05)]"
      >
        <div className="grid grid-cols-5 gap-0.5 max-w-lg mx-auto">
          {primaryNavItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-2xl transition-all duration-200 min-w-0',
                  isActive
                    ? 'text-orange-600 bg-orange-50'
                    : 'text-slate-400 hover:text-slate-600'
                )}
              >
                {docsIncomplete && item.href === '/worker/documents' && (
                  <span
                    data-testid="pending-docs-indicator"
                    className="absolute top-1 right-2.5 flex h-2.5 w-2.5"
                  >
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                  </span>
                )}
                <Icon className={cn('h-5 w-5 shrink-0', isActive && 'stroke-[2.5px]')} />
                <span className="text-[10px] leading-none font-bold tracking-tight whitespace-nowrap">
                  {item.label}
                </span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreOpen((prev) => !prev)}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            className={cn(
              'relative flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-2xl transition-all duration-200 min-w-0',
              isMoreRouteActive || moreOpen
                ? 'text-orange-600 bg-orange-50'
                : 'text-slate-400 hover:text-slate-600'
            )}
          >
            {moreHasAlert && (
              <span className="absolute top-1 right-2.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
              </span>
            )}
            <MoreHorizontal className={cn('h-5 w-5 shrink-0', (isMoreRouteActive || moreOpen) && 'stroke-[2.5px]')} />
            <span className="text-[10px] leading-none font-bold tracking-tight whitespace-nowrap">
              Más
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}
