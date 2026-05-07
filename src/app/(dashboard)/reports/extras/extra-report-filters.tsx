'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Calendar, Download, Building2 } from 'lucide-react';

interface Props {
  from: string;
  to: string;
  companies: { id: string, name: string }[];
  companyId?: string;
}

export default function ExtraReportFilters({ from, to, companies, companyId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleFilterChange = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-3">
      {/* COMPANY FILTER */}
      <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm pr-3">
        <div className="px-2">
          <Building2 className="w-4 h-4 text-slate-400" />
        </div>
        <select 
          value={companyId || ''} 
          onChange={(e) => handleFilterChange('company_id', e.target.value)}
          className="text-xs font-bold uppercase text-slate-600 bg-transparent border-none focus:ring-0 p-0 cursor-pointer"
        >
          <option value="">Todas las Empresas</option>
          {companies.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 px-2 py-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase">Desde</label>
          <input 
            type="date" 
            value={from} 
            onChange={(e) => handleFilterChange('from', e.target.value)}
            className="text-sm font-medium text-slate-700 bg-transparent border-none focus:ring-0 p-0"
          />
        </div>
        <div className="w-px h-6 bg-slate-100" />
        <div className="flex items-center gap-2 px-2 py-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase">Hasta</label>
          <input 
            type="date" 
            value={to} 
            onChange={(e) => handleFilterChange('to', e.target.value)}
            className="text-sm font-medium text-slate-700 bg-transparent border-none focus:ring-0 p-0"
          />
        </div>
        <div className="px-2">
          <Calendar className="w-4 h-4 text-slate-300" />
        </div>
      </div>

      <button 
        onClick={() => window.print()} 
        className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all font-medium shadow-sm"
      >
        <Download className="w-4 h-4" /> Exportar / Imprimir
      </button>

      <style jsx global>{`
        @media print {
          /* HIDE SIDEBAR, HEADER AND NAVIGATION */
          aside, nav, header, [data-sidebar], .no-print { 
            display: none !important; 
          }
          
          /* RESET MAIN CONTENT MARGINS FOR FULL WIDTH */
          main, .main-content {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }

          body { 
            background: white !important; 
            padding: 10mm !important;
            margin: 0 !important;
          }
          
          .animate-in { animation: none !important; }
          .Card { border: 1px solid #eee !important; box-shadow: none !important; page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
