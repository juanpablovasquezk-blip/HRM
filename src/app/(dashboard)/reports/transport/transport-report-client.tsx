'use client';

import React, { useState, useEffect, useRef } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import {
  Download,
  Search,
  FileSpreadsheet,
  Car,
  User,
  Filter,
  Upload,
  CheckCircle,
  AlertCircle,
  X,
  DollarSign,
  Briefcase,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { TransportRequestWithDetails, Company } from '@/types/database';
import { getTransportReportData, importTransportCosts } from './actions';
import { toast } from 'sonner';

// =============================================================================
// Helpers
// =============================================================================

function formatCLP(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(value);
}

/**
 * Reads an Excel file and attempts to:
 * - Find the column whose header contains "reserva" (case-insensitive) → reservation number key
 * - Use column index 33 (AH, 0-based) → cost value
 *
 * Returns a map { reservationNumber -> cost }
 */
function parseProviderExcel(file: File): Promise<{
  costMap: Record<string, number>;
  preview: { reservation: string; cost: number }[];
  headerRow: string[];
  colAHHeader: string;
  totalRows: number;
  skippedRows: number;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        // Get raw rows (header: false so row 0 is the header)
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (rows.length < 2) {
          reject(new Error('El archivo está vacío o no tiene datos suficientes.'));
          return;
        }

        // Find header row — scan first 10 rows for a row that contains "reserva"
        let headerRowIdx = 0;
        for (let i = 0; i < Math.min(10, rows.length); i++) {
          const rowStr = rows[i].map(String).join(' ').toLowerCase();
          if (rowStr.includes('reserva')) {
            headerRowIdx = i;
            break;
          }
        }

        const headerRow = rows[headerRowIdx].map(String);

        // Find the column with "reserva" in the header
        const reservaColIdx = headerRow.findIndex(h =>
          h.toLowerCase().includes('reserva')
        );

        if (reservaColIdx === -1) {
          reject(new Error('No se encontró una columna de "Reserva" en el encabezado del Excel.'));
          return;
        }

        // Column AH = index 33 (A=0, B=1, ... H=7, Z=25, AA=26, AB=27, ..., AH=33)
        const AH_COL_IDX = 33;
        const colAHHeader = headerRow[AH_COL_IDX] || `Columna AH (${AH_COL_IDX + 1})`;

        const costMap: Record<string, number> = {};
        const preview: { reservation: string; cost: number }[] = [];
        let skippedRows = 0;

        const dataRows = rows.slice(headerRowIdx + 1);
        for (const row of dataRows) {
          const rawReservation = String(row[reservaColIdx] ?? '').trim();
          const rawCost = row[AH_COL_IDX];

          if (!rawReservation) { skippedRows++; continue; }

          // Parse cost — handle numeric or string with dots/commas
          let cost = 0;
          if (typeof rawCost === 'number') {
            cost = rawCost;
          } else {
            const cleaned = String(rawCost ?? '').replace(/[.$\s]/g, '').replace(',', '.');
            cost = parseFloat(cleaned) || 0;
          }

          if (cost === 0) { skippedRows++; continue; }

          costMap[rawReservation] = cost;
          if (preview.length < 5) {
            preview.push({ reservation: rawReservation, cost });
          }
        }

        resolve({ costMap, preview, headerRow, colAHHeader, totalRows: dataRows.length, skippedRows });
      } catch (err: any) {
        reject(new Error('Error al leer el archivo Excel: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsBinaryString(file);
  });
}

// =============================================================================
// Component
// =============================================================================

interface Props {
  companies: Company[];
}

export default function TransportReportClient({ companies }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TransportRequestWithDetails[]>([]);
  const [filters, setFilters] = useState({
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
    companyId: '',
  });

  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    costMap: Record<string, number>;
    preview: { reservation: string; cost: number }[];
    colAHHeader: string;
    totalRows: number;
    skippedRows: number;
  } | null>(null);
  const [importResult, setImportResult] = useState<{
    updated: number;
    notFound: string[];
  } | null>(null);

  // -----------------------------------------------------------------------

  const fetchData = async () => {
    setLoading(true);
    const res = await getTransportReportData(filters);
    if (res.data) setData(res.data);
    else toast.error('Error al cargar reporte: ' + res.error);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // -----------------------------------------------------------------------
  // Excel exports
  // -----------------------------------------------------------------------

  const exportMobilesExcel = () => {
    const mobiles = data.filter(r =>
      r.transport_type === 'REQUERIDO' || r.transport_type === 'PENDIENTE' || r.transport_type === 'EMPRESA'
    );
    const wsData = mobiles.map(r => ({
      'Fecha': r.date,
      'Nombre': `${r.personnel?.first_name} ${r.personnel?.last_name_father}`,
      'Puesto': r.assignment?.position?.name || 'N/A',
      'Empresa': r.personnel?.company?.name || 'N/A',
      'Dirección Origen': r.pickup_address,
      'Dirección Destino': r.destination_address,
      'Hora Recogida': r.pickup_time || 'PENDIENTE',
      'Reserva': r.reservation_number || 'PENDIENTE',
      'Costo': r.cost ?? '',
      'Observaciones': r.observations || '',
      'Estado': r.transport_type === 'PENDIENTE'
        ? 'Pendiente de Reserva'
        : r.transport_type === 'EMPRESA'
        ? 'Móvil Empresa'
        : 'Confirmado',
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
      'Puesto': r.assignment?.position?.name || 'N/A',
      'Empresa': r.personnel?.company?.name || 'N/A',
      'Hora de Entrada': r.assignment?.shift?.start_time || 'N/A',
    }));

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transporte Propio');
    XLSX.writeFile(wb, `Reporte_Propio_${filters.startDate}_${filters.endDate}.xlsx`);
  };

  // -----------------------------------------------------------------------
  // Import costs
  // -----------------------------------------------------------------------

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    setImportPreview(null);

    try {
      toast.loading('Leyendo archivo Excel del proveedor…');
      const result = await parseProviderExcel(file);
      toast.dismiss();
      setImportPreview(result);
    } catch (err: any) {
      toast.dismiss();
      toast.error(err.message);
    }
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  const handleImport = async () => {
    if (!importPreview) return;
    setImportLoading(true);
    toast.loading('Importando costos…');

    try {
      const res = await importTransportCosts(importPreview.costMap);
      toast.dismiss();

      if (res.error) {
        toast.error('Error al importar: ' + res.error);
      } else {
        toast.success(`✅ ${res.updated} registro(s) actualizados con costo.`);
        if (res.notFound.length > 0) {
          toast.warning(`⚠️ ${res.notFound.length} reserva(s) no encontradas en el sistema.`);
        }
        setImportResult({ updated: res.updated, notFound: res.notFound });
        setImportPreview(null);
        fetchData(); // Refresh report data
      }
    } finally {
      setImportLoading(false);
    }
  };

  // -----------------------------------------------------------------------
  // Derived values
  // -----------------------------------------------------------------------

  const mobileRows = data.filter(r =>
    r.transport_type === 'REQUERIDO' || r.transport_type === 'PENDIENTE' || r.transport_type === 'EMPRESA'
  );
  const ownRows = data.filter(r => r.transport_type === 'PROPIO');
  const totalCost = mobileRows.reduce((sum, r) => sum + (r.cost ?? 0), 0);
  const withCostCount = mobileRows.filter(r => r.cost != null).length;

  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ================================================================ */}
      {/* Filters Card                                                       */}
      {/* ================================================================ */}
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
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Fecha Fin</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Empresa</label>
            <select
              value={filters.companyId}
              onChange={(e) => setFilters({ ...filters, companyId: e.target.value })}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
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

      {/* ================================================================ */}
      {/* Import Costs Section                                               */}
      {/* ================================================================ */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-indigo-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-indigo-800 font-bold uppercase text-sm">
            <Upload className="w-4 h-4" /> Importar Costos desde Reporte Proveedor (Transvip)
          </div>
          <div className="text-[10px] text-slate-400">
            Sube el Excel mensual — se usará <span className="font-bold text-indigo-600">columna AH</span> (valor) y la columna de Reserva
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
            id="provider-excel-input"
          />
          <label
            htmlFor="provider-excel-input"
            className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-bold"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Seleccionar Excel del proveedor
          </label>

          {importResult && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
              <CheckCircle className="w-4 h-4" />
              <span><strong>{importResult.updated}</strong> actualizados</span>
              {importResult.notFound.length > 0 && (
                <span className="text-amber-700 ml-2">
                  · <strong>{importResult.notFound.length}</strong> no encontradas
                </span>
              )}
              <button
                onClick={() => setImportResult(null)}
                className="ml-2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Preview */}
        {importPreview && (
          <div className="mt-4 border border-indigo-200 rounded-lg overflow-hidden">
            <div className="bg-indigo-50 px-4 py-2 flex items-center justify-between">
              <div className="text-xs font-bold text-indigo-700 uppercase">
                Vista previa — {Object.keys(importPreview.costMap).length} reservas encontradas
                {importPreview.skippedRows > 0 && (
                  <span className="ml-2 text-slate-400 font-normal">
                    ({importPreview.skippedRows} filas omitidas sin reserva/costo)
                  </span>
                )}
              </div>
              <div className="text-[10px] text-indigo-500">
                Columna de costo: <strong>{importPreview.colAHHeader}</strong>
              </div>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-400 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2 text-left">N° Reserva</th>
                  <th className="px-4 py-2 text-right">Costo (col. AH)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {importPreview.preview.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-slate-700">{row.reservation}</td>
                    <td className="px-4 py-2 text-right font-bold text-indigo-700">{formatCLP(row.cost)}</td>
                  </tr>
                ))}
                {Object.keys(importPreview.costMap).length > 5 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-2 text-slate-400 italic text-center">
                      … y {Object.keys(importPreview.costMap).length - 5} más
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="bg-white px-4 py-3 flex justify-end gap-3 border-t border-slate-200">
              <button
                onClick={() => setImportPreview(null)}
                className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleImport}
                disabled={importLoading}
                className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                <Upload className="w-3 h-3" />
                {importLoading ? 'Importando…' : `Importar ${Object.keys(importPreview.costMap).length} costos`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* Tables                                                             */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* CONTRACTED MOBILES */}
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

          {/* Cost summary */}
          {withCostCount > 0 && (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2">
              <DollarSign className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="text-xs text-emerald-800">
                <span className="font-bold">Costo total período:</span>{' '}
                <span className="text-lg font-black">{formatCLP(totalCost)}</span>
                <span className="text-slate-400 ml-2">({withCostCount} de {mobileRows.length} con precio importado)</span>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-400 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-3">Fecha</th>
                  <th className="px-3 py-3">Personal</th>
                  <th className="px-3 py-3">
                    <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />Puesto</span>
                  </th>
                  <th className="px-3 py-3">Recogida</th>
                  <th className="px-3 py-3">Reserva</th>
                  <th className="px-3 py-3 text-right">
                    <span className="flex items-center gap-1 justify-end"><DollarSign className="w-3 h-3" />Costo</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mobileRows.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-3 py-3 text-slate-500">{r.date}</td>
                    <td className="px-3 py-3 font-bold text-slate-700 uppercase">
                      {r.personnel?.first_name} {r.personnel?.last_name_father}
                    </td>
                    <td className="px-3 py-3 text-slate-500">
                      {r.assignment?.position?.name
                        ? <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">{r.assignment.position.name}</span>
                        : <span className="text-slate-300">—</span>
                      }
                    </td>
                    <td className="px-3 py-3 text-indigo-600 font-mono font-bold">{r.pickup_time || '--:--'}</td>
                    <td className="px-3 py-3">
                      {r.transport_type === 'PENDIENTE' ? (
                        <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-bold uppercase">Pendiente</span>
                      ) : r.transport_type === 'EMPRESA' ? (
                        <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold uppercase">Móvil Empresa</span>
                      ) : (
                        <span className="text-slate-700 font-mono font-semibold">{r.reservation_number || '-'}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {r.cost != null
                        ? <span className="font-bold text-emerald-700">{formatCLP(r.cost)}</span>
                        : <span className="text-slate-300 text-[10px]">Sin precio</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {mobileRows.length === 0 && (
              <div className="p-8 text-center text-slate-400 italic">No hay datos para este período</div>
            )}
          </div>
        </div>

        {/* OWN TRANSPORT */}
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
                  <th className="px-3 py-3">Fecha</th>
                  <th className="px-3 py-3">Personal</th>
                  <th className="px-3 py-3">
                    <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />Puesto</span>
                  </th>
                  <th className="px-3 py-3">Hora Entrada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ownRows.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-3 py-3 text-slate-500">{r.date}</td>
                    <td className="px-3 py-3 font-bold text-slate-700 uppercase">
                      {r.personnel?.first_name} {r.personnel?.last_name_father}
                    </td>
                    <td className="px-3 py-3">
                      {r.assignment?.position?.name
                        ? <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">{r.assignment.position.name}</span>
                        : <span className="text-slate-300">—</span>
                      }
                    </td>
                    <td className="px-3 py-3 text-slate-500">{r.assignment?.shift?.start_time || '--:--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ownRows.length === 0 && (
              <div className="p-8 text-center text-slate-400 italic">No hay datos para este período</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
