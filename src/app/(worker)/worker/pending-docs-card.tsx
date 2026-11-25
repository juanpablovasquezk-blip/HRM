import React from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronRight, Clock, FileWarning, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { WorkerPendingDocItem, WorkerPendingDocStatus } from '@/lib/worker/portal-requests';

const STATUS_STYLE: Record<
  WorkerPendingDocStatus,
  { badgeClass: string; icon: React.ComponentType<{ className?: string }> }
> = {
  MISSING: {
    badgeClass: 'bg-red-100 text-red-800 border-red-200',
    icon: FileWarning,
  },
  EXPIRED: {
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-200',
    icon: AlertCircle,
  },
  REJECTED: {
    badgeClass: 'bg-red-100 text-red-800 border-red-200',
    icon: XCircle,
  },
  IN_REVIEW: {
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    icon: Clock,
  },
};

export function PendingDocsCard({ items }: { items: WorkerPendingDocItem[] }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-black text-slate-900">
            Documentos pendientes ({items.length})
          </p>
          <p className="text-xs text-slate-500">
            Revisa los documentos que debes subir, renovar, corregir o que están esperando validación.
          </p>
        </div>
        <Link
          href="/worker/documents"
          className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-slate-800 shrink-0"
        >
          Mis documentos <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const cfg = STATUS_STYLE[item.status];
          const Icon = cfg.icon;
          return (
            <div
              key={item.definitionId}
              className="flex items-start justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <Icon className="h-4 w-4 text-slate-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">{item.name}</p>
                  <p className="text-[11px] text-slate-600 leading-snug">{item.detail}</p>
                </div>
              </div>
              <Badge
                variant="outline"
                className={`shrink-0 text-[10px] font-bold px-2 py-0.5 ${cfg.badgeClass}`}
              >
                {item.label}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}
