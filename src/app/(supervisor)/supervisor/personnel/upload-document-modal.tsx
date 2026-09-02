'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Camera, 
  Upload, 
  FileText, 
  Check, 
  Loader2, 
  ShieldCheck, 
  Calendar,
  AlertCircle,
  FileCheck,
  Trash2,
  AlertTriangle,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import { convertImagesToLightweightPDF } from '@/lib/utils/mobile-pdf-builder';
import { uploadSupervisorDocument } from '../../actions';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  personnel: any | null;
  documentDefs: any[];
  riohsRecord?: any | null;
  initialDocName?: string;
  onSuccess: () => void;
}

const PDR_DOC_KEYWORDS = ['RIOHS', 'REGLAMENTO', 'ODA', 'PREVENCION', 'SEGURIDAD', 'EXAMEN', 'PREOCUPACIONAL', 'INDUCCION', 'CHARLA', 'EPP'];

export default function UploadDocumentModal({
  isOpen,
  onClose,
  personnel,
  documentDefs,
  riohsRecord,
  initialDocName,
  onSuccess
}: UploadDocumentModalProps) {
  const [category, setCategory] = useState<'PDR' | 'GENERAL'>('PDR');
  const [selectedDefId, setSelectedDefId] = useState<string>('');
  const [customDocName, setCustomDocName] = useState<string>('');
  
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [generatedPdfBlob, setGeneratedPdfBlob] = useState<Blob | null>(null);
  const [generatedPdfSize, setGeneratedPdfSize] = useState<number>(0);
  
  const [issueDate, setIssueDate] = useState<string>('');
  const [expirationDate, setExpirationDate] = useState<string>('');
  const [docNumber, setDocNumber] = useState<string>('');
  
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // 1. Detect all pending documents & RIOHS steps for this specific worker
  const workerPendingItems = useMemo(() => {
    if (!personnel) return [];
    const items: { id: string; name: string; type: 'MISSING' | 'EXPIRED' | 'RIOHS'; isPdR: boolean; description?: string }[] = [];

    // RIOHS Step detection
    if (riohsRecord) {
      if (riohsRecord.riohs_status === 'AUTH_GENERATED') {
        items.push({
          id: 'RIOHS_STEP_2',
          name: 'Autorización RIOHS Firmada (Paso 2 PdR)',
          type: 'RIOHS',
          isPdR: true,
          description: 'Paso 2 PdR: Subir autorización firmada del Reglamento Interno'
        });
      } else if (riohsRecord.riohs_status === 'RIOHS_SENT') {
        items.push({
          id: 'RIOHS_STEP_4',
          name: 'Comprobante de Recepción RIOHS Firmado (Paso 4 PdR)',
          type: 'RIOHS',
          isPdR: true,
          description: 'Paso 4 PdR: Subir comprobante de recepción firmado'
        });
      }
    } else {
      // If no RIOHS record exists yet, offer Step 2 as available
      items.push({
        id: 'RIOHS_STEP_2',
        name: 'Autorización RIOHS Firmada (Paso 2 PdR)',
        type: 'RIOHS',
        isPdR: true,
        description: 'Paso 2 PdR: Subir autorización firmada del Reglamento Interno'
      });
    }

    // Missing docs
    (personnel.missing_docs || []).forEach((docName: string) => {
      const isPdR = PDR_DOC_KEYWORDS.some(kw => docName.toUpperCase().includes(kw));
      const matchingDef = documentDefs.find(def => def.name.toLowerCase() === docName.toLowerCase());
      items.push({
        id: matchingDef?.id || `MISSING_${docName}`,
        name: docName,
        type: 'MISSING',
        isPdR
      });
    });

    // Expired docs
    (personnel.expired_docs || []).forEach((docName: string) => {
      const isPdR = PDR_DOC_KEYWORDS.some(kw => docName.toUpperCase().includes(kw));
      const matchingDef = documentDefs.find(def => def.name.toLowerCase() === docName.toLowerCase());
      items.push({
        id: matchingDef?.id || `EXPIRED_${docName}`,
        name: `${docName} (Vencido)`,
        type: 'EXPIRED',
        isPdR
      });
    });

    return items;
  }, [personnel, riohsRecord, documentDefs]);

  // Pre-select document logic when modal opens
  useEffect(() => {
    if (!isOpen) return;

    if (initialDocName) {
      const isPdR = PDR_DOC_KEYWORDS.some(kw => initialDocName.toUpperCase().includes(kw));
      setCategory(isPdR ? 'PDR' : 'GENERAL');

      // Check in workerPendingItems first
      const pendingMatch = workerPendingItems.find(p => p.name.toLowerCase().includes(initialDocName.toLowerCase()));
      if (pendingMatch) {
        setSelectedDefId(pendingMatch.id);
        setCustomDocName('');
      } else {
        const matchingDef = documentDefs.find(def => def.name.toLowerCase() === initialDocName.toLowerCase());
        if (matchingDef) {
          setSelectedDefId(matchingDef.id);
          setCustomDocName('');
        } else {
          setSelectedDefId('OTHER');
          setCustomDocName(initialDocName);
        }
      }
    } else if (workerPendingItems.length > 0) {
      // Auto pre-select the first pending item!
      setSelectedDefId(workerPendingItems[0].id);
      setCategory(workerPendingItems[0].isPdR ? 'PDR' : 'GENERAL');
      setCustomDocName('');
    } else {
      setSelectedDefId('');
      setCustomDocName('');
    }

    // Reset state
    setCapturedPhotos([]);
    setSelectedFile(null);
    setGeneratedPdfBlob(null);
    setGeneratedPdfSize(0);
    setIssueDate('');
    setExpirationDate('');
    setDocNumber('');
  }, [isOpen, initialDocName, workerPendingItems, documentDefs]);

  if (!isOpen || !personnel) return null;

  // Selected item description / details
  const selectedPendingItem = workerPendingItems.find(item => item.id === selectedDefId);

  // Filter definitions by category for general listing
  const filteredDefs = documentDefs.filter(def => {
    const isPdR = PDR_DOC_KEYWORDS.some(kw => def.name.toUpperCase().includes(kw));
    return category === 'PDR' ? isPdR : !isPdR;
  });

  // Handle camera photo capture
  const handleCameraCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingPdf(true);
    try {
      const newPhotoUrls: string[] = [];
      const fileList: File[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        fileList.push(file);
        const url = URL.createObjectURL(file);
        newPhotoUrls.push(url);
      }

      const allPhotos = [...capturedPhotos, ...newPhotoUrls];
      setCapturedPhotos(allPhotos);
      setSelectedFile(null);

      // Generate lightweight PDF from all photos
      const pdfBlob = await convertImagesToLightweightPDF(fileList);
      setGeneratedPdfBlob(pdfBlob);
      setGeneratedPdfSize(Math.round(pdfBlob.size / 1024));
      toast.success(`Foto procesada. PDF liviano generado: ${Math.round(pdfBlob.size / 1024)} KB`);
    } catch (err: any) {
      console.error('Error procesando fotos a PDF:', err);
      toast.error('Error convirtiendo foto a PDF liviano');
    } finally {
      setIsProcessingPdf(false);
    }
  };

  // Handle direct file upload (PDF/Img)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCapturedPhotos([]);

    if (file.type.startsWith('image/')) {
      setIsProcessingPdf(true);
      try {
        const pdfBlob = await convertImagesToLightweightPDF([file]);
        setGeneratedPdfBlob(pdfBlob);
        setGeneratedPdfSize(Math.round(pdfBlob.size / 1024));
        setSelectedFile(null);
        toast.success(`Imagen convertida a PDF liviano: ${Math.round(pdfBlob.size / 1024)} KB`);
      } catch (err) {
        toast.error('Error al procesar imagen');
      } finally {
        setIsProcessingPdf(false);
      }
    } else {
      setSelectedFile(file);
      setGeneratedPdfBlob(null);
      setGeneratedPdfSize(Math.round(file.size / 1024));
    }
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let docTypeName = '';
    let defId = selectedDefId;

    if (selectedDefId === 'RIOHS_STEP_2') {
      docTypeName = 'AUTORIZACION RIOHS';
      defId = '';
    } else if (selectedDefId === 'RIOHS_STEP_4') {
      docTypeName = 'COMPROBANTE RECEPCION RIOHS';
      defId = '';
    } else if (selectedDefId === 'OTHER' || !selectedDefId) {
      if (!customDocName.trim()) {
        toast.error('Por favor especifica el nombre del documento.');
        return;
      }
      docTypeName = customDocName.trim().toUpperCase();
      defId = '';
    } else if (selectedDefId.startsWith('MISSING_') || selectedDefId.startsWith('EXPIRED_')) {
      docTypeName = selectedPendingItem?.name.replace(' (Vencido)', '').toUpperCase() || 'DOCUMENTO';
      defId = '';
    } else {
      const defObj = documentDefs.find(d => d.id === selectedDefId);
      docTypeName = defObj ? defObj.name : (selectedPendingItem?.name || 'DOCUMENTO');
    }

    // Determine final File object to upload
    let fileToUpload: File | null = null;

    if (generatedPdfBlob) {
      const sanitizedName = docTypeName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      fileToUpload = new File([generatedPdfBlob], `${sanitizedName}_${Date.now()}.pdf`, {
        type: 'application/pdf'
      });
    } else if (selectedFile) {
      fileToUpload = selectedFile;
    }

    if (!fileToUpload) {
      toast.error('Toma una foto con la cámara o selecciona un archivo PDF.');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.set('personnel_id', personnel.id);
      formData.set('definition_id', defId);
      formData.set('doc_type_name', docTypeName);
      formData.set('file', fileToUpload);
      if (issueDate) formData.set('issue_date', issueDate);
      if (expirationDate) formData.set('expiration_date', expirationDate);
      if (docNumber) formData.set('document_number', docNumber);

      const res = await uploadSupervisorDocument(formData);

      if (!res.success) {
        toast.error(res.error || 'Error subiendo documento');
      } else {
        toast.success(`Documento Aprobado y Guardado (${docTypeName})`);
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      toast.error(err.message || 'Error en la subida');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-orange-500/20 text-orange-400 flex items-center justify-center">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-black uppercase tracking-tight">Cargar Documento / PdR</h2>
              <p className="text-xs text-slate-300 font-medium">{personnel.first_name} {personnel.last_name_father}</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-5 flex-1">

          {/* Pending Step Banner Alert */}
          {selectedPendingItem && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-3.5 flex items-start gap-3 text-orange-900">
              <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-600">Pendiente Detectado</p>
                <p className="text-xs font-bold">{selectedPendingItem.name}</p>
                {selectedPendingItem.description && (
                  <p className="text-[11px] font-medium text-orange-700 mt-0.5">{selectedPendingItem.description}</p>
                )}
              </div>
            </div>
          )}
          
          {/* Category Selector Tabs */}
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => { setCategory('PDR'); }}
              className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                category === 'PDR' 
                  ? 'bg-orange-500 text-white shadow-md' 
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              Prevención (PdR)
            </button>
            <button
              type="button"
              onClick={() => { setCategory('GENERAL'); }}
              className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                category === 'GENERAL' 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <FileText className="h-4 w-4" />
              General
            </button>
          </div>

          {/* Smart Document Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Seleccionar Documento a Regularizar
            </label>
            <select
              value={selectedDefId}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedDefId(val);
                const pendingMatch = workerPendingItems.find(item => item.id === val);
                if (pendingMatch) {
                  setCategory(pendingMatch.isPdR ? 'PDR' : 'GENERAL');
                }
              }}
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs font-bold rounded-xl p-3 outline-none focus:ring-2 focus:ring-orange-500"
            >
              {workerPendingItems.length > 0 && (
                <optgroup label="⚠️ DOCUMENTOS PENDIENTES DE ESTE TRABAJADOR">
                  {workerPendingItems.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
              )}

              <optgroup label="📂 TODOS LOS DOCUMENTOS DEL SISTEMA">
                {filteredDefs.map(def => (
                  <option key={def.id} value={def.id}>
                    {def.name} {def.is_mandatory ? '(Obligatorio)' : ''}
                  </option>
                ))}
              </optgroup>
              
              <option value="OTHER">＋ Otro documento (Escribir nombre)...</option>
            </select>
          </div>

          {selectedDefId === 'OTHER' && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre del Documento</label>
              <input 
                type="text"
                placeholder="Ej. Autorización Especial de Seguridad, Inducción Faena..."
                value={customDocName}
                onChange={(e) => setCustomDocName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs font-bold rounded-xl p-3 outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>
          )}

          {/* Capture Controls */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Captura de Cámara o Archivo</label>
            
            <div className="grid grid-cols-2 gap-3">
              {/* Camera Capture Button */}
              <label className="flex flex-col items-center justify-center p-4 bg-orange-50 text-orange-700 border-2 border-dashed border-orange-200 rounded-2xl cursor-pointer hover:bg-orange-100 transition-all text-center">
                <Camera className="h-7 w-7 text-orange-600 mb-1" />
                <span className="text-xs font-black uppercase">Tomar Foto</span>
                <span className="text-[9px] font-medium text-orange-500">Cámara celular</span>
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment" 
                  onChange={handleCameraCapture}
                  className="hidden" 
                />
              </label>

              {/* File Selector Button */}
              <label className="flex flex-col items-center justify-center p-4 bg-slate-50 text-slate-700 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-100 transition-all text-center">
                <Upload className="h-7 w-7 text-slate-500 mb-1" />
                <span className="text-xs font-black uppercase">Subir Archivo</span>
                <span className="text-[9px] font-medium text-slate-400">PDF o Imagen</span>
                <input 
                  type="file" 
                  accept="application/pdf,image/*" 
                  onChange={handleFileSelect}
                  className="hidden" 
                />
              </label>
            </div>
          </div>

          {/* Processing Indicator */}
          {isProcessingPdf && (
            <div className="flex items-center justify-center gap-3 p-4 bg-amber-50 text-amber-800 rounded-2xl border border-amber-200">
              <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
              <span className="text-xs font-bold">Comprimiendo foto y generando PDF liviano...</span>
            </div>
          )}

          {/* Preview of Generated PDF / File */}
          {(generatedPdfBlob || selectedFile) && !isProcessingPdf && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                  <FileCheck className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-black text-emerald-900 uppercase">
                    {generatedPdfBlob ? 'PDF Liviano Listo' : selectedFile?.name}
                  </p>
                  <p className="text-[10px] font-bold text-emerald-700">
                    Tamaño: <span className="font-black text-emerald-900">{generatedPdfSize} KB</span> (Optimizado)
                  </p>
                </div>
              </div>

              <button 
                type="button" 
                onClick={() => { setGeneratedPdfBlob(null); setSelectedFile(null); setCapturedPhotos([]); }}
                className="text-emerald-700 hover:text-red-600 p-2"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          )}

          {/* Optional Dates */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Fecha Emisión</label>
              <input 
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl p-2.5"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Fecha Vencimiento</label>
              <input 
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl p-2.5"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isUploading || isProcessingPdf || (!generatedPdfBlob && !selectedFile)}
              className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-orange-500/25 hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 stroke-[3]" />
                  <span>Aprobar y Guardar</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
