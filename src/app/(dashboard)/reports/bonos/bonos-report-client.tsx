'use client';

import { useState, useEffect, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { Printer, Search, Loader2, Check, DollarSign, Calendar, Landmark, AlertCircle, RefreshCw, Download } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import {
  getBonosReportData,
  updateShiftPaidMonth,
  updateTransportPaidMonth,
  bulkUpdatePaidMonth
} from './actions';

interface BonosReportClientProps {
  companies: any[];
  initialFrom: string;
  initialTo: string;
  initialCompanyId?: string;
}

export function BonosReportClient({
  companies,
  initialFrom,
  initialTo,
  initialCompanyId = ''
}: BonosReportClientProps) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [paymentStatus, setPaymentStatus] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [shifts, setShifts] = useState<any[]>([]);
  const [transports, setTransports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportView, setReportView] = useState<'detailed' | 'summary'>('detailed');
  const [isPending, startTransition] = useTransition();

  // Local state for tracking saving status per row
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({});
  
  // Local state for bulk month input per personnel ID
  const [bulkMonths, setBulkMonths] = useState<Record<string, string>>({});

  // Local state for selected items per personnel ID
  const [selectedShifts, setSelectedShifts] = useState<Record<string, string[]>>({});
  const [selectedTransports, setSelectedTransports] = useState<Record<string, string[]>>({});

  const fetchData = async (currentFrom: string, currentTo: string, currentCompanyId: string) => {
    setLoading(true);
    try {
      const res = await getBonosReportData({
        from: currentFrom,
        to: currentTo,
        companyId: currentCompanyId || undefined
      });

      if ('error' in res) {
        toast.error(`Error al cargar datos: ${res.error}`);
      } else {
        setShifts(res.shifts || []);
        setTransports(res.transports || []);
        // Reset selections on new search
        setSelectedShifts({});
        setSelectedTransports({});
      }
    } catch (error: any) {
      toast.error(`Error inesperado: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch initial data
  useEffect(() => {
    fetchData(from, to, companyId);
  }, []);

  const handleSearch = () => {
    startTransition(async () => {
      await fetchData(from, to, companyId);
      toast.success('Reporte actualizado.');
    });
  };

  const handleUpdateShiftPaidMonth = async (shiftId: string, value: string) => {
    setSavingRows(prev => ({ ...prev, [shiftId]: true }));
    try {
      const res = await updateShiftPaidMonth(shiftId, value || null);
      if (res.success) {
        setShifts(prev =>
          prev.map(s => (s.id === shiftId ? { ...s, paid_month: value || null } : s))
        );
        toast.success('Mes de pago actualizado.');
      } else {
        toast.error(`Error al guardar: ${res.error}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setSavingRows(prev => ({ ...prev, [shiftId]: false }));
    }
  };

  const handleUpdateTransportPaidMonth = async (transportId: string, value: string) => {
    setSavingRows(prev => ({ ...prev, [transportId]: true }));
    try {
      const res = await updateTransportPaidMonth(transportId, value || null);
      if (res.success) {
        setTransports(prev =>
          prev.map(t => (t.id === transportId ? { ...t, paid_month: value || null } : t))
        );
        toast.success('Mes de pago actualizado.');
      } else {
        toast.error(`Error al guardar: ${res.error}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setSavingRows(prev => ({ ...prev, [transportId]: false }));
    }
  };

  const toggleShiftSelection = (personnelId: string, shiftId: string) => {
    setSelectedShifts(prev => {
      const current = prev[personnelId] || [];
      const updated = current.includes(shiftId)
        ? current.filter(id => id !== shiftId)
        : [...current, shiftId];
      return { ...prev, [personnelId]: updated };
    });
  };

  const toggleTransportSelection = (personnelId: string, transportId: string) => {
    setSelectedTransports(prev => {
      const current = prev[personnelId] || [];
      const updated = current.includes(transportId)
        ? current.filter(id => id !== transportId)
        : [...current, transportId];
      return { ...prev, [personnelId]: updated };
    });
  };

  const toggleAllShifts = (personnelId: string, personShifts: any[]) => {
    const allIds = personShifts.map(s => s.id);
    setSelectedShifts(prev => {
      const current = prev[personnelId] || [];
      const areAllSelected = allIds.length > 0 && allIds.every(id => current.includes(id));
      const updated = areAllSelected ? [] : allIds;
      return { ...prev, [personnelId]: updated };
    });
  };

  const toggleAllTransports = (personnelId: string, personTransports: any[]) => {
    const allIds = personTransports.map(t => t.id);
    setSelectedTransports(prev => {
      const current = prev[personnelId] || [];
      const areAllSelected = allIds.length > 0 && allIds.every(id => current.includes(id));
      const updated = areAllSelected ? [] : allIds;
      return { ...prev, [personnelId]: updated };
    });
  };

  const handleBulkUpdate = async (personnelId: string) => {
    const month = bulkMonths[personnelId];
    if (!month) {
      toast.error('Por favor, selecciona un mes para aplicar.');
      return;
    }

    const shiftIds = selectedShifts[personnelId] || [];
    const transportIds = selectedTransports[personnelId] || [];

    if (shiftIds.length === 0 && transportIds.length === 0) {
      toast.error('No has seleccionado ningún turno o transporte para actualizar.');
      return;
    }

    setSavingRows(prev => {
      const next = { ...prev };
      shiftIds.forEach(id => { next[id] = true; });
      transportIds.forEach(id => { next[id] = true; });
      return next;
    });

    try {
      const res = await bulkUpdatePaidMonth(shiftIds, transportIds, month);
      if (res.success) {
        setShifts(prev =>
          prev.map(s => (shiftIds.includes(s.id) ? { ...s, paid_month: month } : s))
        );
        setTransports(prev =>
          prev.map(t => (transportIds.includes(t.id) ? { ...t, paid_month: month } : t))
        );
        
        // Clear selection after update
        setSelectedShifts(prev => ({ ...prev, [personnelId]: [] }));
        setSelectedTransports(prev => ({ ...prev, [personnelId]: [] }));
        
        toast.success(`Se aplicó el mes de pago "${month}" a los registros seleccionados.`);
      } else {
        toast.error(`Error al guardar en lote: ${res.error}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setSavingRows(prev => {
        const next = { ...prev };
        shiftIds.forEach(id => { next[id] = false; });
        transportIds.forEach(id => { next[id] = false; });
        return next;
      });
    }
  };

  // Helper to format currency
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(val);
  };

  // Helper to format month name for display
  const formatMonthName = (monthStr: string | null | undefined) => {
    if (!monthStr) return 'Pendiente';
    try {
      const date = parseISO(`${monthStr}-01`);
      return format(date, 'MMMM yyyy', { locale: es }).toUpperCase();
    } catch (_) {
      return monthStr;
    }
  };

  const handleDownloadExcel = () => {
    try {
      const excelData = groupedList.map(person => {
        const shiftVal = person.shiftsCount * 40000;
        const transportVal = person.transportsCount * 14000;
        const totalVal = shiftVal + transportVal;

        return {
          'Colaborador': `${person.first_name} ${person.last_name_father} ${person.last_name_mother}`.toUpperCase(),
          'RUT': person.rut,
          'Empresa': person.companyName,
          'Cant. Turnos': person.shiftsCount,
          'Valor Turnos': shiftVal,
          'Cant. Transportes': person.transportsCount,
          'Valor Transportes': transportVal,
          'Total Líquido': totalVal
        };
      });

      // Add Grand Totals row
      const totalShifts = groupedList.reduce((acc, p) => acc + p.shiftsCount, 0);
      const totalShiftVal = totalShifts * 40000;
      const totalTransports = groupedList.reduce((acc, p) => acc + p.transportsCount, 0);
      const totalTransportVal = totalTransports * 14000;
      const grandTotal = totalShiftVal + totalTransportVal;

      excelData.push({
        'Colaborador': 'TOTAL GENERAL',
        'RUT': '',
        'Empresa': '',
        'Cant. Turnos': totalShifts,
        'Valor Turnos': totalShiftVal,
        'Cant. Transportes': totalTransports,
        'Valor Transportes': totalTransportVal,
        'Total Líquido': grandTotal
      });

      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Liquidación Bonos');

      // Adjust column widths automatically
      const maxColWidths = [
        { wch: 35 }, // Colaborador
        { wch: 15 }, // RUT
        { wch: 20 }, // Empresa
        { wch: 12 }, // Cant. Turnos
        { wch: 15 }, // Valor Turnos
        { wch: 16 }, // Cant. Transportes
        { wch: 18 }, // Valor Transportes
        { wch: 18 }  // Total Líquido
      ];
      ws['!cols'] = maxColWidths;

      const fileName = `Reporte_Liquidacion_Bonos_${from}_al_${to}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success('Excel descargado con éxito.');
    } catch (err: any) {
      toast.error(`Error al exportar Excel: ${err.message}`);
    }
  };

  // Helper to group shifts and transports by personnel
  const getGroupedData = () => {
    const grouped: Record<string, {
      id: string;
      first_name: string;
      last_name_father: string;
      last_name_mother: string;
      rut: string;
      companyName: string;
      shifts: any[];
      transports: any[];
    }> = {};

    shifts.forEach(s => {
      const p = s.personnel;
      if (!p) return;
      if (!grouped[p.id]) {
        grouped[p.id] = {
          id: p.id,
          first_name: p.first_name,
          last_name_father: p.last_name_father,
          last_name_mother: p.last_name_mother || '',
          rut: p.rut,
          companyName: p.company?.name || 'Sin Empresa',
          shifts: [],
          transports: []
        };
      }
      grouped[p.id].shifts.push(s);
    });

    transports.forEach(t => {
      const p = t.personnel;
      if (!p) return;
      if (!grouped[p.id]) {
        grouped[p.id] = {
          id: p.id,
          first_name: p.first_name,
          last_name_father: p.last_name_father,
          last_name_mother: p.last_name_mother || '',
          rut: p.rut,
          companyName: p.company?.name || 'Sin Empresa',
          shifts: [],
          transports: []
        };
      }
      grouped[p.id].transports.push(t);
    });

    // Extract unique payment months from database data for filter selection
    const uniqueMonths = new Set<string>();
    shifts.forEach(s => { if (s.paid_month) uniqueMonths.add(s.paid_month); });
    transports.forEach(t => { if (t.paid_month) uniqueMonths.add(t.paid_month); });
    const sortedUniqueMonths = Array.from(uniqueMonths).sort();

    // Map, Filter, and Sort the grouped data
    const groupedList = Object.values(grouped)
      .map(p => {
        // Filter shifts by payment status
        const filteredShifts = p.shifts.filter(s => {
          if (paymentStatus === 'pendientes') return !s.paid_month;
          if (paymentStatus === 'pagados') return !!s.paid_month;
          if (paymentStatus !== 'todos' && paymentStatus !== '') {
            return s.paid_month === paymentStatus;
          }
          return true;
        });

        // Filter transports by payment status
        const filteredTransports = p.transports.filter(t => {
          if (paymentStatus === 'pendientes') return !t.paid_month;
          if (paymentStatus === 'pagados') return !!t.paid_month;
          if (paymentStatus !== 'todos' && paymentStatus !== '') {
            return t.paid_month === paymentStatus;
          }
          return true;
        });

        return {
          ...p,
          shifts: filteredShifts,
          transports: filteredTransports,
          shiftsCount: filteredShifts.length,
          transportsCount: filteredTransports.length,
          totalCount: filteredShifts.length + filteredTransports.length
        };
      })
      .filter(p => p.totalCount > 0)
      .sort((a, b) => a.last_name_father.localeCompare(b.last_name_father));

    // Filter by search query (name or RUT)
    const filteredGroupedList = groupedList.filter(p => {
      const fullName = `${p.first_name} ${p.last_name_father} ${p.last_name_mother}`.toLowerCase();
      const cleanSearch = searchQuery.toLowerCase();
      return fullName.includes(cleanSearch) || p.rut.toLowerCase().includes(cleanSearch);
    });

    return {
      groupedList: filteredGroupedList,
      availableMonths: sortedUniqueMonths
    };
  };

  const { groupedList, availableMonths } = getGroupedData();

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20">
      
      {/* Dynamic CSS Print Overrides */}
      <style dangerouslySetInnerHTML={{ __html: `
        @page {
          size: ${reportView === 'summary' ? 'landscape' : 'portrait'};
          margin: 8mm;
        }
        @media print {
          /* Hide standard dashboard chrome */
          aside, nav, header, [data-sidebar], .no-print {
            display: none !important;
          }
          /* Reset root wrappers */
          body, html, main, div.flex.h-screen, .h-screen {
            background: white !important;
            color: black !important;
            height: auto !important;
            overflow: visible !important;
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          /* Page break per person wrapper */
          .page-break {
            page-break-after: always !important;
            break-after: page !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 0 20px 0 !important;
            background: white !important;
            display: block !important;
          }
          /* Hide printing elements that look like inputs */
          .print-text-only {
            display: inline-block !important;
          }
          .print-hidden-input {
            display: none !important;
          }
          /* Compact table layouts in print */
          table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          th, td {
            padding: 4px 6px !important;
            font-size: 11px !important;
            border: 1px solid #cbd5e1 !important;
          }
          th {
            background-color: #f1f5f9 !important;
            color: #0f172a !important;
            font-weight: 700 !important;
          }
          .print-card-flat {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
          }
        }
      ` }} />

      {/* FILTER BAR (no-print) */}
      <Card className="no-print border-slate-200 shadow-sm bg-white dark:bg-slate-900">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-lg font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
            Filtros del Reporte de Liquidaciones
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="space-y-1.5">
              <Label htmlFor="from-date" className="text-xs font-semibold text-slate-500">Fecha Desde</Label>
              <Input
                id="from-date"
                type="date"
                value={from}
                onChange={e => setFrom(e.target.value)}
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="to-date" className="text-xs font-semibold text-slate-500">Fecha Hasta</Label>
              <Input
                id="to-date"
                type="date"
                value={to}
                onChange={e => setTo(e.target.value)}
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="company-select" className="text-xs font-semibold text-slate-500">Empresa / Cliente</Label>
              <select
                id="company-select"
                value={companyId}
                onChange={e => setCompanyId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950"
              >
                <option value="">Todas las empresas</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="status-select" className="text-xs font-semibold text-slate-500">Estado de Pago</Label>
              <select
                id="status-select"
                value={paymentStatus}
                onChange={e => setPaymentStatus(e.target.value)}
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950"
              >
                <option value="todos">Todos los registros</option>
                <option value="pendientes">Solo Pendientes</option>
                <option value="pagados">Solo Liquidados (Cualquier mes)</option>
                {availableMonths.map(m => (
                  <option key={m} value={m}>Liquidado en {formatMonthName(m)}</option>
                ))}
              </select>
            </div>

          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <div className="relative w-full max-w-sm sm:w-[260px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  type="search"
                  placeholder="Buscar por colaborador o RUT..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-850 p-0.5 rounded-lg border border-slate-200/60 dark:border-slate-800/40 no-print">
                <Button
                  type="button"
                  size="sm"
                  variant={reportView === 'detailed' ? 'secondary' : 'ghost'}
                  onClick={() => setReportView('detailed')}
                  className={cn(
                    "h-7 text-xs px-3 font-bold rounded-md transition-all",
                    reportView === 'detailed' ? "bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 shadow-sm border border-slate-200/20" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  )}
                >
                  Detallado
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={reportView === 'summary' ? 'secondary' : 'ghost'}
                  onClick={() => setReportView('summary')}
                  className={cn(
                    "h-7 text-xs px-3 font-bold rounded-md transition-all",
                    reportView === 'summary' ? "bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 shadow-sm border border-slate-200/20" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  )}
                >
                  Resumido
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSearch}
                disabled={loading || isPending}
                className="h-9 border-slate-200 text-slate-600 hover:text-slate-900"
              >
                {loading || isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Actualizar Filtros
              </Button>

              <Button
                size="sm"
                onClick={() => window.print()}
                disabled={groupedList.length === 0}
                className="h-9 bg-orange-600 text-white hover:bg-orange-700"
              >
                <Printer className="h-4 w-4 mr-2" />
                Imprimir Reporte
              </Button>

              <Button
                size="sm"
                onClick={handleDownloadExcel}
                disabled={groupedList.length === 0}
                className="h-9 bg-emerald-600 text-white hover:bg-emerald-700 no-print"
              >
                <Download className="h-4 w-4 mr-2" />
                Descargar Excel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* REPORT CONTENT */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 space-y-3">
          <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
          <p className="text-sm">Buscando y agrupando liquidaciones...</p>
        </div>
      ) : groupedList.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200 dark:border-slate-800">
          <CardContent className="py-16 text-center text-slate-500 flex flex-col items-center justify-center space-y-2">
            <AlertCircle className="w-8 h-8 text-slate-400" />
            <p className="font-medium text-slate-600 dark:text-slate-400">No se encontraron registros de turnos extras o transportes propios.</p>
            <p className="text-xs text-slate-400">Asegúrate de ajustar el rango de fechas u otros filtros.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-10">
          {reportView === 'summary' ? (
            <Card className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-200 print-card-flat">
              <CardHeader className="px-0 pt-0 pb-4 border-b border-slate-100 dark:border-slate-850 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight leading-tight">
                    Resumen de Liquidación de Bonos
                  </CardTitle>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-slate-500 font-medium">
                    <span>Período: <strong className="text-slate-700 dark:text-slate-300 font-bold">{format(parseISO(from), 'dd/MM/yyyy')}</strong> al <strong className="text-slate-700 dark:text-slate-300 font-bold">{format(parseISO(to), 'dd/MM/yyyy')}</strong></span>
                  </div>
                </div>
                <div className="text-right text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  Reporte Resumido
                </div>
              </CardHeader>
              <CardContent className="px-0 pt-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/60 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200 dark:border-slate-800">
                        <th className="px-4 py-2.5 border-r border-slate-200 dark:border-slate-800">Colaborador</th>
                        <th className="px-4 py-2.5 border-r border-slate-200 dark:border-slate-800">RUT</th>
                        <th className="px-4 py-2.5 border-r border-slate-200 dark:border-slate-800">Empresa</th>
                        <th className="px-4 py-2.5 text-center border-r border-slate-200 dark:border-slate-800">Turnos</th>
                        <th className="px-4 py-2.5 text-right border-r border-slate-200 dark:border-slate-800">Valor Turnos</th>
                        <th className="px-4 py-2.5 text-center border-r border-slate-200 dark:border-slate-800">Transportes</th>
                        <th className="px-4 py-2.5 text-right border-r border-slate-200 dark:border-slate-800">Valor Transp.</th>
                        <th className="px-4 py-2.5 text-right">Total a Pago</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-900 text-xs">
                      {groupedList.map((person) => {
                        const shiftVal = person.shiftsCount * 40000;
                        const transportVal = person.transportsCount * 14000;
                        const totalVal = shiftVal + transportVal;

                        return (
                          <tr key={person.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10 transition-colors">
                            <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100 uppercase border-r border-slate-100 dark:border-slate-900">
                              {person.first_name} {person.last_name_father} {person.last_name_mother}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400 border-r border-slate-100 dark:border-slate-900">
                              {person.rut}
                            </td>
                            <td className="px-4 py-3 border-r border-slate-100 dark:border-slate-900 text-slate-600 dark:text-slate-400">
                              {person.companyName}
                            </td>
                            <td className="px-4 py-3 text-center font-bold border-r border-slate-100 dark:border-slate-900">
                              {person.shiftsCount}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-900">
                              {formatCurrency(shiftVal)}
                            </td>
                            <td className="px-4 py-3 text-center font-bold border-r border-slate-100 dark:border-slate-900">
                              {person.transportsCount}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-900">
                              {formatCurrency(transportVal)}
                            </td>
                            <td className="px-4 py-3 text-right font-black text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(totalVal)}
                            </td>
                          </tr>
                        );
                      })}
                      
                      {/* Totales Generales */}
                      <tr className="bg-slate-50 dark:bg-slate-900 font-bold border-t border-slate-200 dark:border-slate-800 text-xs">
                        <td colSpan={3} className="px-4 py-3 text-right uppercase tracking-wider text-slate-500 border-r border-slate-200 dark:border-slate-800">
                          Totales Generales:
                        </td>
                        <td className="px-4 py-3 text-center border-r border-slate-200 dark:border-slate-800">
                          {groupedList.reduce((acc, p) => acc + p.shiftsCount, 0)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono border-r border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                          {formatCurrency(groupedList.reduce((acc, p) => acc + p.shiftsCount * 40000, 0))}
                        </td>
                        <td className="px-4 py-3 text-center border-r border-slate-200 dark:border-slate-800">
                          {groupedList.reduce((acc, p) => acc + p.transportsCount, 0)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono border-r border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                          {formatCurrency(groupedList.reduce((acc, p) => acc + p.transportsCount * 14000, 0))}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400 text-sm">
                          {formatCurrency(groupedList.reduce((acc, p) => acc + (p.shiftsCount * 40000 + p.transportsCount * 14000), 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            groupedList.map((person, index) => {
              const shiftVal = person.shiftsCount * 40000;
              const transportVal = person.transportsCount * 14000;
              const totalVal = shiftVal + transportVal;

              const selectedShiftsCount = (selectedShifts[person.id] || []).length;
              const selectedTransportsCount = (selectedTransports[person.id] || []).length;
              const totalSelected = selectedShiftsCount + selectedTransportsCount;

              return (
                <div
                  key={person.id}
                  className={cn(
                    "bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-200 page-break",
                    index < groupedList.length - 1 && "print:break-after-page"
                  )}
                >
                  {/* 1. Header del Reporte */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-4">
                    <div>
                      <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight leading-tight">
                        {person.first_name} {person.last_name_father} {person.last_name_mother}
                      </h2>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-slate-500 font-medium">
                        <span>RUT: <strong className="text-slate-700 dark:text-slate-300 font-bold">{person.rut}</strong></span>
                        <span className="hidden md:inline text-slate-300">|</span>
                        <span>Empresa: <strong className="text-slate-700 dark:text-slate-300 font-bold">{person.companyName}</strong></span>
                      </div>
                    </div>
                    <div className="text-left md:text-right font-medium text-xs text-slate-500">
                      <div>Período: <strong>{format(parseISO(from), 'dd/MM/yyyy')}</strong> al <strong>{format(parseISO(to), 'dd/MM/yyyy')}</strong></div>
                      <div className="mt-0.5 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Liquidación de Bonos</div>
                    </div>
                  </div>

                  {/* 2. Resumen de Pago (Arriba del reporte) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6">
                    
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 flex items-start gap-3">
                      <div className="p-2 bg-orange-50 dark:bg-orange-950/30 rounded-lg text-orange-600 dark:text-orange-400">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Turnos a Pago</div>
                        <div className="text-lg font-black text-slate-800 dark:text-slate-100 mt-0.5">
                          {person.shiftsCount} <span className="text-xs font-medium text-slate-400">c/u</span>
                        </div>
                        <div className="text-xs font-bold text-orange-600 dark:text-orange-400 mt-0.5">
                          {formatCurrency(shiftVal)} <span className="text-[9px] text-slate-400 dark:text-slate-500 font-normal">({person.shiftsCount} x $40.000)</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 flex items-start gap-3">
                      <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                        <Landmark className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Transportes Nocturnos</div>
                        <div className="text-lg font-black text-slate-800 dark:text-slate-100 mt-0.5">
                          {person.transportsCount} <span className="text-xs font-medium text-slate-400">c/u</span>
                        </div>
                        <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                          {formatCurrency(transportVal)} <span className="text-[9px] text-slate-400 dark:text-slate-500 font-normal">({person.transportsCount} x $14.000)</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/20 dark:bg-emerald-950/10 flex items-start gap-3 sm:col-span-1">
                      <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-600 dark:text-emerald-400 animate-pulse">
                        <DollarSign className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Líquido a Pago</div>
                        <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                          {formatCurrency(totalVal)}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 font-medium">Bono total acumulado</div>
                      </div>
                    </div>

                  </div>

                  {/* 3. Bulk Month Update (no-print) */}
                  <div className="no-print bg-slate-50 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-800/80 p-3 rounded-lg flex flex-wrap items-center justify-between gap-4 mb-6 transition-all">
                    <div className="flex items-center gap-2">
                      <Landmark className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Acción en lote:</span>
                      <span className="text-xs text-slate-500">
                        {totalSelected > 0 
                          ? `Aplicar mes a los ${totalSelected} registros seleccionados (${selectedShiftsCount} turnos, ${selectedTransportsCount} transportes)` 
                          : 'Selecciona registros con las casillas de la tabla para aplicar acción en lote'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="month"
                        value={bulkMonths[person.id] || ''}
                        onChange={e => setBulkMonths(prev => ({ ...prev, [person.id]: e.target.value }))}
                        className="h-8 text-xs w-[140px]"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleBulkUpdate(person.id)}
                        disabled={totalSelected === 0}
                        className="h-8 text-xs bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-40"
                      >
                        Aplicar a Seleccionados
                      </Button>
                    </div>
                  </div>

                  {/* 4. Tabla de Turnos (NEVER use the word "extra") */}
                  {person.shiftsCount > 0 && (
                    <div className="mb-6 space-y-2">
                      <h3 className="text-xs font-black text-slate-900 dark:text-slate-200 uppercase tracking-wider border-l-2 border-orange-500 pl-2">
                        Detalle de Turnos
                      </h3>
                      <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-950">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200 dark:border-slate-800">
                              <th className="px-3 py-2 w-[40px] text-center no-print border-r border-slate-200 dark:border-slate-800">
                                <input
                                  type="checkbox"
                                  checked={person.shifts.length > 0 && (selectedShifts[person.id] || []).length === person.shifts.length}
                                  onChange={() => toggleAllShifts(person.id, person.shifts)}
                                  className="rounded border-slate-350 focus:ring-0 cursor-pointer h-3.5 w-3.5 text-orange-600"
                                />
                              </th>
                              <th className="px-4 py-2 border-r border-slate-200 dark:border-slate-800">Fecha</th>
                              <th className="px-4 py-2 border-r border-slate-200 dark:border-slate-800">Turno</th>
                              <th className="px-4 py-2 border-r border-slate-200 dark:border-slate-800">Horario</th>
                              <th className="px-4 py-2 border-r border-slate-200 dark:border-slate-800">Ubicación (Área / Puesto)</th>
                              <th className="px-4 py-2 w-[180px]">Mes de Pago</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-900 text-xs">
                            {person.shifts.map((s: any) => {
                              const isSaving = savingRows[s.id];
                              const isSelected = (selectedShifts[person.id] || []).includes(s.id);
                              return (
                                <tr key={s.id} className={cn(
                                  "hover:bg-slate-50/50 dark:hover:bg-slate-900/10 transition-colors",
                                  isSelected && "bg-orange-50/20 dark:bg-orange-950/5"
                                )}>
                                  <td className="px-3 py-2 text-center no-print border-r border-slate-100 dark:border-slate-900">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleShiftSelection(person.id, s.id)}
                                      disabled={isSaving}
                                      className="rounded border-slate-350 focus:ring-0 cursor-pointer h-3.5 w-3.5 text-orange-600"
                                    />
                                  </td>
                                  <td className="px-4 py-2 font-medium capitalize border-r border-slate-100 dark:border-slate-900">
                                    {format(parseISO(s.date), "eeee dd/MM/yyyy", { locale: es })}
                                  </td>
                                  <td className="px-4 py-2 font-semibold text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-900">
                                    {s.shift?.name}
                                  </td>
                                  <td className="px-4 py-2 font-mono text-[10px] text-slate-500 border-r border-slate-100 dark:border-slate-900">
                                    {s.shift?.start_time?.substring(0, 5)} - {s.shift?.end_time?.substring(0, 5)}
                                  </td>
                                  <td className="px-4 py-2 border-r border-slate-100 dark:border-slate-900 text-slate-600 dark:text-slate-400">
                                    <strong>{s.area?.name || 'N/A'}</strong>
                                    <span className="text-slate-300 mx-1.5">/</span>
                                    <span>{s.position?.name || 'N/A'}</span>
                                  </td>
                                  <td className="px-4 py-1.5 flex items-center justify-between gap-2 h-9">
                                    {/* Print Mode Text */}
                                    <span className="hidden print-text-only text-xs font-bold text-slate-700 dark:text-slate-300">
                                      {formatMonthName(s.paid_month)}
                                    </span>

                                    {/* Interactive Input (no-print) */}
                                    <div className="flex items-center gap-1 w-full print-hidden-input">
                                      <Input
                                        type="month"
                                        value={s.paid_month || ''}
                                        onChange={e => handleUpdateShiftPaidMonth(s.id, e.target.value)}
                                        disabled={isSaving}
                                        className="h-7 text-xs flex-grow py-0 px-2"
                                      />
                                      {isSaving ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                                      ) : s.paid_month ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                                      ) : null}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 5. Tabla de Transportes (Llamado Transporte Nocturno) */}
                  {person.transportsCount > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-black text-slate-900 dark:text-slate-200 uppercase tracking-wider border-l-2 border-indigo-500 pl-2">
                        Detalle de Transportes Nocturnos
                      </h3>
                      <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-950">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200 dark:border-slate-800">
                              <th className="px-3 py-2 w-[40px] text-center no-print border-r border-slate-200 dark:border-slate-800">
                                <input
                                  type="checkbox"
                                  checked={person.transports.length > 0 && (selectedTransports[person.id] || []).length === person.transports.length}
                                  onChange={() => toggleAllTransports(person.id, person.transports)}
                                  className="rounded border-slate-350 focus:ring-0 cursor-pointer h-3.5 w-3.5 text-orange-600"
                                />
                              </th>
                              <th className="px-4 py-2 border-r border-slate-200 dark:border-slate-800">Fecha</th>
                              <th className="px-4 py-2 border-r border-slate-200 dark:border-slate-800">Concepto</th>
                              <th className="px-4 py-2 border-r border-slate-200 dark:border-slate-800">Tipo</th>
                              <th className="px-4 py-2 border-r border-slate-200 dark:border-slate-800">Turno Asociado (Horario / Ubicación)</th>
                              <th className="px-4 py-2 w-[180px]">Mes de Pago</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-900 text-xs">
                            {person.transports.map((t: any) => {
                              const isSaving = savingRows[t.id];
                              const isSelected = (selectedTransports[person.id] || []).includes(t.id);
                              const asg = t.assignment || {};
                              return (
                                <tr key={t.id} className={cn(
                                  "hover:bg-slate-50/50 dark:hover:bg-slate-900/10 transition-colors",
                                  isSelected && "bg-indigo-50/20 dark:bg-indigo-950/5"
                                )}>
                                  <td className="px-3 py-2 text-center no-print border-r border-slate-100 dark:border-slate-900">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleTransportSelection(person.id, t.id)}
                                      disabled={isSaving}
                                      className="rounded border-slate-350 focus:ring-0 cursor-pointer h-3.5 w-3.5 text-orange-600"
                                    />
                                  </td>
                                  <td className="px-4 py-2 font-medium capitalize border-r border-slate-100 dark:border-slate-900">
                                    {format(parseISO(t.date), "eeee dd/MM/yyyy", { locale: es })}
                                  </td>
                                  <td className="px-4 py-2 font-bold text-indigo-700 dark:text-indigo-400 border-r border-slate-100 dark:border-slate-900">
                                    Transporte Nocturno
                                  </td>
                                  <td className="px-4 py-2 border-r border-slate-100 dark:border-slate-900">
                                    <span className={cn(
                                      "px-1.5 py-0.5 rounded text-[10px] font-bold",
                                      t.type === 'ENTRADA' ? "bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400" : "bg-purple-50 text-purple-700 dark:bg-purple-950/20 dark:text-purple-400"
                                    )}>
                                      {t.type === 'ENTRADA' ? 'Ingreso (Entrada)' : 'Egreso (Salida)'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2 border-r border-slate-100 dark:border-slate-900 text-slate-600 dark:text-slate-400">
                                    {asg.shift ? (
                                      <>
                                        <strong className="text-slate-700 dark:text-slate-300 font-bold">{asg.shift.name}</strong>
                                        <span className="font-mono text-[10px] text-slate-500 ml-1.5">({asg.shift.start_time?.substring(0, 5)} - {asg.shift.end_time?.substring(0, 5)})</span>
                                        <span className="text-slate-300 mx-1.5">/</span>
                                        <strong>{asg.area?.name || 'N/A'}</strong>
                                        <span className="text-slate-300 mx-1">/</span>
                                        <span>{asg.position?.name || 'N/A'}</span>
                                      </>
                                    ) : (
                                      <span className="text-slate-400 italic">Sin turno registrado</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-1.5 flex items-center justify-between gap-2 h-9">
                                    {/* Print Mode Text */}
                                    <span className="hidden print-text-only text-xs font-bold text-slate-700 dark:text-slate-300">
                                      {formatMonthName(t.paid_month)}
                                    </span>

                                    {/* Interactive Input (no-print) */}
                                    <div className="flex items-center gap-1 w-full print-hidden-input">
                                      <Input
                                        type="month"
                                        value={t.paid_month || ''}
                                        onChange={e => handleUpdateTransportPaidMonth(t.id, e.target.value)}
                                        disabled={isSaving}
                                        className="h-7 text-xs flex-grow py-0 px-2"
                                      />
                                      {isSaving ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                                      ) : t.paid_month ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                                      ) : null}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
