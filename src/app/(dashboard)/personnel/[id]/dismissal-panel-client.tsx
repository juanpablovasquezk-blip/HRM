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
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  uploadDismissalReceipt, 
  markRefusedToReturn, 
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
  initialRecords
}: DismissalPanelClientProps) {
  const [records, setRecords] = useState<DismissalRecord[]>(initialRecords);
  const [isPending, startTransition] = useTransition();
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const handleRefusalChange = (recordId: string, currentVal: boolean) => {
    startTransition(async () => {
      const newVal = !currentVal;
      const res = await markRefusedToReturn(recordId, newVal);
      if (res.success) {
        setRecords(prev => prev.map(r => r.id === recordId ? { ...r, refused_to_return: newVal } : r));
        toast.success(`Preferencia de devolución actualizada`);
      } else {
        toast.error(res.error || 'Error al actualizar preferencia');
      }
    });
  };

  const handleFileChange = async (recordId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingId(recordId);
    const loadingToast = toast.loading('Subiendo acta de recepción firmada...');

    try {
      const formData = new FormData();
      formData.set('file', file);

      const res = await uploadDismissalReceipt(recordId, formData);
      if (res.success) {
        toast.success('Acta de recepción subida correctamente', { id: loadingToast });
        // Reload page to refresh all data
        window.location.reload();
      } else {
        toast.error(res.error || 'Error al subir acta de recepción', { id: loadingToast });
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

  const allCompleted = records.every(r => r.status === 'completed');

  return (
    <Card className="border-orange-200 bg-orange-50/20 dark:bg-orange-950/5 shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-black text-orange-800 dark:text-orange-400 flex items-center gap-2 uppercase tracking-wide">
          <AlertTriangle className="h-5 w-5 text-orange-500 animate-pulse" />
          Proceso de Baja Pendiente (DGAC)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-orange-100 dark:border-slate-800 p-4 rounded-2xl text-sm">
          <span className="font-bold text-slate-700 dark:text-slate-300">Motivo declarado de la baja:</span>{' '}
          <span className="italic text-slate-600 dark:text-slate-400">"{dismissalReason || 'No especificado'}"</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {records.map((record) => {
            const isTica = record.credential_type === 'TICA';
            const credNum = isTica ? ticaNumber : pcpNumber;
            const credExp = isTica ? ticaExpiry : pcpExpiry;

            return (
              <div 
                key={record.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 space-y-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-xl bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center text-orange-700 dark:text-orange-400">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100">{record.credential_type}</h4>
                      <p className="text-[10px] text-slate-500">Credencial Nº {credNum || 'N/A'}</p>
                    </div>
                  </div>

                  <Badge 
                    variant="outline" 
                    className={
                      record.status === 'completed'
                        ? "bg-emerald-50 text-emerald-700 border-emerald-100 uppercase text-[9px] font-black"
                        : "bg-amber-50 text-amber-700 border-amber-100 uppercase text-[9px] font-black animate-pulse"
                    }
                  >
                    {record.status === 'completed' ? 'Completado' : 'Pendiente'}
                  </Badge>
                </div>

                <div className="text-xs text-slate-500 space-y-1">
                  <p><strong>Vencimiento:</strong> {credExp ? new Date(credExp).toLocaleDateString('es-CL') : 'N/A'}</p>
                  <p>
                    <strong>Estado de entrega:</strong>{' '}
                    {record.refused_to_return ? (
                      <span className="text-red-600 font-bold">El trabajador se negó a entregar la credencial</span>
                    ) : (
                      <span>Entrega voluntaria regular</span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox 
                    id={`refused-${record.id}`} 
                    checked={record.refused_to_return}
                    onCheckedChange={() => handleRefusalChange(record.id, record.refused_to_return)}
                    disabled={isPending}
                  />
                  <Label 
                    htmlFor={`refused-${record.id}`}
                    className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 cursor-pointer select-none leading-none"
                  >
                    Se negó a entregar
                  </Label>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="text-xs font-bold uppercase rounded-xl border-orange-200 text-orange-700 hover:bg-orange-50 flex-1 gap-1.5"
                    onClick={() => handleDownloadActa(record)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Descargar Acta
                  </Button>

                  {record.receipt_file_url ? (
                    <a 
                      href={record.receipt_file_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold uppercase text-slate-700 hover:bg-slate-100 flex-1"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Ver Recepción
                    </a>
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
                        className="text-xs font-bold uppercase rounded-xl border-slate-300 text-slate-700 hover:bg-slate-50 flex-1 w-full gap-1.5"
                      >
                        {uploadingId === record.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Upload className="h-3.5 w-3.5" />
                        )}
                        Subir Recepción
                      </Button>
                    </div>
                  )}
                </div>

                {record.receipt_file_url && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[10px] text-slate-400">Reemplazar recepción:</span>
                    <div className="relative inline-block">
                      <input 
                        type="file" 
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleFileChange(record.id, e)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        disabled={uploadingId !== null}
                      />
                      <button className="text-[10px] font-bold text-orange-600 hover:underline">
                        Cambiar archivo
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="pt-2 flex justify-end">
          <Button
            disabled={!allCompleted || isPending}
            onClick={handleCloseDismissal}
            className={`font-black uppercase text-xs rounded-2xl py-5 px-8 shadow-md transition-all ${
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
      </CardContent>
    </Card>
  );
}
