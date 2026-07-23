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
import { Printer, Search, Loader2, Check, DollarSign, Calendar, Landmark, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
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
  const [isPending, startTransition] = useTransition();

  // Local state for tracking saving status per row
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({});
  
  // Local state for bulk month input per personnel ID
  const [bulkMonths, setBulkMonths] = useState<Record<string, string>>({});

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

  const handleBulkUpdate = async (personnelId: string, personShifts: any[], personTransports: any[]) => {
    const month = bulkMonths[personnelId];
    if (!month) {
      toast.error('Por favor, selecciona un mes para aplicar.');
      return;
    }

    const shiftIds = personShifts.map(s => s.id);
    const transportIds = personTransports.map(t => t.id);

    if (shiftIds.length === 0 && transportIds.length === 0) {
      toast.error('No hay registros para actualizar.');
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
        toast.success(`Se aplicó el mes de pago "${month}" a todos los registros del período.`);
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
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                type="search"
                placeholder="Buscar por colaborador o RUT..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
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
          {groupedList.map((person, index) => {
            const shiftVal = person.shiftsCount * 40000;
            const transportVal = person.transportsCount * 14000;
            const totalVal = shiftVal + transportVal;

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
                <div className="no-print bg-slate-50 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-800/80 p-3 rounded-lg flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Acción en lote:</span>
                    <span className="text-xs text-slate-500">Marcar todo el periodo para esta persona en el mes seleccionado</span>
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
                      onClick={() => handleBulkUpdate(person.id, person.shifts, person.transports)}
                      className="h-8 text-xs bg-slate-800 text-white hover:bg-slate-900"
                    >
                      Aplicar en Lote
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
                            return (
                              <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
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
                            const asg = t.assignment || {};
                            return (
                              <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
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
          })}
        </div>
      )}
    </div>
  );
}
