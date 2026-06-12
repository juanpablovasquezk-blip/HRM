'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, Search, FileSpreadsheet, Loader2, Award, AlertCircle, FileDown, Eye } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { format, subDays } from 'date-fns';
import { createClient } from '@/lib/supabase/client';

interface Company {
  id: string;
  name: string;
}

interface LetterRecord {
  id: string;
  type: 'FELICITACION' | 'AMONESTACION';
  date: string;
  reason: string;
  file_url: string | null;
  personnel: {
    first_name: string;
    last_name_father: string;
    rut: string;
    company: {
      name: string;
    } | null;
  };
}

export default function WarningsReportPage() {
  const supabase = createClient();

  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [records, setRecords] = useState<LetterRecord[]>([]);
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
        .from('personnel_letters')
        .select(`
          id,
          type,
          date,
          reason,
          file_url,
          personnel:personnel!inner(
            id,
            first_name,
            last_name_father,
            rut,
            company_id,
            company:companies(name)
          )
        `)
        .gte('date', startDate)
        .lte('date', endDate);

      if (selectedCompanyId !== 'all') {
        query = query.eq('personnel.company_id', selectedCompanyId);
      }

      if (selectedType !== 'all') {
        query = query.eq('type', selectedType);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (!data || data.length === 0) {
        setRecords([]);
        toast.info('No se encontraron cartas en el rango seleccionado');
        return;
      }

      const sorted = (data as unknown as LetterRecord[]).sort((a, b) => b.date.localeCompare(a.date));
      setRecords(sorted);
      toast.success(`Se encontraron ${sorted.length} registros`);
    } catch (error: any) {
      console.error('Error fetching letters:', error);
      toast.error('Error al consultar cartas de personal: ' + error.message);
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
        'Fecha Registro': r.date,
        'Tipo': r.type === 'FELICITACION' ? 'Felicitación' : 'Amonestación',
        'Colaborador': `${r.personnel.first_name} ${r.personnel.last_name_father}`,
        'RUT': r.personnel.rut,
        'Empresa': r.personnel.company ? r.personnel.company.name : 'N/A',
        'Motivo / Descripción': r.reason,
        'URL Archivo Adjunto': r.file_url || 'Sin archivo adjunto'
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Cartas de Personal');

      const maxLens = Object.keys(exportData[0]).map(key => {
        let maxLen = key.length;
        exportData.forEach(row => {
          const val = row[key as keyof typeof row] || '';
          maxLen = Math.max(maxLen, String(val).length);
        });
        return { wch: Math.min(maxLen + 3, 50) }; // cap column width at 50 chars for readability
      });
      ws['!cols'] = maxLens;

      const fileName = `Reporte_Cartas_Personal_${startDate}_al_${endDate}.xlsx`;
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
          <Award className="h-6 w-6 text-indigo-600" />
          Reporte de Amonestaciones y Felicitaciones
        </h1>
        <p className="text-slate-500 text-sm">Consulta y exporta el registro de amonestaciones y felicitaciones de personal</p>
      </div>

      {/* Filters Bar */}
      <Card className="rounded-3xl border-slate-200 shadow-sm overflow-hidden border">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
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
                className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 h-9"
              >
                <option value="all">Todas las empresas</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="type-select" className="text-[10px] font-black uppercase text-slate-500 ml-1">Tipo de Registro</Label>
              <select
                id="type-select"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 h-9"
              >
                <option value="all">Amonestaciones y Felicitaciones</option>
                <option value="AMONESTACION">Solo Amonestaciones</option>
                <option value="FELICITACION">Solo Felicitaciones</option>
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
              <span className="text-sm font-semibold">Cargando registros...</span>
            </div>
          ) : records.length === 0 ? (
            <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <AlertCircle className="h-8 w-8 text-slate-300" />
              <span className="text-sm">No hay registros de cartas de personal en este período.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Fecha</TableHead>
                    <TableHead className="w-[120px]">Tipo</TableHead>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead className="max-w-[300px]">Motivo / Descripción</TableHead>
                    <TableHead className="text-right">Archivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r) => {
                    const employeeName = `${r.personnel.first_name} ${r.personnel.last_name_father}`;
                    const companyName = r.personnel.company ? r.personnel.company.name : 'N/A';

                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-semibold">{r.date}</TableCell>
                        <TableCell>
                          <Badge className={
                            r.type === 'FELICITACION'
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100/80 font-bold text-[10px] uppercase'
                              : 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 hover:bg-rose-100/80 font-bold text-[10px] uppercase'
                          }>
                            {r.type === 'FELICITACION' ? 'Felicitación' : 'Amonestación'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-bold text-slate-800">{employeeName}</TableCell>
                        <TableCell>{companyName}</TableCell>
                        <TableCell className="text-xs text-slate-600 max-w-[300px] truncate" title={r.reason}>
                          {r.reason}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.file_url ? (
                            <a href={r.file_url} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-orange-600 hover:bg-orange-50 rounded-xl" title="Ver Documento">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400 italic">N/A</span>
                          )}
                        </TableCell>
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
