'use client';

import React, { useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  FileText, 
  Upload, 
  AlertTriangle, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Download,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  uploadDismissalReceipt, 
  updateCredentialDeliveryStatus, 
  executeDirectCloseDismissal 
} from '../dismissal-actions';
import { generateDismissalActa } from '../generate-dismissal-acta';

interface DismissalRecord {
  id: string;
  personnel_id: string;
  credential_type: 'TICA' | 'PCP';
  refused_to_return: boolean;
  credential_image_url: string | null;
  receipt_file_url: string | null;
  status: 'pending' | 'completed';
  created_at: string;
  completed_at: string | null;
}

interface DismissalPanelClientProps {
  personnelId: string;
  personName: string;
  personRut: string;
  mainPositionName: string;
  dismissalReason: string;
  ticaNumber: string;
  pcpNumber: string;
  ticaExpiry: string;
  pcpExpiry: string;
  ticaUrl: string;
  pcpUrl: string;
  initialRecords: DismissalRecord[];
  isCompleted?: boolean;
}

export function DismissalPanelClient({
  personnelId,
  personName,
  personRut,
  mainPositionName,
  dismissalReason,
  ticaNumber,
  pcpNumber,
  ticaExpiry,
  pcpExpiry,
  ticaUrl,
  pcpUrl,
  initialRecords,
  isCompleted = false
}: DismissalPanelClientProps) {
  const [records, setRecords] = useState<DismissalRecord[]>(initialRecords);
  const [isPending, startTransition] = useTransition();
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const handleDeliveryToggle = (recordId: string, currentRefused: boolean) => {
    startTransition(async () => {
      const willBeDelivered = currentRefused; // If was refused, will now be delivered
      const res = await updateCredentialDeliveryStatus(recordId, willBeDelivered);
      if (res.success) {
        setRecords(prev => prev.map(r => r.id === recordId ? { ...r, refused_to_return: !willBeDelivered } : r));
        toast.success(
          willBeDelivered 
            ? 'Estado actualizado: Credencial entregada físicamente' 
            : 'Estado actualizado: Credencial no entregada (Solicitud de bloqueo a DGAC)'
        );
      } else {
        toast.error(res.error || 'Error al actualizar estado de la credencial');
      }
    });
  };

  const handleFileChange = async (recordId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingId(recordId);
    const loadingToast = toast.loading('Subiendo recepción timbrada por la DGAC...');

    try {
      const formData = new FormData();
      formData.set('file', file);

      const res = await uploadDismissalReceipt(recordId, formData);
      if (res.success) {
        toast.success('Recepción timbrada subida correctamente', { id: loadingToast });
        window.location.reload();
      } else {
        toast.error(res.error || 'Error al subir recepción', { id: loadingToast });
      }
    } catch (err: any) {
      toast.error(err.message || 'Error en la subida', { id: loadingToast });
    } finally {
      setUploadingId(null);
    }
  };

  const handleDownloadActa = async (record: DismissalRecord) => {
    const isTica = record.credential_type === 'TICA';
    await generateDismissalActa({
      first_name: personName.split(' ')[0] || '',
      last_name_father: personName.split(' ')[1] || '',
      last_name_mother: personName.split(' ')[2] || '',
      rut: personRut,
      main_position_name: mainPositionName,
      credential_type: record.credential_type,
      refused_to_return: record.refused_to_return,
      credential_number: isTica ? ticaNumber : pcpNumber,
      credential_expiry: isTica ? ticaExpiry : pcpExpiry,
      credential_image_url: isTica ? ticaUrl : pcpUrl,
      inactive_reason: dismissalReason
    });
  };

  const handleCloseDismissal = () => {
    startTransition(async () => {
      const res = await executeDirectCloseDismissal(personnelId);
      if (res.success) {
        toast.success('El proceso de baja ha sido cerrado definitivamente');
        window.location.reload();
      } else {
        toast.error(res.error || 'Error al cerrar el proceso de baja');
      }
    });
  };

  const allCompleted = records.every(r => r.status === 'completed' || r.receipt_file_url);

  return (
    <Card className={isCompleted ? "border-slate-200 bg-slate-50/40 dark:bg-slate-900/10 dark:border-slate-800 shadow-sm" : "border-orange-200 bg-orange-50/20 dark:bg-orange-950/5 shadow-md"}>
      <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <CardTitle className={`text-base font-black flex items-center gap-2 uppercase tracking-wide ${isCompleted ? 'text-slate-800 dark:text-slate-200' : 'text-orange-800 dark:text-orange-400'}`}>
            {isCompleted ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                Historial de Baja y Gestión de Credenciales DGAC
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-orange-500 animate-pulse" />
                Proceso de Baja y Devolución de Credenciales (DGAC)
              </>
            )}
          </CardTitle>
          <Badge 
            variant="outline"
            className={isCompleted ? "bg-slate-100 text-slate-700 border-slate-300 font-bold uppercase text-[10px]" : "bg-orange-100 text-orange-800 border-orange-200 font-bold uppercase text-[10px] animate-pulse"}
          >
            {isCompleted ? "Baja Cerrada" : "Trámite Pendiente DGAC"}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-5 pt-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="font-bold text-slate-700 dark:text-slate-300">Motivo de la baja:</span>{' '}
            <span className="italic text-slate-600 dark:text-slate-400">&quot;{dismissalReason || 'No especificado'}&quot;</span>
          </div>
          <span className="text-xs text-slate-500">
            {records.length} {records.length === 1 ? 'credencial asociada' : 'credenciales asociadas'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {records.map((record) => {
            const isTica = record.credential_type === 'TICA';
            const credNum = isTica ? ticaNumber : pcpNumber;
            const credExp = isTica ? ticaExpiry : pcpExpiry;
            const isRefused = record.refused_to_return;

            return (
              <div 
                key={record.id}
                className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 space-y-4 shadow-sm transition-all ${
                  isRefused 
                    ? 'border-rose-200 dark:border-rose-900/40 bg-rose-50/10' 
                    : 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/10'
                }`}
              >
                {/* Header de la Credencial */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${
                      isRefused 
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400' 
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                    }`}>
                      {isRefused ? <ShieldAlert className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">{record.credential_type}</h4>
                      <p className="text-[11px] font-mono text-slate-500">N° {credNum || 'N/A'}</p>
                    </div>
                  </div>

                  <Badge 
                    variant="outline" 
                    className={
                      isRefused
                        ? "bg-rose-50 text-rose-700 border-rose-200 uppercase text-[9px] font-bold"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200 uppercase text-[9px] font-bold"
                    }
                  >
                    {isRefused ? "No entregada / Solicitar Bloqueo" : "Entregada Físicamente"}
                  </Badge>
                </div>

                {/* Info de vigencia y estado */}
                <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1 bg-slate-50/60 dark:bg-slate-850 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                  <p><strong>Vigencia registrada:</strong> {credExp ? new Date(credExp).toLocaleDateString('es-CL') : 'N/A'}</p>
                  <p>
                    <strong>Estado de entrega:</strong>{' '}
                    {isRefused ? (
                      <span className="text-rose-600 font-bold">No entregada / Trabajador se negó</span>
                    ) : (
                      <span className="text-emerald-600 font-bold">Entregada por el trabajador</span>
                    )}
                  </p>
                </div>

                {/* Control interactivo para cambiar estado post-baja */}
                <div className="flex items-center justify-between p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900">
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id={`refused-${record.id}`} 
                      checked={!isRefused}
                      onCheckedChange={() => handleDeliveryToggle(record.id, isRefused)}
                      disabled={isPending}
                      className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                    />
                    <Label 
                      htmlFor={`refused-${record.id}`}
                      className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none"
                    >
                      {!isRefused ? 'Credencial devuelta' : 'Marcar como entregada'}
                    </Label>
                  </div>
                  <span className="text-[10px] text-slate-400 italic">
                    {isPending ? 'Actualizando...' : '(Clic para cambiar)'}
                  </span>
                </div>

                {/* Botones de acción */}
                <div className="space-y-2 pt-1">
                  <div className="flex flex-col sm:flex-row gap-2">
                    {/* Botón Descarga de Documento según estado */}
                    <Button 
                      variant="outline" 
                      size="sm"
                      className={`text-xs font-bold uppercase rounded-xl flex-1 gap-1.5 shadow-sm ${
                        isRefused
                          ? 'border-rose-300 text-rose-700 bg-rose-50/40 hover:bg-rose-100'
                          : 'border-emerald-300 text-emerald-700 bg-emerald-50/40 hover:bg-emerald-100'
                      }`}
                      onClick={() => handleDownloadActa(record)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      {isRefused ? 'Descargar Solicitud de Bloqueo (PDF)' : 'Descargar Acta de Entrega (PDF)'}
                    </Button>
                  </div>

                  {/* Zona de Recepción DGAC */}
                  <div className="pt-1 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        Comprobante / Recepción DGAC:
                      </span>
                      {record.receipt_file_url && (
                        <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Recepción Guardada
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {record.receipt_file_url ? (
                        <>
                          <a 
                            href={record.receipt_file_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase text-slate-700 hover:bg-slate-100 flex-1 shadow-sm"
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
                            Ver Recepción DGAC
                          </a>

                          <div className="relative">
                            <input 
                              type="file" 
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) => handleFileChange(record.id, e)}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                              disabled={uploadingId !== null}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={uploadingId !== null}
                              className="h-8 text-xs text-slate-500 hover:text-slate-900 font-medium"
                              title="Subir un nuevo archivo para reemplazar la recepción actual"
                            >
                              {uploadingId === record.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                              )}
                              Reemplazar
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="relative flex-1">
                          <input 
                            type="file" 
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => handleFileChange(record.id, e)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            disabled={uploadingId !== null}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={uploadingId !== null}
                            className="text-xs font-bold uppercase rounded-xl border-dashed border-2 border-slate-300 text-slate-700 hover:bg-slate-50 flex-1 w-full gap-1.5 h-9"
                          >
                            {uploadingId === record.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Upload className="h-3.5 w-3.5 text-slate-500" />
                            )}
                            Subir Recepción Timbrada DGAC
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {!isCompleted && (
          <div className="pt-2 flex justify-end">
            <Button
              disabled={!allCompleted || isPending}
              onClick={handleCloseDismissal}
              className={`font-black uppercase text-xs rounded-xl py-4 px-6 shadow-md transition-all ${
                allCompleted 
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/25'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              }`}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cerrando Baja...
                </>
              ) : (
                'Cerrar Baja Definitivamente'
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
