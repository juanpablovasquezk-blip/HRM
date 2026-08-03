'use client';

import React, { useState } from 'react';
import { 
  FileText, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  XCircle,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Badge } from '@/components/ui/badge';
import { Document, DocumentDefinition } from '@/types/database';
import { uploadDocumentRecord } from '../../actions';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { calculateDynamicExpiration, calculateIntervalExpiration } from '@/lib/utils/document-calc';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

import { createClient } from '@/lib/supabase/client';
import DocumentCapture from '@/components/onboarding/document-capture';
import { compileFrontBackPdf, compileSingleCardPdf } from '@/lib/documents/pdf-compiler';

import { DatePickerField } from '@/components/ui/date-picker-field';

interface WorkerDocumentsClientProps {
  definitions: DocumentDefinition[];
  existingDocuments: Document[];
  userId: string;
}

const getCaptureType = (defName: string): 'card' | 'selfie' | 'pdf' => {
  const name = defName.toLowerCase();
  if (
    name.includes('cedula') ||
    name.includes('cédula') ||
    name.includes('licencia') ||
    name.includes('credencial') ||
    name.includes('carnet') ||
    name.includes('tarjeta') ||
    name.includes('pcp') ||
    name.includes('tica')
  ) {
    return 'card';
  }
  if (name.includes('foto') || name.includes('selfie') || name.includes('rostro')) {
    return 'selfie';
  }
  return 'pdf';
};

const isSingleCard = (defName: string): boolean => {
  const name = defName.toLowerCase();
  return name.includes('pcp') || name.includes('tica');
};

const base64ToFile = (base64String: string, filename: string): File => {
  const arr = base64String.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || '';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
};

export default function WorkerDocumentsClient({ definitions, existingDocuments, userId }: WorkerDocumentsClientProps) {
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDef, setSelectedDef] = useState<DocumentDefinition | null>(null);
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [capturedValue, setCapturedValue] = useState<string | null>(null);
  const [capturedFront, setCapturedFront] = useState<string | null>(null);
  const [capturedBack, setCapturedBack] = useState<string | null>(null);
  
  const supabase = createClient();

  const getDocStatus = (defId: string) => {
    const doc = existingDocuments.find(d => d.definition_id === defId);
    if (!doc) return { label: 'Faltante', color: 'bg-red-50 text-red-700', icon: AlertCircle, status: 'MISSING' };
    
    switch (doc.status) {
      case 'APPROVED': return { label: 'Aprobado', color: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2, status: 'APPROVED' };
      case 'REJECTED': return { label: 'Rechazado', color: 'bg-red-50 text-red-700', icon: XCircle, status: 'REJECTED' };
      default: return { label: 'Pendiente', color: 'bg-amber-50 text-amber-700', icon: Clock, status: 'PENDING' };
    }
  };

  const handleOpenUpload = (def: DocumentDefinition) => {
    setSelectedDef(def);
    setExpiryDate('');
    setCapturedValue(null);
    setCapturedFront(null);
    setCapturedBack(null);
    setIsDialogOpen(true);
  };

  const processUpload = async () => {
    if (!selectedDef) return;

    const captureType = getCaptureType(selectedDef.name);
    const isSingle = isSingleCard(selectedDef.name);

    if (captureType === 'card' && !isSingle) {
      if (!capturedFront || !capturedBack) {
        toast.error('Por favor, captura ambas partes (delantera y trasera)');
        return;
      }
    } else {
      if (!capturedValue) {
        toast.error('Selecciona o toma una foto del documento');
        return;
      }
    }

    if (selectedDef.requires_expiration && !selectedDef.depends_on_definition_id && !expiryDate) {
      toast.error('La fecha de vencimiento es obligatoria');
      return;
    }

    setUploadingId(selectedDef.id);
    const loadingToast = toast.loading('Subiendo documento...');

    try {
      let finalFile: File;

      if (captureType === 'card') {
        if (isSingle) {
          const compiledPdfBase64 = await compileSingleCardPdf(capturedValue!);
          const fileName = `${selectedDef.id}-${Date.now()}.pdf`;
          finalFile = base64ToFile(compiledPdfBase64, fileName);
        } else {
          const compiledPdfBase64 = await compileFrontBackPdf(capturedFront!, capturedBack!);
          const fileName = `${selectedDef.id}-${Date.now()}.pdf`;
          finalFile = base64ToFile(compiledPdfBase64, fileName);
        }
      } else {
        const mimeType = capturedValue!.split(';')[0].split(':')[1];
        const ext = mimeType === 'application/pdf' ? 'pdf' : 'jpg';
        const fileName = `${selectedDef.id}-${Date.now()}.${ext}`;
        finalFile = base64ToFile(capturedValue!, fileName);
      }

      const filePath = `${userId}/${finalFile.name}`;

      // 1. Upload to Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, finalFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);
      
      // 2. Save Database Record
      const res = await uploadDocumentRecord({
        definition_id: selectedDef.id,
        file_url: publicUrl,
        type: selectedDef.name,
        expiration_date: expiryDate || null,
        status: 'PENDING'
      });

      if (res.success) {
        toast.success('¡Documento subido!', { id: loadingToast });
        setIsDialogOpen(false);
        window.location.reload();
      } else {
        toast.error(res.error || 'Error al guardar', { id: loadingToast });
      }
    } catch (error: any) {
      toast.error(error.message || 'Error en la subida', { id: loadingToast });
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-lg mx-auto">
      <div className="space-y-1">
        <h2 className="text-2xl font-black text-slate-900 leading-tight">Mis Documentos 📄</h2>
        <p className="text-slate-500 font-medium text-sm">Gestiona tus documentos requeridos por la empresa</p>
      </div>

      <div className="space-y-4">
        {definitions.map((def) => {
          const status = getDocStatus(def.id);
          const StatusIcon = status.icon;
          const doc = existingDocuments.find(d => d.definition_id === def.id);

          return (
            <Card key={def.id} className="overflow-hidden border-none shadow-lg shadow-slate-200/50 rounded-3xl">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${def.is_mandatory ? 'bg-orange-50 text-orange-600' : 'bg-slate-50 text-slate-500'}`}>
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-bold text-slate-900 truncate">{def.name}</p>
                      {def.is_mandatory && status.status === 'MISSING' && (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-100 text-[10px] font-bold uppercase py-0">Obligatorio</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-1">{def.description || 'Sin descripción'}</p>
                    
                    {/* Expiration Display */}
                    {def.requires_expiration && (
                      <div className={cn(
                        "mt-2 p-2 rounded-lg border",
                        def.depends_on_definition_id ? "bg-indigo-50 border-indigo-100/50" : "bg-slate-50 border-slate-200"
                      )}>
                        <p className={cn(
                          "text-[10px] font-bold uppercase mb-1",
                          def.depends_on_definition_id ? "text-indigo-400" : "text-slate-400"
                        )}>
                          {(() => {
                            if (def.depends_on_definition_id) {
                              const anchorDef = definitions.find(d => d.id === def.depends_on_definition_id);
                              const hasAnchor = existingDocuments.some(d => d.definition_id === def.depends_on_definition_id);
                              return hasAnchor ? `Vencimiento Anclado a ${anchorDef?.name}` : 'Vencimiento por Ciclo (6 meses)';
                            }
                            return 'Fecha de Vencimiento';
                          })()}
                        </p>
                        
                        {(() => {
                          // Prioritize manual expiration date if already uploaded and present
                          if (doc?.expiration_date) {
                            return (
                              <p className={cn("text-xs font-bold", def.depends_on_definition_id ? "text-indigo-700" : "text-slate-700")}>
                                {format(parseISO(doc.expiration_date), "dd 'de' MMMM, yyyy", { locale: es })}
                              </p>
                            );
                          }

                          // Calculation Logic for dependencies
                          if (def.depends_on_definition_id) {
                            const anchorDoc = existingDocuments.find(d => d.definition_id === def.depends_on_definition_id);
                            if (anchorDoc?.expiration_date) {
                              const calcDate = calculateDynamicExpiration(
                                parseISO(anchorDoc.expiration_date),
                                def.cycle_months || 6,
                                def.anchor_days_offset || 30
                              );
                              return (
                                <p className="text-xs text-indigo-700 font-bold">
                                  {format(calcDate, "dd 'de' MMMM, yyyy", { locale: es })}
                                </p>
                              );
                            }
                          }

                          // Fallback for non-dependent or interval-based
                          if (doc?.uploaded_at && def.cycle_months) {
                            const calcDate = calculateIntervalExpiration(parseISO(doc.uploaded_at), def.cycle_months);
                            return (
                              <div className="space-y-0.5">
                                <p className="text-xs text-slate-700 font-bold">
                                  {format(calcDate, "dd 'de' MMMM, yyyy", { locale: es })}
                                </p>
                                <p className="text-[9px] text-slate-500 italic">Basado en última subida ({format(parseISO(doc.uploaded_at), "dd/MM/yy")})</p>
                              </div>
                            );
                          }

                          return <p className="text-xs text-slate-400 italic">Se mostrará al subir el documento</p>;
                        })()}
                      </div>
                    )}
                  </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${status.color} text-[10px] font-black uppercase tracking-wider`}>
                    <StatusIcon className="h-3 w-3" />
                    {status.label}
                  </div>

                  <div className="flex gap-2">
                    {doc && (
                      <a 
                        href={doc.file_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={cn(
                          buttonVariants({ variant: "outline", size: "icon-sm" }),
                          "h-9 w-9 rounded-xl border-slate-200 text-slate-600 flex items-center justify-center"
                        )}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                    
                    <Button 
                      onClick={() => handleOpenUpload(def)} 
                      disabled={uploadingId === def.id}
                      className={`h-9 px-4 rounded-xl font-bold text-xs uppercase tracking-wide gap-2 shadow-sm ${
                        status.status === 'APPROVED' 
                          ? 'bg-slate-100 text-slate-400' 
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {uploadingId === def.id ? 'Subiendo...' : doc ? 'Actualizar' : 'Subir'}
                      {!uploadingId && <Upload className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>

                {doc?.rejection_reason && status.status === 'REJECTED' && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-black text-red-800 uppercase tracking-tight">Motivo de rechazo</p>
                      <p className="text-xs text-red-600 italic">"{doc.rejection_reason}"</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="bg-orange-50 p-4 rounded-3xl border border-orange-100 space-y-2">
        <div className="flex items-center gap-2 text-orange-800">
          <AlertCircle className="h-4 w-4" />
          <p className="text-xs font-black uppercase tracking-tight">Información importante</p>
        </div>
        <p className="text-[11px] text-orange-700 leading-relaxed font-medium">
          Asegúrate de que las fotos sean claras y que toda la información sea legible. Los documentos marcados como <strong>obligatorios</strong> son necesarios para tu continuidad operativa.
        </p>
      </div>

      {/* Upload Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className={cn(
          "rounded-3xl p-6 overflow-hidden border-none shadow-2xl bg-white transition-all duration-300",
          selectedDef && getCaptureType(selectedDef.name) === 'card' && !isSingleCard(selectedDef.name)
            ? "sm:max-w-[650px] w-full" 
            : "sm:max-w-[400px]"
        )}>
          <DialogHeader className="p-0 mb-6">
            <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              <Upload className="h-5 w-5 text-orange-500" />
              Subir {selectedDef?.name}
            </DialogTitle>
            <DialogDescription className="text-slate-400 font-medium">
              Completa la información para subir tu documento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {selectedDef?.requires_expiration && !selectedDef?.depends_on_definition_id && (
              <div className="space-y-2">
                <Label htmlFor="expiry" className="text-xs font-black uppercase text-slate-400 ml-1">Fecha de Vencimiento</Label>
                <DatePickerField 
                  id="doc-expiry-date" 
                  value={expiryDate}
                  onChange={(val: string) => {
                    console.log('Date changed:', val);
                    setExpiryDate(val);
                  }}
                  minYear={2020}
                  maxYear={2045}
                />
                <p className="text-[10px] text-orange-600 font-bold px-1 italic">Ingresa la fecha que aparece en tu documento físico.</p>
              </div>
            )}

            {selectedDef && getCaptureType(selectedDef.name) === 'card' ? (
              isSingleCard(selectedDef.name) ? (
                <DocumentCapture
                  id={selectedDef.id}
                  label="Parte Delantera *"
                  description={`Foto frontal de tu ${selectedDef.name}.`}
                  type="card"
                  value={capturedValue}
                  onChange={setCapturedValue}
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <DocumentCapture
                    id={`${selectedDef.id}_front`}
                    label="Parte Delantera *"
                    description="Foto frontal de la cédula/licencia."
                    type="card"
                    value={capturedFront}
                    onChange={setCapturedFront}
                  />
                  <DocumentCapture
                    id={`${selectedDef.id}_back`}
                    label="Parte Trasera *"
                    description="Foto trasera de la cédula/licencia."
                    type="card"
                    value={capturedBack}
                    onChange={setCapturedBack}
                  />
                </div>
              )
            ) : (
              selectedDef && (
                <DocumentCapture
                  id={selectedDef.id}
                  label="Archivo del Documento"
                  description="Selecciona un archivo PDF o toma una foto del documento."
                  type={getCaptureType(selectedDef.name)}
                  value={capturedValue}
                  onChange={setCapturedValue}
                />
              )
            )}
          </div>

          <DialogFooter className="mt-8 gap-2 sm:gap-0 flex-col sm:flex-row">
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)} disabled={uploadingId !== null} className="rounded-2xl font-bold uppercase text-xs">
              Cancelar
            </Button>
            <Button 
              onClick={processUpload} 
              disabled={
                uploadingId !== null || 
                (selectedDef && getCaptureType(selectedDef.name) === 'card' && !isSingleCard(selectedDef.name)
                  ? (!capturedFront || !capturedBack) 
                  : !capturedValue)
              } 
              className="bg-slate-900 hover:bg-slate-800 text-white rounded-2xl px-8 font-black uppercase text-xs tracking-widest flex-1"
            >
              {uploadingId ? 'Subiendo...' : 'Confirmar y Subir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
