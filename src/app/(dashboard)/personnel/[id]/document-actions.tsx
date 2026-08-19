'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, X, Trash2, Loader2, AlertTriangle, Download } from 'lucide-react';
import { updateDocumentStatus, deleteDocumentAction } from '../actions';
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
  fileUrl?: string;
  docType?: string;
  firstName?: string;
  lastNameFather?: string;
  readOnly?: boolean;
}

function getDocumentPrefix(type: string): string {
  const t = type.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (t.includes('cedula') || t.includes('identity') || t.includes('c.i.')) return 'CI';
  if (t.includes('licencia') || t.includes('driver')) return 'LIC';
  if (t.includes('selfie') || t.includes('perfil') || t.includes('foto con fondo blanco')) return 'FOTO';
  if (t.includes('antecedentes')) return 'ANTECEDENTES';
  if (t.includes('hoja de vida') || t.includes('conductor')) return 'HOJA_VIDA';
  if (t.includes('tica')) return 'TICA';
  if (t.includes('pcp')) return 'PCP';
  return t.replace(/[^a-z0-9]/g, '_').toUpperCase();
}

export function DocumentActions({ 
  documentId, 
  currentStatus, 
  personnelId,
  fileUrl,
  docType,
  firstName,
  lastNameFather,
  readOnly = false
}: DocumentActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const handleDownload = async () => {
    if (!fileUrl) return;
    try {
      const fileExt = fileUrl.split('?')[0].split('.').pop() || 'pdf';
      
      const cleanFirst = (firstName || 'TRABAJADOR').trim().split(' ')[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const cleanLast = (lastNameFather || 'DOCS').trim().split(' ')[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const fileSuffix = `${cleanFirst}_${cleanLast}`;
      
      const prefix = getDocumentPrefix(docType || 'DOCUMENTO');
      const fileName = `${prefix}_${fileSuffix}.${fileExt}`;

      const downloadToast = toast.loading(`Descargando ${fileName}...`);

      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      
      toast.success('Descargado correctamente', { id: downloadToast });
    } catch (err) {
      console.error("Error downloading document:", err);
      toast.error('Error al descargar el archivo. Se abrirá en una nueva pestaña.');
      window.open(fileUrl, '_blank');
    }
  };

  const handleStatusUpdate = async (status: 'APPROVED' | 'REJECTED', reason?: string) => {
    setLoading(status);
    try {
      const res = await updateDocumentStatus(documentId, status, reason);
      if (res.success) {
        toast.success(status === 'APPROVED' ? 'Documento aprobado' : 'Documento rechazado');
        setIsRejectDialogOpen(false);
        setRejectionReason('');
        router.refresh();
      } else {
        toast.error(res.error || 'Error al actualizar');
      }
    } catch {
      toast.error('Error de conexión');
    } finally {
      setLoading(null);
    }
  };

  const handleDelete = async () => {
    setLoading('DELETE');
    try {
      const res = await deleteDocumentAction(documentId);
      if (res.success) {
        toast.success('Documento eliminado');
        setIsDeleteDialogOpen(false);
        router.refresh();
      } else {
        toast.error(res.error || 'Error al eliminar');
      }
    } catch {
      toast.error('Error de conexión');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex items-center gap-1 justify-end">
      {/* ── Descargar ── */}
      {fileUrl && (
        <Button 
          variant="ghost" 
          size="icon" 
          disabled={!!loading}
          onClick={handleDownload}
          className="h-8 w-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-lg"
          title="Descargar Documento con nombre estandarizado"
        >
          <Download className="h-4 w-4" />
        </Button>
      )}

      {!readOnly && (
        <>
          {/* ── Aprobar ── */}
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

          {/* ── Rechazar ── */}
          {currentStatus !== 'REJECTED' && (
            <Button 
              variant="ghost" 
              size="icon" 
              disabled={!!loading}
              onClick={() => setIsRejectDialogOpen(true)}
              className="h-8 w-8 text-amber-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
              title="Rechazar"
            >
              <X className="h-4 w-4" />
            </Button>
          )}

          {/* ── Eliminar ── */}
          <Button 
            variant="ghost" 
            size="icon" 
            disabled={!!loading}
            onClick={() => setIsDeleteDialogOpen(true)}
            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg"
            title="Eliminar documento"
          >
            {loading === 'DELETE' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </>
      )}

      {/* ── Dialog: Rechazar ── */}
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

      {/* ── Dialog: Confirmar eliminación ── */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[380px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Eliminar Documento
            </DialogTitle>
            <DialogDescription>
              Esta acción eliminará el documento permanentemente. No se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => setIsDeleteDialogOpen(false)}>Cancelar</Button>
            <Button 
              variant="destructive" 
              disabled={!!loading}
              onClick={handleDelete}
            >
              {loading === 'DELETE' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
