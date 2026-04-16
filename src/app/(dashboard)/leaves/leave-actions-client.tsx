'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Check, X, Loader2, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { approveLeave, rejectLeave, deleteLeave } from './actions';
import Link from 'next/link';

export function LeaveActions({ leaveId, status }: { leaveId: string; status: string }) {
  const [isPending, startTransition] = useTransition();

  const handleApprove = () => {
    startTransition(async () => {
      const result = await approveLeave(leaveId);
      if (result.error) toast.error('Error', { description: result.error });
      else toast.success('Leave approved');
    });
  };

  const handleReject = () => {
    startTransition(async () => {
      const result = await rejectLeave(leaveId);
      if (result.error) toast.error('Error', { description: result.error });
      else toast.success('Leave rejected');
    });
  };

  const handleDelete = () => {
    if (!confirm('¿Estás seguro de que deseas eliminar este registro?')) return;
    startTransition(async () => {
      const result = await deleteLeave(leaveId);
      if (result.error) toast.error('Error', { description: result.error });
      else toast.success('Registro eliminado');
    });
  };

  return (
    <div className="flex gap-1">
      {status === 'pending' && (
        <>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
            onClick={handleApprove} disabled={isPending}>
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={handleReject} disabled={isPending}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
      <Link href={`/leaves/${leaveId}/edit`}>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="Editar registro">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </Link>
      <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50"
        onClick={handleDelete} disabled={isPending} title="Eliminar registro">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
