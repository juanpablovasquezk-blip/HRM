'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  Search, 
  FileWarning, 
  CheckCircle2, 
  ChevronRight,
  Info,
  ShieldAlert,
  SearchCode,
  FileText,
  PlusCircle,
  Camera
} from 'lucide-react';
import UploadDocumentModal from './upload-document-modal';

export default function PersonnelClient({ 
  personnel, 
  documentDefs, 
  documents,
  userRole = 'USER'
}: { 
  personnel: any[], 
  documentDefs: any[], 
  documents: any[],
  userRole?: string
}) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPersonForUpload, setSelectedPersonForUpload] = useState<any | null>(null);
  const [initialDocName, setInitialDocName] = useState<string>('');

  const isAdmin = userRole === 'ADMIN';

  // Enhanced personnel with compliance data
  const enhancedPersonnel = useMemo(() => {
    return personnel.map(p => {
      const userDocs = documents.filter(d => d.personnel_id === p.id);
      
      // Calculate expired
      const expired_docs = userDocs
        .filter(d => d.status === 'APPROVED' && d.expiration_date && new Date(d.expiration_date) < new Date())
        .map(d => documentDefs.find(def => def.id === d.definition_id)?.name || d.type);

      // Calculate missing (mandatory only)
      const missing_docs = documentDefs
        .filter(def => def.is_mandatory)
        .filter(def => !userDocs.some(d => d.definition_id === def.id))
        .map(def => def.name);

      return {
        ...p,
        missing_docs,
        expired_docs
      };
    });
  }, [personnel, documentDefs, documents]);

  const filteredPersonnel = useMemo(() => {
    return enhancedPersonnel.filter(p => {
      const fullName = `${p.first_name} ${p.last_name_father} ${p.last_name_mother || ''}`.toLowerCase();
      return fullName.includes(searchTerm.toLowerCase());
    });
  }, [enhancedPersonnel, searchTerm]);

  // Stats
  const stats = useMemo(() => {
    const total = enhancedPersonnel.length;
    const withIssues = enhancedPersonnel.filter(p => (p.missing_docs?.length || 0) > 0 || (p.expired_docs?.length || 0) > 0).length;
    return { total, withIssues, compliant: total - withIssues };
  }, [enhancedPersonnel]);

  const handleOpenUpload = (person: any, docName?: string) => {
    setSelectedPersonForUpload(person);
    setInitialDocName(docName || '');
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
        <div className="p-4 space-y-4 max-w-lg mx-auto">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Users className="h-6 w-6 text-blue-600" />
              Personal
            </h1>
            <div className="flex gap-2">
              <Badge className="bg-red-100 text-red-700 border-none font-black text-[10px] rounded-lg">
                {stats.withIssues} CON PENDIENTES
              </Badge>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Buscar por nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border-none text-sm font-medium focus:ring-2 focus:ring-blue-600 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Personnel List */}
      <div className="p-4 space-y-3 max-w-lg mx-auto">
        {filteredPersonnel.map((p) => {
          const hasIssues = (p.missing_docs?.length || 0) > 0 || (p.expired_docs?.length || 0) > 0;
          
          return (
            <div key={p.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-11 w-11 rounded-full flex items-center justify-center flex-shrink-0
                    ${hasIssues ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500'}
                  `}>
                    {hasIssues ? <ShieldAlert className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-900 uppercase tracking-tight truncate">
                      {p.first_name} {p.last_name_father}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
                      {p.main_position || 'Sin Cargo'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!hasIssues && (
                    <Badge className="bg-emerald-100 text-emerald-700 text-[8px] font-black uppercase rounded-lg border-none">
                      Al Día
                    </Badge>
                  )}

                  {/* Upload button restricted ONLY to ADMIN */}
                  {isAdmin && (
                    <button
                      onClick={() => handleOpenUpload(p)}
                      className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-orange-50 text-orange-600 hover:bg-orange-100 px-3 py-2 rounded-xl transition-colors shrink-0"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      <span>Cargar</span>
                    </button>
                  )}
                </div>
              </div>

              {hasIssues && (
                <div className="bg-slate-50 p-4 border-t border-slate-100 space-y-3">
                  {p.missing_docs?.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-black text-red-600 uppercase tracking-widest flex items-center gap-1.5">
                        <FileWarning className="h-3 w-3" />
                        Documentos Faltantes
                      </p>
                      <div className="flex flex-wrap gap-1.5 pl-4">
                        {p.missing_docs.map((doc: string, i: number) => (
                          <button
                            key={i}
                            disabled={!isAdmin}
                            onClick={() => isAdmin && handleOpenUpload(p, doc)}
                            className={`text-[9px] font-bold text-slate-600 bg-white px-2.5 py-1 rounded-md border border-slate-200 flex items-center gap-1 transition-all ${
                              isAdmin ? 'hover:border-orange-500 hover:text-orange-600 hover:bg-orange-50/50 cursor-pointer' : 'cursor-default'
                            }`}
                          >
                            <span>{doc}</span>
                            {isAdmin && <PlusCircle className="h-3 w-3 text-orange-500 ml-0.5" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {p.expired_docs?.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-black text-orange-600 uppercase tracking-widest flex items-center gap-1.5">
                        <FileWarning className="h-3 w-3" />
                        Documentos Vencidos
                      </p>
                      <div className="flex flex-wrap gap-1.5 pl-4">
                        {p.expired_docs.map((doc: string, i: number) => (
                          <button
                            key={i}
                            disabled={!isAdmin}
                            onClick={() => isAdmin && handleOpenUpload(p, doc)}
                            className={`text-[9px] font-bold text-slate-600 bg-white px-2.5 py-1 rounded-md border border-slate-200 flex items-center gap-1 transition-all ${
                              isAdmin ? 'hover:border-orange-500 hover:text-orange-600 hover:bg-orange-50/50 cursor-pointer' : 'cursor-default'
                            }`}
                          >
                            <span>{doc}</span>
                            {isAdmin && <PlusCircle className="h-3 w-3 text-orange-500 ml-0.5" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Regularization Action Banner for Admin */}
                  {isAdmin && (
                    <div className="pt-1">
                      <button
                        onClick={() => handleOpenUpload(p)}
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black text-[10px] uppercase tracking-wider py-2 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
                      >
                        <Camera className="h-3.5 w-3.5" />
                        <span>Tomar Foto / Subir Pendiente (PdR)</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredPersonnel.length === 0 && (
          <div className="text-center py-20 space-y-4">
            <div className="h-20 w-20 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm">
              <SearchCode className="h-8 w-8 text-slate-200" />
            </div>
            <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest px-8 text-center">No se encontró personal con ese nombre</p>
          </div>
        )}
      </div>

      {/* Document Upload Modal */}
      {selectedPersonForUpload && (
        <UploadDocumentModal
          isOpen={!!selectedPersonForUpload}
          onClose={() => setSelectedPersonForUpload(null)}
          personnel={selectedPersonForUpload}
          documentDefs={documentDefs}
          initialDocName={initialDocName}
          onSuccess={() => {
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
