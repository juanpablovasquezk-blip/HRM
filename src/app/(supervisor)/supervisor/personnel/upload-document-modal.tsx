'use client';

import React, { useState, useEffect } from 'react';
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
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { convertImagesToLightweightPDF } from '@/lib/utils/mobile-pdf-builder';
import { uploadSupervisorDocument } from '../../actions';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  personnel: any | null;
  documentDefs: any[];
  initialDocName?: string;
  onSuccess: () => void;
}

const PDR_DOC_KEYWORDS = ['RIOHS', 'REGLAMENTO', 'ODA', 'PREVENCION', 'SEGURIDAD', 'EXAMEN', 'PREOCUPACIONAL', 'INDUCCION', 'CHARLA', 'EPP'];

export default function UploadDocumentModal({
  isOpen,
  onClose,
  personnel,
  documentDefs,
  initialDocName,
  onSuccess
}: UploadDocumentModalProps) {
  const [category, setCategory] = useState<'GENERAL' | 'PDR'>('PDR');
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

  useEffect(() => {
    if (initialDocName) {
      const isPdR = PDR_DOC_KEYWORDS.some(kw => initialDocName.toUpperCase().includes(kw));
      setCategory(isPdR ? 'PDR' : 'GENERAL');
      
      const matchingDef = documentDefs.find(def => def.name.toLowerCase() === initialDocName.toLowerCase());
      if (matchingDef) {
        setSelectedDefId(matchingDef.id);
        setCustomDocName('');
      } else {
        setSelectedDefId('OTHER');
        setCustomDocName(initialDocName);
      }
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
  }, [isOpen, initialDocName, documentDefs]);

  if (!isOpen || !personnel) return null;

  // Filter definitions by category
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

    if (selectedDefId === 'OTHER' || !selectedDefId) {
      if (!customDocName.trim()) {
        toast.error('Por favor especifica el nombre del documento.');
        return;
      }
      docTypeName = customDocName.trim().toUpperCase();
      defId = '';
    } else {
      const defObj = documentDefs.find(d => d.id === selectedDefId);
      docTypeName = defObj ? defObj.name : 'DOCUMENTO';
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
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-5 flex-1">
          
          {/* Category Selector Tabs */}
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => { setCategory('PDR'); setSelectedDefId(''); }}
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
              onClick={() => { setCategory('GENERAL'); setSelectedDefId(''); }}
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

          {/* Document Type Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Tipo de Documento {category === 'PDR' ? '(Prevención de Riesgos)' : '(General)'}
            </label>
            <select
              value={selectedDefId}
              onChange={(e) => setSelectedDefId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs font-bold rounded-xl p-3 outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">-- Seleccionar documento pendiente --</option>
              {filteredDefs.map(def => (
                <option key={def.id} value={def.id}>
                  {def.name} {def.is_mandatory ? '(Obligatorio)' : ''}
                </option>
              ))}
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
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Captura o Archivo</label>
            
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
              <span className="text-xs font-bold">Comprimiendo imagen y compilando PDF liviano...</span>
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
