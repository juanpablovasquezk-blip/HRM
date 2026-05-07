'use client';

import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { 
  Download, 
  Search, 
  FileSpreadsheet, 
  Car, 
  User, 
  Calendar,
  Building2,
  Filter
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { TransportRequestWithDetails, Company } from '@/types/database';
import { getTransportReportData } from './actions';
import { toast } from 'sonner';

interface Props {
  companies: Company[];
}

export default function TransportReportClient({ companies }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TransportRequestWithDetails[]>([]);
  const [filters, setFilters] = useState({
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
    companyId: ''
  });

  const fetchData = async () => {
    setLoading(true);
    const res = await getTransportReportData(filters);
    if (res.data) setData(res.data);
    else toast.error('Error al cargar reporte: ' + res.error);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const exportMobilesExcel = () => {
    const mobiles = data.filter(r => r.transport_type === 'REQUERIDO');
    const wsData = mobiles.map(r => ({
      'Fecha': r.date,
      'Nombre': `${r.personnel?.first_name} ${r.personnel?.last_name_father}`,
      'Dirección Origen': r.pickup_address,
      'Dirección Destino': r.destination_address,
      'Hora Recogida': r.pickup_time || 'N/A',
      'Reserva': r.reservation_number || 'N/A',
      'Observaciones': r.observations || ''
    }));

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Móviles Contratados');
    XLSX.writeFile(wb, `Reporte_Moviles_${filters.startDate}_${filters.endDate}.xlsx`);
  };

  const exportOwnTransportExcel = () => {
    const own = data.filter(r => r.transport_type === 'PROPIO');
    const wsData = own.map(r => ({
      'Fecha': r.date,
      'Nombre': `${r.personnel?.first_name} ${r.personnel?.last_name_father}`,
      'Hora de Entrada': r.assignment?.shift?.start_time || 'N/A'
    }));

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transporte Propio');
    XLSX.writeFile(wb, `Reporte_Propio_${filters.startDate}_${filters.endDate}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Filters Card */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 mb-4 text-slate-800 font-bold uppercase text-sm">
          <Filter className="w-4 h-4" /> Filtros de Reporte
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Fecha Inicio</label>
            <input 
              type="date" 
              value={filters.startDate}
              onChange={(e) => setFilters({...filters, startDate: e.target.value})}
              className="w-full p-2 bg-slate-50 border-slate-200 rounded-lg text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Fecha Fin</label>
            <input 
              type="date" 
              value={filters.endDate}
              onChange={(e) => setFilters({...filters, endDate: e.target.value})}
              className="w-full p-2 bg-slate-50 border-slate-200 rounded-lg text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Empresa</label>
            <select 
              value={filters.companyId}
              onChange={(e) => setFilters({...filters, companyId: e.target.value})}
              className="w-full p-2 bg-slate-50 border-slate-200 rounded-lg text-sm"
            >
              <option value="">Todas las empresas</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button 
            onClick={fetchData}
            disabled={loading}
            className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 font-bold text-sm"
          >
            <Search className="w-4 h-4" /> {loading ? 'Cargando...' : 'Consultar'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* CONTRACTED MOBILES SECTION */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
             <div className="flex items-center gap-2">
                <Car className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Móviles Contratados</h2>
             </div>
             <button 
               onClick={exportMobilesExcel}
               className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all text-xs font-bold uppercase shadow-sm"
             >
               <FileSpreadsheet className="w-4 h-4" /> Exportar Excel
             </button>
          </div>
          
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-400 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Personal</th>
                  <th className="px-4 py-3">Recogida</th>
                  <th className="px-4 py-3">Reserva</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.filter(r => r.transport_type === 'REQUERIDO').map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-slate-500">{r.date}</td>
                    <td className="px-4 py-3 font-bold text-slate-700 uppercase">{r.personnel?.first_name} {r.personnel?.last_name_father}</td>
                    <td className="px-4 py-3 text-indigo-600 font-mono font-bold">{r.pickup_time || '--:--'}</td>
                    <td className="px-4 py-3 text-slate-400">{r.reservation_number || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.filter(r => r.transport_type === 'REQUERIDO').length === 0 && (
              <div className="p-8 text-center text-slate-400 italic">No hay datos para este período</div>
            )}
          </div>
        </div>

        {/* OWN TRANSPORT SECTION */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
             <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Transporte Propio</h2>
             </div>
             <button 
               onClick={exportOwnTransportExcel}
               className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all text-xs font-bold uppercase shadow-sm"
             >
               <FileSpreadsheet className="w-4 h-4" /> Exportar Excel
             </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-400 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Personal</th>
                  <th className="px-4 py-3">Hora Entrada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.filter(r => r.transport_type === 'PROPIO').map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-slate-500">{r.date}</td>
                    <td className="px-4 py-3 font-bold text-slate-700 uppercase">{r.personnel?.first_name} {r.personnel?.last_name_father}</td>
                    <td className="px-4 py-3 text-slate-500">{r.assignment?.shift?.start_time || '--:--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.filter(r => r.transport_type === 'PROPIO').length === 0 && (
              <div className="p-8 text-center text-slate-400 italic">No hay datos para este período</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
