'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';
import { hasPermission } from '@/lib/auth/roles';
import {
  LayoutDashboard,
  Users,
  FileText,
  CalendarDays,
  Briefcase,
  Bus,
  BarChart3,
  Settings,
  Grid3X3,
  ClipboardList,
  ChevronLeft,
  LogOut,
  Shirt,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';


interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  requiredPermission?: string;
}

const navItems: NavItem[] = [
  { label: 'Panel Principal', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Personal', href: '/personnel', icon: Users, requiredPermission: 'viewPersonnel' },
  { label: 'Documentos', href: '/documents', icon: FileText, requiredPermission: 'manageDocuments' },
  { label: 'Turnos', href: '/shifts', icon: CalendarDays, requiredPermission: 'viewShifts' },
  { label: 'Roster (Plan)', href: '/shifts/roster', icon: Grid3X3, requiredPermission: 'viewShifts' },
  { label: 'Roster Individual', href: '/reports/individual-roster', icon: FileText, requiredPermission: 'viewReports' },
  { label: 'Planificación Diaria', href: '/shifts/daily', icon: ClipboardList, requiredPermission: 'viewShifts' },
  { label: 'Licencias', href: '/leaves', icon: Briefcase },
  { label: 'Transporte', href: '/transport', icon: Bus, requiredPermission: 'manageTransport' },
  { label: 'EPP y Uniformes', href: '/epp', icon: Shirt, requiredPermission: 'viewPersonnel' },
  { label: 'Reportes', href: '/reports', icon: BarChart3, requiredPermission: 'viewReports' },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { user, role, signOut } = useUser();

  const filteredNavItems = navItems.filter((item) => {
    // Specific filtering for Airport Assistant role
    if (role === 'AIRPORT_ASSISTANT') {
      const hiddenLabels = ['Turnos', 'Licencias', 'Reportes'];
      if (hiddenLabels.includes(item.label)) return false;
    }

    if (!item.requiredPermission) return true;
    if (!role) return false;
    return hasPermission(role, item.requiredPermission as keyof import('@/lib/auth/roles').Permission);
  });

  const initials = user?.full_name
    ? user.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-white dark:bg-slate-950 border-r border-slate-200/80 dark:border-slate-800 transition-all duration-300 ease-in-out',
        collapsed ? 'w-[68px]' : 'w-[260px]'
      )}
    >
      {/* Header */}
      <div className="flex items-center h-16 px-4 border-b border-slate-200/80 dark:border-slate-800">
        {!collapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded overflow-hidden">
              <img src="/icon.jpg" alt="Logo" className="h-full w-full object-cover" />
            </div>
            <span className="font-bold text-sm truncate">Grupo Minerquim</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className={cn(
            'h-8 w-8 shrink-0 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100',
            collapsed ? 'mx-auto' : 'ml-auto'
          )}
        >
          <ChevronLeft
            className={cn(
              'h-4 w-4 transition-transform duration-300',
              collapsed && 'rotate-180'
            )}
          />
        </Button>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-4">
        <nav className="space-y-1 px-3">
          {filteredNavItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-gradient-to-r from-orange-50 to-orange-100 text-orange-700 dark:from-orange-950/50 dark:to-orange-900/50 dark:text-orange-300 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/50',
                  collapsed && 'justify-center px-2'
                )}
              >
                <Icon
                  className={cn(
                    'h-[18px] w-[18px] shrink-0',
                    isActive && 'text-orange-600 dark:text-orange-400'
                  )}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      <Separator className="opacity-60" />

      {/* Settings Link (Only for ADMIN/HR) */}
      {(role === 'ADMIN' || role === 'HR') && (
        <div className="px-3 py-2">
          <Link
            href="/settings"
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/50 transition-all duration-200',
              collapsed && 'justify-center px-2'
            )}
          >
            <Settings className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span>Ajustes</span>}
          </Link>
        </div>
      )}

      {/* User Profile */}
      <div className="border-t border-slate-200/80 dark:border-slate-800 p-3">
        <div
          className={cn(
            'flex items-center gap-3 rounded-xl p-2',
            collapsed && 'justify-center'
          )}
        >
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback className="bg-gradient-to-br from-orange-500 to-orange-600 text-white text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">
                {user?.full_name || 'Loading...'}
              </p>
              <p className="text-xs text-muted-foreground truncate capitalize">
                {role?.toLowerCase() || '—'}
              </p>
            </div>
          )}
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-slate-400 hover:text-red-500"
              onClick={signOut}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}
