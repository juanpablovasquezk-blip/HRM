'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ShieldCheck, 
  FileText, 
  Download, 
  Upload, 
  Send, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Loader2,
  FileCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

import { generateAuthorizationPDF } from './generate-authorization-pdf';
import { generateReceptionPDF } from './generate-reception-pdf';
import { getRiohsRecord, markAuthGenerated, uploadSignedRiohsFile, RiohsRecordData } from './actions';

interface RiohsGadgetProps {
  personnelId: string;
  workerName: string;
  workerRut: string;
  workerEmail: string | null;
  companyId: string;
  companyName: string;
  companyRut?: string;
  userRole: string;
  initialRecord?: RiohsRecordData | null;
}

export function RiohsGadget({
  personnelId,
  workerName,
  workerRut,
  workerEmail,
  companyId,
  companyName,
  companyRut = '76.135.448-5',
  userRole,
  initialRecord = null,
}: RiohsGadgetProps) {
  const router = useRouter();
  const [record, setRecord] = useState<RiohsRecordData | null>(initialRecord);
  const [loading, setLoading] = useState(false);
  const [uploadingAuth, setUploadingAuth] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [uploadingReception, setUploadingReception] = useState(false);

  const canExecute = userRole === 'ADMIN' || userRole === 'HR' || userRole === 'SAFETY_OFFICER';
  const isMinerquim = companyName.toUpperCase().includes('MINERQUIM') && !companyName.toUpperCase().includes('TRANSPORTES');
  const isTransportes = companyName.toUpperCase().includes('TRANSPORTES');
  
  // Transportes RIOHS is pending upload in templates
  const isRiohsAvailable = isMinerquim;

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      const res = await getRiohsRecord(personnelId);
      if (mounted) {
        if (res && res.success && res.data) {
          setRecord(res.data);
        } else if (initialRecord) {
          setRecord(initialRecord);
        }
      }
    }
    loadData();
    return () => {
      mounted = false;
    };
  }, [personnelId, initialRecord]);

  const currentStatus = record?.status || 'PENDING';

  // Step 1: Generate Authorization PDF
  const handleGenerateAuth = async () => {
    try {
      await generateAuthorizationPDF({
        workerName,
        workerRut,
        workerEmail: workerEmail || '',
        companyName: companyName || 'COMERCIALIZADORA Y SERVICIOS DE INGENIERIA MINERQUIM LIMITADA',
        companyRut: companyRut || '76.135.448-5',
      });

      const res = await markAuthGenerated(personnelId, companyId);
      if (res.success) {
        setRecord((prev) => ({
          ...prev,
          personnel_id: personnelId,
          company_id: companyId,
          status: prev?.status === 'PENDING' || !prev ? 'AUTH_GENERATED' : prev.status,
          auth_generated_at: new Date().toISOString(),
        }));

        toast.success('Documento de Autorización RIOHS generado y descargado.');
        router.refresh();
      } else {
        toast.error(res.error || 'Error al actualizar registro en base de datos.');
      }
    } catch (e: any) {
      console.error(e);
      toast.error('Error al generar PDF de Autorización');
    }
  };

  // Step 2: Upload Signed Authorization File
  const handleUploadAuthFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAuth(true);
    const formData = new FormData();
    formData.append('file', file);

    const res = await uploadSignedRiohsFile(personnelId, companyId, 'auth', formData);
    if (res.success && res.fileUrl) {
      setRecord((prev) => ({
        ...prev!,
        status: 'AUTH_UPLOADED',
        auth_signed_file_url: res.fileUrl,
        auth_uploaded_at: new Date().toISOString(),
      }));
      toast.success('Autorización RIOHS firmada subida correctamente.');
      router.refresh();
    } else {
      toast.error(res.error || 'Error al subir la autorización firmada.');
    }
    setUploadingAuth(false);
  };

  // Step 3: Send Email with RIOHS PDF attached & Auto-generate Reception PDF
  const handleSendEmail = async () => {
    if (!workerEmail) {
      toast.error('El trabajador no posee un correo electrónico registrado en su ficha.');
      return;
    }

    setSendingEmail(true);
    try {
      const response = await fetch('/api/riohs/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personnelId }),
      });

      let data: any = {};
      try {
        const responseText = await response.text();
        data = responseText ? JSON.parse(responseText) : {};
      } catch (e) {
        console.error('Failed to parse response JSON:', e);
      }

      if (response.ok && data.success) {
        toast.success(`Correo enviado a ${workerEmail} con RIOHS adjunto.`);
        
        const nowIso = data.sentAt || new Date().toISOString();
        setRecord((prev) => ({
          ...prev!,
          status: 'RIOHS_SENT',
          riohs_sent_at: nowIso,
          riohs_sent_to_email: workerEmail,
        }));

        // Immediately auto-generate and download Reception PDF
        toast.info('Generando Comprobante de Recepción...');
        await generateReceptionPDF({
          workerName,
          workerRut,
          companyName: companyName || 'COMERCIALIZADORA Y SERVICIOS DE INGENIERIA MINERQUIM LIMITADA',
          companyRut: companyRut || '76.135.448-5',
          sentAt: nowIso,
        });
        router.refresh();
      } else {
        toast.error(data?.error || 'No se pudo enviar el correo RIOHS.');
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Error de conexión al enviar correo.');
    } finally {
      setSendingEmail(false);
    }
  };

  // Step 4: Upload Signed Reception File
  const handleUploadReceptionFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingReception(true);
    const formData = new FormData();
    formData.append('file', file);

    const res = await uploadSignedRiohsFile(personnelId, companyId, 'reception', formData);
    if (res.success && res.fileUrl) {
      setRecord((prev) => ({
        ...prev!,
        status: 'COMPLETED',
        reception_signed_file_url: res.fileUrl,
        reception_uploaded_at: new Date().toISOString(),
      }));
      toast.success('Comprobante de Recepción RIOHS firmado subido. Proceso completado.');
      router.refresh();
    } else {
      toast.error(res.error || 'Error al subir el comprobante de recepción.');
    }
    setUploadingReception(false);
  };

  // Manual download reception PDF if needed
  const handleManualDownloadReception = async () => {
    await generateReceptionPDF({
      workerName,
      workerRut,
      companyName: companyName || 'COMERCIALIZADORA Y SERVICIOS DE INGENIERIA MINERQUIM LIMITADA',
      companyRut: companyRut || '76.135.448-5',
      sentAt: record?.riohs_sent_at || new Date(),
    });
  };

  if (loading) {
    return (
      <Card className="border border-slate-200 dark:border-slate-800 shadow-sm">
        <CardContent className="py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-orange-600" />
          Cargando estado de Prevención de Riesgos...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-orange-200/60 dark:border-orange-950/40 shadow-sm overflow-hidden bg-gradient-to-br from-white to-orange-50/20 dark:from-slate-900 dark:to-slate-950">
      <CardHeader className="pb-3 border-b border-orange-100 dark:border-slate-800/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                Prevención de riesgos
                <Badge variant="outline" className="text-[10px] font-semibold border-orange-300 bg-orange-50 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300">
                  RIOHS Legal
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Reglamento Interno de Orden, Higiene y Seguridad (Art. 156 Código del Trabajo)
              </CardDescription>
            </div>
          </div>

          <Badge className={
            currentStatus === 'COMPLETED'
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300'
              : currentStatus === 'RIOHS_SENT'
              ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-300'
              : currentStatus === 'AUTH_UPLOADED'
              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300'
              : currentStatus === 'AUTH_GENERATED'
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300'
              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300'
          }>
            {currentStatus === 'COMPLETED' && '✅ RIOHS Entregado y Firmado'}
            {currentStatus === 'RIOHS_SENT' && '✉️ RIOHS Enviado (Pendiente Recepción)'}
            {currentStatus === 'AUTH_UPLOADED' && '📄 Autorización Subida (Listo para Envío)'}
            {currentStatus === 'AUTH_GENERATED' && '⏳ Autorización Generada (Pendiente Firma)'}
            {currentStatus === 'PENDING' && '⚪ No Iniciado'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {!isRiohsAvailable && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold block">Reglamento Interno pendiente de configuración</strong>
              Los documentos de RIOHS para la empresa <strong>{companyName}</strong> se habilitarán próximamente al subir los archivos maestros a la carpeta de plantillas.
            </div>
          </div>
        )}

        {/* 4-Step Process Timeline */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
          {/* Step 1 Box */}
          <div className={`p-3 rounded-lg border flex flex-col justify-between ${
            record?.auth_generated_at 
              ? 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900' 
              : 'bg-slate-50 border-slate-200 dark:bg-slate-850 dark:border-slate-800'
          }`}>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-[11px] uppercase tracking-tight text-slate-700 dark:text-slate-300">1. Autorización</span>
                {record?.auth_generated_at ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                )}
              </div>
              <p className="text-[11px] text-slate-500">Generar PDF de autorización digital</p>
            </div>

            <Button
              size="sm"
              variant="outline"
              disabled={!isRiohsAvailable || !canExecute}
              onClick={handleGenerateAuth}
              className="mt-3 text-[11px] h-7 gap-1 font-medium border-orange-200 text-orange-700 hover:bg-orange-100 dark:border-orange-800 dark:text-orange-400"
            >
              <Download className="h-3 w-3" />
              Generar PDF
            </Button>
          </div>

          {/* Step 2 Box */}
          <div className={`p-3 rounded-lg border flex flex-col justify-between ${
            record?.auth_signed_file_url 
              ? 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900' 
              : 'bg-slate-50 border-slate-200 dark:bg-slate-850 dark:border-slate-800'
          }`}>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-[11px] uppercase tracking-tight text-slate-700 dark:text-slate-300">2. Subir Firma</span>
                {record?.auth_signed_file_url ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                )}
              </div>
              <p className="text-[11px] text-slate-500">Subir autorización firmada</p>
            </div>

            <div className="mt-3 flex items-center gap-1">
              <label className={`w-full cursor-pointer inline-flex items-center justify-center rounded-md text-[11px] font-medium h-7 px-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 ${
                (!isRiohsAvailable || !canExecute || uploadingAuth) ? 'opacity-50 pointer-events-none' : ''
              }`}>
                {uploadingAuth ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Upload className="h-3 w-3 mr-1 text-slate-500" />
                )}
                {record?.auth_signed_file_url ? 'Reemplazar' : 'Subir Firmado'}
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={handleUploadAuthFile}
                  disabled={!isRiohsAvailable || !canExecute || uploadingAuth}
                  className="hidden"
                />
              </label>
              {record?.auth_signed_file_url && (
                <a href={record.auth_signed_file_url} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-600 shrink-0" title="Ver Autorización Subida">
                    <FileText className="h-3.5 w-3.5" />
                  </Button>
                </a>
              )}
            </div>
          </div>

          {/* Step 3 Box */}
          <div className={`p-3 rounded-lg border flex flex-col justify-between ${
            record?.riohs_sent_at 
              ? 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900' 
              : 'bg-slate-50 border-slate-200 dark:bg-slate-850 dark:border-slate-800'
          }`}>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-[11px] uppercase tracking-tight text-slate-700 dark:text-slate-300">3. Enviar Email</span>
                {record?.riohs_sent_at ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                )}
              </div>
              <p className="text-[11px] text-slate-500">Enviar RIOHS.pdf por correo</p>
            </div>

            <Button
              size="sm"
              variant="default"
              disabled={!isRiohsAvailable || !canExecute || sendingEmail || !record?.auth_signed_file_url}
              onClick={handleSendEmail}
              className="mt-3 text-[11px] h-7 gap-1 font-semibold bg-orange-600 hover:bg-orange-700 text-white shadow-xs"
            >
              {sendingEmail ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Enviar RIOHS
            </Button>
          </div>

          {/* Step 4 Box */}
          <div className={`p-3 rounded-lg border flex flex-col justify-between ${
            record?.reception_signed_file_url 
              ? 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900' 
              : 'bg-slate-50 border-slate-200 dark:bg-slate-850 dark:border-slate-800'
          }`}>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-[11px] uppercase tracking-tight text-slate-700 dark:text-slate-300">4. Recepción</span>
                {record?.reception_signed_file_url ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                )}
              </div>
              <p className="text-[11px] text-slate-500">Comprobante de recepción</p>
            </div>

            <div className="mt-3 flex flex-col gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={!isRiohsAvailable || !canExecute || !record?.riohs_sent_at}
                onClick={handleManualDownloadReception}
                className="w-full text-[11px] h-7 gap-1 font-medium border-orange-200 text-orange-700 hover:bg-orange-100 dark:border-orange-800 dark:text-orange-400"
              >
                <Download className="h-3 w-3" />
                Descargar PDF
              </Button>

              <div className="flex items-center gap-1">
                <label className={`w-full cursor-pointer inline-flex items-center justify-center rounded-md text-[11px] font-medium h-7 px-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 ${
                  (!isRiohsAvailable || !canExecute || uploadingReception || !record?.riohs_sent_at) ? 'opacity-50 pointer-events-none' : ''
                }`}>
                  {uploadingReception ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Upload className="h-3 w-3 mr-1 text-slate-500" />
                  )}
                  {record?.reception_signed_file_url ? 'Reemplazar' : 'Subir Firmado'}
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={handleUploadReceptionFile}
                    disabled={!isRiohsAvailable || !canExecute || uploadingReception || !record?.riohs_sent_at}
                    className="hidden"
                  />
                </label>
                {record?.reception_signed_file_url && (
                  <a href={record.reception_signed_file_url} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-600 shrink-0" title="Ver Recepción Subida">
                      <FileCheck className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Metadata & History Status */}
        {record && (record.riohs_sent_at || record.auth_signed_file_url || record.reception_signed_file_url) && (
          <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 text-[11px] text-slate-500 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {record.riohs_sent_at && (
                <span>
                  <strong>Correo enviado:</strong> {format(parseISO(record.riohs_sent_at), "dd/MM/yyyy HH:mm 'hrs'", { locale: es })} ({record.riohs_sent_to_email || workerEmail})
                </span>
              )}

              {record.riohs_sent_at && (
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={handleManualDownloadReception}
                  className="h-6 text-[10px] text-orange-600 hover:text-orange-700 gap-1 p-1"
                >
                  <Download className="h-3 w-3" />
                  Re-descargar Comprobante Recepción
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
