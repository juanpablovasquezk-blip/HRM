'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, X, MessageSquare, Loader2 } from 'lucide-react';
import { updateDocumentStatus } from '../actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface DocumentActionsProps {
  documentId: string;
  currentStatus: string;
  personnelId: string;
}

export function DocumentActions({ documentId, currentStatus, personnelId }: DocumentActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const handleStatusUpdate = async (status: 'APPROVED' | 'REJECTED', reason?: string) => {
    setLoading(status);
    try {
      const res = await updateDocumentStatus(documentId, status, reason);
      if (res.success) {
        toast.success(status === 'APPROVED' ? 'Documento aprobado' : 'Documento rechazado');
        setIsRejectDialogOpen(false);
        setRejectionReason('');
        router.refresh(); // Smooth refresh, preserves scroll
      } else {
        toast.error(res.error || 'Error al actualizar');
      }
    } catch (error) {
      toast.error('Error de conexión');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex items-center gap-1 justify-end">
      {currentStatus !== 'APPROVED' && (
        <Button 
          variant="ghost" 
          size="icon" 
          disabled={!!loading}
          onClick={() => handleStatusUpdate('APPROVED')}
          className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg"
          title="Aprobar"
        >
          {loading === 'APPROVED' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </Button>
      )}

      {currentStatus !== 'REJECTED' && (
        <Button 
          variant="ghost" 
          size="icon" 
          disabled={!!loading}
          onClick={() => setIsRejectDialogOpen(true)}
          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg"
          title="Rechazar"
        >
          <X className="h-4 w-4" />
        </Button>
      )}

      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent className="sm:max-w-[400px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Rechazar Documento</DialogTitle>
            <DialogDescription>
              Explica el motivo del rechazo para que el trabajador pueda corregirlo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Motivo</Label>
              <Input 
                id="reason" 
                placeholder="Ej: La foto no es legible o está borrosa" 
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsRejectDialogOpen(false)}>Cancelar</Button>
            <Button 
              variant="destructive" 
              disabled={!rejectionReason || !!loading}
              onClick={() => handleStatusUpdate('REJECTED', rejectionReason)}
            >
              {loading === 'REJECTED' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar Rechazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
