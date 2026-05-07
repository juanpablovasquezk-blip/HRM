'use client';

import React, { useState, useMemo } from 'react';
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
  FileText
} from 'lucide-react';

export default function PersonnelClient({ personnel }: { personnel: any[] }) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredPersonnel = useMemo(() => {
    return personnel.filter(p => {
      const fullName = `${p.first_name} ${p.last_name_father} ${p.last_name_mother || ''}`.toLowerCase();
      return fullName.includes(searchTerm.toLowerCase());
    });
  }, [personnel, searchTerm]);

  // Stats
  const stats = useMemo(() => {
    const total = personnel.length;
    const withIssues = personnel.filter(p => (p.missing_docs?.length || 0) > 0 || (p.expired_docs?.length || 0) > 0).length;
    return { total, withIssues, compliant: total - withIssues };
  }, [personnel]);

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
            <div key={p.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all active:scale-[0.98]">
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
                {!hasIssues && (
                  <Badge className="bg-emerald-100 text-emerald-700 text-[8px] font-black uppercase rounded-lg border-none">
                    Al Día
                  </Badge>
                )}
              </div>

              {hasIssues && (
                <div className="bg-slate-50 p-4 border-t border-slate-100 space-y-3">
                  {p.missing_docs?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-red-600 uppercase tracking-widest flex items-center gap-1.5">
                        <FileWarning className="h-3 w-3" />
                        Documentos Faltantes
                      </p>
                      <div className="flex flex-wrap gap-1.5 pl-4">
                        {p.missing_docs.map((doc: string, i: number) => (
                          <span key={i} className="text-[9px] font-bold text-slate-500 bg-white px-2 py-1 rounded-md border border-slate-200">
                            {doc}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {p.expired_docs?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-orange-600 uppercase tracking-widest flex items-center gap-1.5">
                        <FileWarning className="h-3 w-3" />
                        Documentos Vencidos
                      </p>
                      <div className="flex flex-wrap gap-1.5 pl-4">
                        {p.expired_docs.map((doc: string, i: number) => (
                          <span key={i} className="text-[9px] font-bold text-slate-500 bg-white px-2 py-1 rounded-md border border-slate-200">
                            {doc}
                          </span>
                        ))}
                      </div>
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
    </div>
  );
}
