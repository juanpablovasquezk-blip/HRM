'use client';

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { NotificationCenter } from '@/components/layout/notification-center';

interface TopbarProps {
  title?: string;
  subtitle?: string;
}

export function Topbar({ title, subtitle }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center h-16 px-6 bg-white/80 backdrop-blur-xl border-b border-slate-200/80 dark:bg-slate-950/80 dark:border-slate-800">
      {/* Left: Page title */}
      <div className="mr-auto">
        {title && (
          <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {title}
          </h1>
        )}
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>

      {/* Center: Search */}
      <div className="hidden md:flex items-center max-w-md w-full mx-6">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="global-search"
            placeholder="Search personnel, shifts, documents..."
            className="pl-10 h-9 bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-700 rounded-xl"
          />
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 ml-auto">
        <NotificationCenter />
      </div>
    </header>
  );
}
