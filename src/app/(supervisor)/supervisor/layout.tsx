'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home, 
  Calendar, 
  Bus, 
  Users, 
  FileText,
  LogOut,
  User
} from 'lucide-react';

export default function SupervisorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const navItems = [
    { icon: Home, label: 'Inicio', href: '/supervisor', active: pathname === '/supervisor', className: 'flex' },
    { icon: Calendar, label: 'Asistencia', href: '/supervisor/attendance', active: pathname.startsWith('/supervisor/attendance'), className: 'flex' },
    { icon: Bus, label: 'Transporte', href: '/supervisor/transport', active: pathname.startsWith('/supervisor/transport'), className: 'flex' },
    { icon: Users, label: 'Personal', href: '/supervisor/personnel', active: pathname.startsWith('/supervisor/personnel'), className: 'flex' },
    { icon: FileText, label: 'Roster', href: '/supervisor/roster', active: pathname.startsWith('/supervisor/roster'), className: 'hidden md:flex' },
    { icon: User, label: 'Mi Roster', href: '/worker', active: false, className: 'flex' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24">
      <main>
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 flex justify-around p-2 z-50">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`${item.className} flex-col items-center justify-center p-2 rounded-2xl transition-all duration-300 min-w-[64px]
              ${item.active ? 'bg-slate-900 text-white scale-105 shadow-lg shadow-slate-200' : 'text-slate-400 hover:bg-slate-50'}
            `}
          >
            <item.icon className={`h-5 w-5 ${item.active ? 'text-orange-400' : ''}`} />
            <span className="text-[10px] font-black uppercase tracking-tighter mt-1">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
