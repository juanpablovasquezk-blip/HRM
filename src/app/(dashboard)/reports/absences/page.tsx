'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, Search, FileSpreadsheet, Loader2, Calendar, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { format, subDays, parseISO } from 'date-fns';
import { createClient } from '@/lib/supabase/client';

interface Company {
  id: string;
  name: string;
}

interface AbsenceRecord {
  id: string;
  date: string;
  attendance_comment: string | null;
  attendance_updated_by: string | null;
  personnel: {
    first_name: string;
    last_name_father: string;
    rut: string;
    company: {
      name: string;
    } | null;
  };
  shift: {
    name: string;
    start_time: string;
    end_time: string;
  } | null;
  area: {
    name: string;
  } | null;
  position: {
    name: string;
  } | null;
  supervisorName?: string;
}

export default function AbsencesReportPage() {
  const supabase = createClient();

  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('all');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [records, setRecords] = useState<AbsenceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Load companies on mount
  useEffect(() => {
    async function loadCompanies() {
      const { data, error } = await supabase.from('companies').select('id, name').order('name');
      if (!error && data) {
        setCompanies(data);
      }
    }
    loadCompanies();
  }, []);

  const handleSearch = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('shift_assignments')
        .select(`
          id,
          date,
          attendance_comment,
          attendance_updated_by,
          personnel:personnel!inner(
            first_name,
            last_name_father,
            rut,
            company_id,
            company:companies(name)
          ),
          shift:shifts(name, start_time, end_time),
          area:areas(name),
          position:positions(name)
        `)
        .eq('attendance_status', 'absent')
        .gte('date', startDate)
        .lte('date', endDate);

      if (selectedCompanyId !== 'all') {
        query = query.eq('personnel.company_id', selectedCompanyId);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (!data || data.length === 0) {
        setRecords([]);
        toast.info('No se encontraron inasistencias en el rango seleccionado');
        return;
      }

      // Fetch unique supervisor names
      const supervisorIds = Array.from(new Set(
        data.map(d => d.attendance_updated_by).filter(Boolean)
      )) as string[];

      const supervisorMap = new Map<string, string>();
      if (supervisorIds.length > 0) {
        const { data: supervisors } = await supabase
          .from('users')
          .select('id, full_name')
          .in('id', supervisorIds);

        supervisors?.forEach(s => {
          supervisorMap.set(s.id, s.full_name || 'Desconocido');
        });
      }

      const formatted = (data as any[]).map(item => ({
        ...item,
        supervisorName: item.attendance_updated_by
          ? (supervisorMap.get(item.attendance_updated_by) || 'Desconocido')
          : 'No registrado'
      }));

      // Sort by date descending
      formatted.sort((a, b) => b.date.localeCompare(a.date));

      setRecords(formatted);
      toast.success(`Se encontraron ${formatted.length} registros`);
    } catch (error: any) {
      console.error('Error fetching absences:', error);
      toast.error('Error al consultar inasistencias: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (records.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }

    setExporting(true);
    try {
      const exportData = records.map(r => ({
        'Fecha Inasistencia': r.date,
        'Colaborador': `${r.personnel.first_name} ${r.personnel.last_name_father}`,
        'RUT': r.personnel.rut,
        'Empresa': r.personnel.company ? r.personnel.company.name : 'N/A',
        'Área': r.area ? r.area.name : 'N/A',
        'Cargo': r.position ? r.position.name : 'N/A',
        'Turno': r.shift ? `${r.shift.name} (${r.shift.start_time.substring(0, 5)} - ${r.shift.end_time.substring(0, 5)})` : 'N/A',
        'Supervisor': r.supervisorName || 'No registrado',
        'Motivo / Observación': r.attendance_comment || 'sin motivo'
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Inasistencias');

      // Set cell widths automatically
      const maxLens = Object.keys(exportData[0]).map(key => {
        let maxLen = key.length;
        exportData.forEach(row => {
          const val = row[key as keyof typeof row] || '';
          maxLen = Math.max(maxLen, String(val).length);
        });
        return { wch: maxLen + 3 };
      });
      ws['!cols'] = maxLens;

      const fileName = `Reporte_Ausencias_${startDate}_al_${endDate}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success('Archivo Excel descargado correctamente');
    } catch (e: any) {
      toast.error('Error al exportar: ' + e.message);
    } finally {
      setExporting(false);
    }
  };

  // Run initial search
  useEffect(() => {
    handleSearch();
  }, []);

  return (
    <div className="space-y-6 max-w-6xl pb-24">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <Calendar className="h-6 w-6 text-rose-600" />
          Reporte de Ausencias (Inasistencias)
        </h1>
        <p className="text-slate-500 text-sm">Consulta y exporta el personal ausente reportado por supervisores</p>
      </div>

      {/* Filters Bar */}
      <Card className="rounded-3xl border-slate-200 shadow-sm overflow-hidden border">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="start-date" className="text-[10px] font-black uppercase text-slate-500 ml-1">Fecha Inicio</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-xl border-slate-200"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="end-date" className="text-[10px] font-black uppercase text-slate-500 ml-1">Fecha Fin</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-xl border-slate-200"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="company-select" className="text-[10px] font-black uppercase text-slate-500 ml-1">Empresa</Label>
              <select
                id="company-select"
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm outline-none focus:ring-2 focus:ring-rose-500 h-9"
              >
                <option value="all">Todas las empresas</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSearch}
                disabled={loading}
                className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl flex-1 h-9"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                Buscar
              </Button>

              <Button
                onClick={handleExport}
                disabled={exporting || records.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-9"
                title="Exportar a Excel"
              >
                <FileSpreadsheet className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card className="rounded-3xl border-slate-200 shadow-sm overflow-hidden border">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-5 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold text-slate-800">Registros Encontrados ({records.length})</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-20 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              <span className="text-sm font-semibold">Cargando ausencias...</span>
            </div>
          ) : records.length === 0 ? (
            <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <AlertCircle className="h-8 w-8 text-slate-300" />
              <span className="text-sm">No hay inasistencias registradas en este período.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Fecha</TableHead>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Área / Cargo</TableHead>
                    <TableHead>Turno</TableHead>
                    <TableHead>Supervisor</TableHead>
                    <TableHead>Motivo / Observación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r) => {
                    const employeeName = `${r.personnel.first_name} ${r.personnel.last_name_father}`;
                    const companyName = r.personnel.company ? r.personnel.company.name : 'N/A';
                    const areaName = r.area ? r.area.name : 'N/A';
                    const positionName = r.position ? r.position.name : 'N/A';
                    const shiftName = r.shift ? `${r.shift.name} (${r.shift.start_time.substring(0, 5)} - ${r.shift.end_time.substring(0, 5)})` : 'N/A';
                    const comment = r.attendance_comment || 'sin motivo';

                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-semibold">{r.date}</TableCell>
                        <TableCell className="font-bold text-slate-800">{employeeName}</TableCell>
                        <TableCell>{companyName}</TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {areaName} <span className="text-slate-300">/</span> {positionName}
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-teal-700">{shiftName}</TableCell>
                        <TableCell className="text-xs font-medium text-slate-700">{r.supervisorName}</TableCell>
                        <TableCell className="text-xs italic bg-rose-50/50 text-rose-700 font-medium">{comment}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
